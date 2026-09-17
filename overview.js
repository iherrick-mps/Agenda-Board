/* ============================================================
   Day Overview — the two-column planning view.

   Left column: 8th grade (4th Period).
   Right column: 6th/7th grade (6th + 7th Period, which normally run
   the same plan). When those two periods really do carry different
   plans for a day, the right column splits into two stacked cards
   rather than silently showing one and hiding the other.

   current-day.html routes here on its own from the 1st period bell
   through the end of 3rd period — the stretch of the day before she
   starts teaching — via resolveLivePage() in script.js. Outside that
   window it's still reachable directly, and the Prev/Next buttons let
   her read ahead to any day that has a file.

   Re-fetches the day file every few minutes so an edit to the JSON
   shows up on the projected board without anyone reloading anything.
   ============================================================ */

const OV_REFRESH_MS = 5 * 60 * 1000;

// the fields that decide whether 6th and 7th period are "the same plan"
const OV_COMPARE_FIELDS = [
  'workingNow', 'smartGoal', 'agenda', 'weeklyDeliverable',
  'contentStandard', 'eldStandard', 'connections'
];

// section order down each column, with the accent each one borrows from
// the bento board so the two views read as the same system
const OV_SECTIONS = [
  { field: 'smartGoal',         label: 'SMART Goal',        color: 'var(--c-goal)' },
  { field: 'workingNow',        label: 'Working On Now',    color: 'var(--c-working)' },
  { field: 'agenda',            label: 'Agenda / Steps',    color: 'var(--c-agenda)', grow: true },
  { field: 'weeklyDeliverable', label: 'Due Sunday',        color: 'var(--c-deliverable)' },
  { field: 'contentStandard',   label: 'Content Standard',  color: 'var(--c-standard)', small: true },
  { field: 'eldStandard',       label: 'ELD Standard',      color: 'var(--c-eld)', small: true },
  { field: 'connections',       label: 'Connections',       color: 'var(--c-connect)' }
];

function ovEscape(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function ovSamePlan(a, b) {
  if (!a || !b) return false;
  return OV_COMPARE_FIELDS.every(f => JSON.stringify(a[f] ?? null) === JSON.stringify(b[f] ?? null));
}

function ovRenderValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) {
    // highlightDurations() lives in script.js — same "(8 min)" styling the
    // agenda bento uses. The text is escaped first, so a stray < in a JSON
    // field can't become markup here either.
    return `<ol class="ov-steps">${
      value.map(item => `<li>${highlightDurations(ovEscape(item))}</li>`).join('')
    }</ol>`;
  }
  return `<p>${highlightDurations(ovEscape(value))}</p>`;
}

function ovRenderSections(periodData) {
  return OV_SECTIONS.map(sec => {
    const body = ovRenderValue(periodData[sec.field]);
    if (!body) return '';
    const classes = ['ov-section'];
    if (sec.grow) classes.push('ov-section-grow');
    if (sec.small) classes.push('ov-section-small');
    return `
      <section class="${classes.join(' ')}" style="--sec-color:${sec.color}">
        <h3 class="ov-section-label">${sec.label}</h3>
        <div class="ov-section-body">${body}</div>
      </section>`;
  }).join('');
}

function ovRenderCard(periodData, tag) {
  return `
    <div class="ov-card">
      ${tag ? `<div class="ov-card-tag">${ovEscape(tag)}</div>` : ''}
      ${ovRenderSections(periodData)}
    </div>`;
}

function ovRenderColumn({ modifier, grade, periodLabel, cards }) {
  return `
    <section class="ov-col ${modifier}">
      <header class="ov-col-head">
        <span class="ov-col-grade">${ovEscape(grade)}</span>
        <span class="ov-col-period">${ovEscape(periodLabel)}</span>
      </header>
      <div class="ov-col-body">${cards}</div>
    </section>`;
}

function ovEmptyColumn(modifier, grade, periodLabel, note) {
  return ovRenderColumn({
    modifier, grade, periodLabel,
    cards: `<div class="ov-empty">${ovEscape(note)}</div>`
  });
}

