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

   Only her three teaching periods are recorded (4th / 6th / 7th) —
   which are also the only bells that start the timer at all (see
   TIMED_PERIODS in script.js), so nothing else ever gets this far.

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

/* ============================================================
   Friday game time — the read side of the same collection.

   Game Mode's Friday auto-start asks this how long a class earned:
   30 minutes, minus every second that class spent in transitions
   Monday through Friday of the current week. Settle quickly all week
   and you keep most of the half hour; dawdle and you spend it.

   Each grade is exactly one period (4th = 8th grade, 6th = 7th, 7th =
   6th), so summing by periodSlug and summing by grade are the same
   thing — and the slug is what the documents are keyed by.

   Readings where the timer was never stopped are skipped, the same
   way transitions.html leaves them out of its averages. That reading
   is "how long the tab sat open," not a transition, and a projector
   nobody closed on Tuesday must not cost a class its Friday.

   Resolves to minutes (possibly fractional), floored at 0, or null if
   the answer isn't knowable — no Firebase, no network, or a period
   that isn't one of hers. The two mean different things to the
   caller: null is "don't auto-start at all," 0 is "they earned
   nothing." It never rejects.
   ============================================================ */

const GAME_MODE_BASE_MINUTES = 30;
const TRANSITIONS_EARNED_RETRY_MS = 60000;

/* Game Mode's autoCheck calls this every second, so the answer is
   cached per class per day and the network is touched once. Only real
   answers are cached; a failed read backs off instead, so one dropped
   request doesn't cost a class its Friday, and a board with no
   connection doesn't retry sixty times a minute. */
const transitionsEarnedCache = new Map();    // key -> minutes (settled)
const transitionsEarnedPending = new Map();  // key -> in-flight promise
const transitionsEarnedRetryAt = new Map();  // key -> ms before next attempt

window.transitionsEarnedGameMinutes = async function (periodName, todayIso) {
  const meta = TRANSITION_PERIODS[periodName];
  if (!meta) return null;                        // not one of her three classes

  // keyed by date too, so a board left running overnight recomputes
  const key = `${todayIso}|${meta.slug}`;
  if (transitionsEarnedCache.has(key)) return transitionsEarnedCache.get(key);
  if (transitionsEarnedPending.has(key)) return transitionsEarnedPending.get(key);
  if (Date.now() < (transitionsEarnedRetryAt.get(key) || 0)) return null;

  const promise = (async () => {
    const db = transitionsGetDb();
    if (!db) return null;

    // currentWeekDates() (script.js) returns Monday-first ISO dates, so
    // [0] is Monday and [4] is Friday. The range is on one field only,
    // which the automatic single-field index covers — no composite
    // index to create in the console before this works.
    const week = currentWeekDates();
    // source: 'server' on purpose. A plain get() falls back to the local
    // cache when the backend is unreachable and resolves with an EMPTY
    // snapshot — which reads as "this grade wasted no time at all" and
    // hands out a full 30 minutes. Forcing the server makes an
    // unreachable backend throw, so it lands in the catch below and
    // becomes null ("unknown") instead of a clean week.
    const snap = await db.collection(TRANSITIONS_COLLECTION)
      .where('date', '>=', week[0])
      .where('date', '<=', week[4])
      .get({ source: 'server' });

    let wastedSeconds = 0;
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.periodSlug !== meta.slug) return;
      if (d.stopped === false) return;           // never stopped — not a transition
      wastedSeconds += Number(d.seconds) || 0;
    });

    return Math.max(0, GAME_MODE_BASE_MINUTES - wastedSeconds / 60);
  })();

  transitionsEarnedPending.set(key, promise);
  try {
    const minutes = await promise;
    if (minutes === null) {
      transitionsEarnedRetryAt.set(key, Date.now() + TRANSITIONS_EARNED_RETRY_MS);
    } else {
      transitionsEarnedCache.set(key, minutes);
    }
    return minutes;
  } catch (e) {
    // offline, rules, quota — try again shortly, and meanwhile let the
    // caller treat it as "unknown" rather than "zero minutes earned"
    transitionsEarnedRetryAt.set(key, Date.now() + TRANSITIONS_EARNED_RETRY_MS);
    return null;
  } finally {
    transitionsEarnedPending.delete(key);
  }
};
