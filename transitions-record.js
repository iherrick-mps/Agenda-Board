/* ============================================================
   Transition Timer — Firestore recorder.

   Loaded only on agenda.html, after firebase-config.js and the two
   Firebase compat SDK scripts. It defines one global,
   window.recordTransition(), which the count-up timer in script.js
   calls at two moments:

     reason: 'stop'        — Ms. Herrick pressed Stop. The class is
                             settled; this reading IS the transition.
                             Saved immediately so a closed tab or a
                             dead projector can't lose it.
     reason: 'period-end'  — the bell rang and the timer is about to
                             reset. Files the final record for the
                             period that just ended, whether or not
                             Stop was ever pressed.

   Only her three teaching periods are recorded (4th / 6th / 7th);
   the timer still auto-starts at every bell, but 1st period's reading
   is nobody's transition and never reaches the table.

   ---- Document ID ----
   `YYYY-MM-DD_<periodSlug>`, e.g. `2026-09-17_4`. Deterministic on
   purpose: the projector, her laptop, and three stale tabs all write
   to the same row instead of littering the table with duplicates of
   the same class period.

   ---- Who wins when two tabs disagree ----
   A write runs inside a transaction that refuses to overwrite a
   *stopped* record with a *never-stopped* one. So a forgotten tab
   sitting at 48:12 can't clobber the real 1:34 she recorded on the
   board up front. Otherwise the newest write wins.

   Everything here fails soft: no Firebase, no network, bad rules —
   the timer on the wall keeps working exactly as before.
   ============================================================ */

const TRANSITIONS_COLLECTION = 'transitions';

// which bell periods are hers, and what the marquee says for each
const TRANSITION_PERIODS = {
  '4th Period': { slug: '4', grade: '8th Grade' },
  '6th Period': { slug: '6', grade: '7th Grade' },
  '7th Period': { slug: '7', grade: '6th Grade' }
};

let transitionsDb = null;

function transitionsGetDb() {
  if (transitionsDb) return transitionsDb;
  if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') return null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    transitionsDb = firebase.firestore();
    return transitionsDb;
  } catch (e) {
    return null;
  }
}

/* The grade label comes from that day's own JSON file when there is one
   (so a day where 6th period is actually 8th graders still reads right),
   falling back to the standing assignment above. Cached per date — this
   runs at most a few times a day. */
const transitionsDayCache = new Map();

async function transitionsDayData(dateStr) {
  if (transitionsDayCache.has(dateStr)) return transitionsDayCache.get(dateStr);
  let data = null;
  try {
    const res = await fetch(`data/${dateStr}.json`);
    if (res.ok) data = await res.json();
  } catch (e) { /* no file for this date — fall back to the defaults */ }
  transitionsDayCache.set(dateStr, data);
  return data;
}

window.recordTransition = async function recordTransition(entry) {
  const meta = TRANSITION_PERIODS[entry.periodName];
  if (!meta) return;                       // not one of her classes
  if (!entry.date) return;

  const db = transitionsGetDb();
  if (!db) return;

  const seconds = Math.max(0, Math.round(Number(entry.seconds) || 0));
  // a "transition" of zero seconds is a tab that opened and closed, not a
  // class that moved instantly — don't file it
  if (seconds === 0 && !entry.stopped) return;

  const dayData = await transitionsDayData(entry.date);
  const periodData = dayData && dayData.periods && dayData.periods[entry.periodName];

  const dt = new Date(`${entry.date}T00:00:00Z`);
  const record = {
    date: entry.date,
    weekday: WEEKDAYS[dt.getUTCDay()],
    period: entry.periodName,
    periodSlug: meta.slug,
    grade: (periodData && periodData.grade) || meta.grade,
    schedule: entry.schedule || '',
    bellStart: entry.bellStart || '',
    bellEnd: entry.bellEnd || '',
    seconds,
    stopped: !!entry.stopped,
    final: entry.reason === 'period-end',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const ref = db.collection(TRANSITIONS_COLLECTION).doc(`${entry.date}_${meta.slug}`);

  try {
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        const prev = existing.data() || {};
        // never let a timer that was left running overwrite a real reading
        if (prev.stopped && !record.stopped) return;
      }
      tx.set(ref, record, { merge: true });
    });
  } catch (e) {
    // offline, rules not published yet, quota — the board carries on
    console.warn('Transition record not saved:', e && e.message);
  }
};