function ovRender(dayData) {
  const columnsEl = document.getElementById('ov-columns');
  const periods = (dayData && dayData.periods) || {};
  const p4 = periods['4th Period'];
  const p6 = periods['6th Period'];
  const p7 = periods['7th Period'];

  /* ---- left: 8th grade ---- */
  const left = p4
    ? ovRenderColumn({
        modifier: 'ov-col-8th',
        grade: p4.grade || '8th Grade',
        periodLabel: '4th Period',
        cards: ovRenderCard(p4, null)
      })
    : ovEmptyColumn('ov-col-8th', '8th Grade', '4th Period', 'No 8th grade plan in this day\u2019s file.');

  /* ---- right: 6th/7th grade ---- */
  let right;
  if (p6 && p7 && ovSamePlan(p6, p7)) {
    // the normal case: one shared plan, run twice
    right = ovRenderColumn({
      modifier: 'ov-col-67',
      grade: '6th & 7th Grade',
      periodLabel: '6th + 7th Period',
      cards: ovRenderCard(p6, null)
    });
  } else if (p6 || p7) {
    // they diverge today — show both, labeled, rather than picking one
    const cards = [
      p6 ? ovRenderCard(p6, `6th Period \u00b7 ${p6.grade || '7th Grade'}`) : '',
      p7 ? ovRenderCard(p7, `7th Period \u00b7 ${p7.grade || '6th Grade'}`) : ''
    ].join('');
    right = ovRenderColumn({
      modifier: 'ov-col-67 is-split',
      grade: '6th & 7th Grade',
      periodLabel: p6 && p7 ? 'Different plans today' : (p6 ? '6th Period only' : '7th Period only'),
      cards
    });
  } else {
    right = ovEmptyColumn('ov-col-67', '6th & 7th Grade', '6th + 7th Period',
      'No 6th/7th grade plan in this day\u2019s file.');
  }

  columnsEl.innerHTML = left + right;
}

async function initOverviewPage() {
  const columnsEl = document.getElementById('ov-columns');
  if (!columnsEl) return;

  const params = new URLSearchParams(window.location.search);
  const dateStr = params.get('date') || getPacificNow().isoDate;

  const dateEl = document.getElementById('ov-date');
  const navDateEl = document.getElementById('ov-nav-date');
  const scheduleEl = document.getElementById('ov-schedule');
  const fullBoardLink = document.getElementById('ov-full-board');

  const dt = new Date(`${dateStr}T00:00:00Z`);
  const pretty = `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
  if (dateEl) dateEl.textContent = pretty;
  if (navDateEl) navDateEl.textContent = pretty;
  if (fullBoardLink) fullBoardLink.href = `agenda.html?date=${dateStr}`;

  // reuse the shared day-nav wiring from script.js, but point its links at
  // this page instead of agenda.html
  initOverviewDayNav(dateStr);

  let lastSeen = null;

  async function load() {
    try {
      const res = await fetch(`data/${dateStr}.json?t=${Date.now()}`);
      if (!res.ok) throw new Error('not found');
      const text = await res.text();
      if (text === lastSeen) return;   // unchanged — don't repaint the board
      lastSeen = text;

      const dayData = JSON.parse(text);
      if (scheduleEl) {
        const bells = await loadBells();
        scheduleEl.textContent = bells[dayData.schedule]?.label || dayData.schedule || '';
      }
      ovRender(dayData);
    } catch (e) {
      if (lastSeen === null) {
        columnsEl.innerHTML =
          `<div class="ov-loading">No agenda file found for ${ovEscape(dateStr)}.</div>`;
      }
      // if we've already rendered something, a failed refresh leaves it up
    }
  }

  await load();
  setInterval(load, OV_REFRESH_MS);
}

/* Prev/Next across the dates that actually have files, same behavior as
   the agenda page's day nav but staying on the overview. */
async function initOverviewDayNav(dateStr) {
  const prevBtn = document.getElementById('ov-prev-btn');
  const nextBtn = document.getElementById('ov-next-btn');
  if (!prevBtn || !nextBtn) return;

  let dates = [];
  try { dates = await loadDates(); } catch (e) { return; }

  const idx = dates.indexOf(dateStr);
  const go = (target) => { window.location.href = `overview.html?date=${target}`; };

  if (idx > 0) prevBtn.addEventListener('click', () => go(dates[idx - 1]));
  else prevBtn.disabled = true;

  if (idx !== -1 && idx < dates.length - 1) nextBtn.addEventListener('click', () => go(dates[idx + 1]));
  else nextBtn.disabled = true;
}

document.addEventListener('DOMContentLoaded', initOverviewPage);
