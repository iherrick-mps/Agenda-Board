/* ============================================================
   Transition Times viewer.

   Reads the `transitions` collection the agenda board writes to (see
   transitions-record.js) and lays it out the way it's actually useful:
   one row per school day, one column per class, so a glance down a
   column answers "is 7th period getting slower?" and a glance across a
   row answers "was Tuesday just a bad day for everyone?"

   Live — it subscribes with onSnapshot(), so a period that ends while
   this tab is open appears on its own.

   Records where the timer was never stopped are shown but struck
   through and excluded from every average: the reading for those is
   "however long the tab sat there," not a transition.
   ============================================================ */

const TX_COLLECTION = 'transitions';
const TX_COLUMNS = [
  { slug: '4', period: '4th Period', grade: '8th Grade', color: 'var(--c-goal)' },
  { slug: '6', period: '6th Period', grade: '7th Grade', color: 'var(--c-standard)' },
  { slug: '7', period: '7th Period', grade: '6th Grade', color: 'var(--c-eld)' }
];

// how the cell is tinted — a transition is "quick" under 2 minutes and
// "slow" over 5, which is roughly a tenth of the period gone
const TX_QUICK_SECONDS = 120;
const TX_SLOW_SECONDS = 300;

// the widest bar in a cell represents this much time
const TX_BAR_MAX_SECONDS = 600;

let txRecords = [];
let txRangeDays = 0;   // 0 = all time

function txFmt(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function txEscape(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function txBand(seconds) {
  if (seconds <= TX_QUICK_SECONDS) return 'is-quick';
  if (seconds >= TX_SLOW_SECONDS) return 'is-slow';
  return 'is-mid';
}

function txInRange(dateStr) {
  if (!txRangeDays) return true;
  const cutoff = new Date(Date.now() - txRangeDays * 86400000);
  const iso = cutoff.toISOString().slice(0, 10);
  return dateStr >= iso;
}

function txAverage(list) {
  const usable = list.filter(r => r.stopped);
  if (!usable.length) return null;
  return usable.reduce((sum, r) => sum + r.seconds, 0) / usable.length;
}

/* ---------- summary cards ---------- */

function txRenderStats(records) {
  const el = document.getElementById('tx-stats');
  if (!el) return;

  const cards = TX_COLUMNS.map(col => {
    const mine = records.filter(r => r.periodSlug === col.slug);
    const avg = txAverage(mine);
    const counted = mine.filter(r => r.stopped).length;
    return `
      <div class="tx-stat" style="--stat-color:${col.color}">
        <div class="tx-stat-label">${col.period} &middot; ${col.grade}</div>
        <div class="tx-stat-value">${avg === null ? '&mdash;' : txEscape(txFmt(avg))}</div>
        <div class="tx-stat-note">average over ${counted} class${counted === 1 ? '' : 'es'}</div>
      </div>`;
  });

  const allAvg = txAverage(records);
  const countedAll = records.filter(r => r.stopped).length;
  const lost = records.filter(r => r.stopped).reduce((sum, r) => sum + r.seconds, 0);
  cards.push(`
    <div class="tx-stat tx-stat-total" style="--stat-color:var(--c-timer)">
      <div class="tx-stat-label">All classes</div>
      <div class="tx-stat-value">${allAvg === null ? '&mdash;' : txEscape(txFmt(allAvg))}</div>
      <div class="tx-stat-note">${txEscape(Math.round(lost / 60))} min of class time across ${countedAll} period${countedAll === 1 ? '' : 's'}</div>
    </div>`);

  el.innerHTML = cards.join('');
}

/* ---------- the table ---------- */

function txRenderTable(records) {
  const tbody = document.getElementById('tx-tbody');
  const foot = document.getElementById('tx-foot');
  if (!tbody) return;

  if (!records.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="tx-loading">No transition records in this range yet. ' +
      'They start appearing the first time a class period ends with the board open.</td></tr>';
    if (foot) foot.textContent = '';
    return;
  }

  // group into one row per date, newest first
  const byDate = new Map();
  records.forEach(r => {
    if (!byDate.has(r.date)) byDate.set(r.date, {});
    byDate.get(r.date)[r.periodSlug] = r;
  });
  const dates = [...byDate.keys()].sort().reverse();
  const today = getPacificNow().isoDate;

  tbody.innerHTML = dates.map(date => {
    const row = byDate.get(date);
    const dt = new Date(`${date}T00:00:00Z`);
    const weekday = WEEKDAYS[dt.getUTCDay()];
    const label = `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`;

    const cells = TX_COLUMNS.map(col => {
      const rec = row[col.slug];
      if (!rec) return '<td class="tx-cell is-empty">&mdash;</td>';

      const width = Math.min(100, (rec.seconds / TX_BAR_MAX_SECONDS) * 100);
      const flagged = !rec.stopped;
      const title = flagged
        ? 'Timer was never stopped this period — reading is not a real transition'
        : `${rec.period} on ${date}`;

      return `
        <td class="tx-cell ${flagged ? 'is-flagged' : txBand(rec.seconds)}" title="${txEscape(title)}">
          <div class="tx-cell-inner">
            <span class="tx-cell-value">${txEscape(txFmt(rec.seconds))}</span>
            ${flagged ? '<span class="tx-flag">not stopped</span>' : ''}
            <button type="button" class="tx-del" data-id="${txEscape(rec.id)}"
                    title="Delete this record">&times;</button>
          </div>
          <span class="tx-bar" style="--bar:${width}%"></span>
        </td>`;
    }).join('');

    const dayAvg = txAverage(Object.values(row));

    return `
      <tr class="${date === today ? 'is-today' : ''}">
        <td class="tx-date">
          <span class="tx-date-main">${txEscape(label)}</span>
          <span class="tx-date-weekday">${txEscape(weekday)}</span>
        </td>
        ${cells}
        <td class="tx-avg">${dayAvg === null ? '&mdash;' : txEscape(txFmt(dayAvg))}</td>
      </tr>`;
  }).join('');

  if (foot) {
    foot.textContent =
      `${records.length} record${records.length === 1 ? '' : 's'} across ` +
      `${dates.length} day${dates.length === 1 ? '' : 's'}. ` +
      'Averages ignore periods where the timer was never stopped.';
  }
}

function txRenderAll() {
  const visible = txRecords.filter(r => txInRange(r.date));
  txRenderStats(visible);
  txRenderTable(visible);
}

/* ---------- CSV ---------- */

function txDownloadCsv() {
  const rows = txRecords.filter(r => txInRange(r.date))
    .slice()
    .sort((a, b) => (a.date === b.date
      ? a.periodSlug.localeCompare(b.periodSlug)
      : (a.date < b.date ? 1 : -1)));

  const header = ['Date', 'Weekday', 'Period', 'Grade', 'Seconds', 'MM:SS', 'Timer stopped', 'Schedule'];
  const lines = [header.join(',')];

  rows.forEach(r => {
    const cells = [
      r.date, r.weekday || '', r.period || '', r.grade || '',
      r.seconds, txFmt(r.seconds), r.stopped ? 'yes' : 'no', r.schedule || ''
    ];
    lines.push(cells.map(c => {
      const s = String(c);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    }).join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `transition-times-${getPacificNow().isoDate}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- boot ---------- */

function initTransitionsPage() {
  const tbody = document.getElementById('tx-tbody');
  if (!tbody) return;

  if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
    tbody.innerHTML = '<tr><td colspan="5" class="tx-loading">Firebase didn\u2019t load ' +
      '— check that firebase-config.js is uploaded next to this page.</td></tr>';
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

  // range buttons
  document.getElementById('tx-range')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tx-range-btn');
    if (!btn) return;
    txRangeDays = Number(btn.dataset.days) || 0;
    document.querySelectorAll('.tx-range-btn').forEach(b => b.classList.toggle('is-active', b === btn));
    txRenderAll();
  });

  document.getElementById('tx-csv')?.addEventListener('click', txDownloadCsv);

  // delete a single record (a mis-timed period, a test run)
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.tx-del');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (!window.confirm('Delete this transition record? This cannot be undone.')) return;
    btn.disabled = true;
    try {
      await db.collection(TX_COLLECTION).doc(id).delete();
    } catch (err) {
      btn.disabled = false;
      window.alert('Could not delete that record: ' + (err && err.message));
    }
  });

  // live feed — the newest 500 records, which is well over a school year
  db.collection(TX_COLLECTION)
    .orderBy('date', 'desc')
    .limit(500)
    .onSnapshot(
      (snap) => {
        txRecords = snap.docs.map(doc => {
          const d = doc.data() || {};
          return {
            id: doc.id,
            date: d.date || '',
            weekday: d.weekday || '',
            period: d.period || '',
            periodSlug: d.periodSlug || '',
            grade: d.grade || '',
            schedule: d.schedule || '',
            seconds: Number(d.seconds) || 0,
            stopped: d.stopped !== false
          };
        }).filter(r => r.date && r.periodSlug);
        txRenderAll();
      },
      (err) => {
        tbody.innerHTML =
          `<tr><td colspan="5" class="tx-loading">Couldn\u2019t read the records: ${txEscape(err.message)}` +
          '<br>If this says "permission denied," the Firestore rules for the ' +
          '<code>transitions</code> collection still need publishing.</td></tr>';
      }
    );
}

document.addEventListener('DOMContentLoaded', initTransitionsPage);
