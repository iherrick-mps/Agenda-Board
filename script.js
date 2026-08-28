/* ============================================================
   Agenda Board — shared logic
   ============================================================ */

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ---------- Pacific-time helpers ---------- */

// Returns { hours, minutes, seconds, weekdayName, isoDate } all evaluated
// in America/Los_Angeles, regardless of the viewer's own device timezone.
function getPacificNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'long'
  }).formatToParts(now);

  const get = (type) => parts.find(p => p.type === type)?.value;
  return {
    hours: parseInt(get('hour'), 10),
    minutes: parseInt(get('minute'), 10),
    seconds: parseInt(get('second'), 10),
    weekdayName: get('weekday'),
    isoDate: `${get('year')}-${get('month')}-${get('day')}`
  };
}

function minutesSinceMidnight({ hours, minutes, seconds }) {
  return hours * 60 + minutes + seconds / 60;
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmtClock({ hours, minutes, seconds }) {
  const h12 = ((hours + 11) % 12) + 1;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return { h12, mm, ss, ampm };
}

function fmtCountdown(totalMinutes) {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ---------- Bell schedule lookup ---------- */

let BELLS_CACHE = null;
async function loadBells() {
  if (BELLS_CACHE) return BELLS_CACHE;
  const res = await fetch('bells.json');
  BELLS_CACHE = await res.json();
  return BELLS_CACHE;
}

// Figures out which schedule type applies to "today" in PT.
// Prefers the schedule declared in today's own data file (handles Minimum
// Days, which don't follow a fixed weekday); falls back to the weekday
// default (Wednesday = shortened, everything else = regular).
async function resolveTodaysSchedule(pacificNow) {
  try {
    const res = await fetch(`data/${pacificNow.isoDate}.json`);
    if (res.ok) {
      const dayData = await res.json();
      if (dayData.schedule) return dayData.schedule;
    }
  } catch (e) { /* fall through to weekday default */ }

  if (pacificNow.weekdayName === 'Wednesday') return 'shortened';
  if (pacificNow.weekdayName === 'Saturday') return 'saturday';
  return 'regular';
}

// Given a schedule's period list and the current time, find the live
// period (if any) and the next upcoming period (if any).
function findCurrentAndNext(periods, nowMin) {
  let current = null;
  let next = null;
  for (const p of periods) {
    const start = hhmmToMinutes(p.start);
    const end = hhmmToMinutes(p.end);
    if (nowMin >= start && nowMin < end) current = p;
    if (start > nowMin && (!next || start < hhmmToMinutes(next.start))) next = p;
  }
  return { current, next };
}

/* ---------- Clock widget (used on every page) ---------- */

async function initClock() {
  const bells = await loadBells();

  // Pages that only ever care about one fixed end time (e.g. Tutoring,
  // which always ends at 4:00 PM) can opt out of the bell-schedule
  // lookup entirely via data-clock-override-end="16:00" on .box-clock.
  // This matters because some schoolwide blocks overlap on purpose
  // (e.g. "After School Activities" 3:15-4:00 sits inside "ASES
  // Program" 3:00-6:00) — the bell lookup reports whichever of those
  // overlapping blocks comes later in bells.json, which isn't
  // necessarily the one a given page's countdown should reflect.
  const clockBox = document.querySelector('.box-clock');
  const overrideEnd = clockBox?.dataset.clockOverrideEnd;
  const overrideLabel = clockBox?.dataset.clockOverrideLabel || 'This period';

  async function tick() {
    const pt = getPacificNow();
    const { h12, mm, ss, ampm } = fmtClock(pt);

    const dateEl = document.getElementById('clock-date');
    if (dateEl) {
      dateEl.textContent = `${pt.isoDate.replaceAll('-', '/')} \u00b7 ${pt.weekdayName.toUpperCase()}`;
    }

    const timeEl = document.getElementById('clock-time');
    if (timeEl) {
      timeEl.innerHTML =
        `${h12}<span class="colon">:</span>${mm} ` +
        `<span class="ampm">${ampm}</span>`;
    }

    const statusEl = document.getElementById('clock-status');
    const labelEl = document.getElementById('clock-status-label');
    const valueEl = document.getElementById('clock-status-value');
    if (!statusEl) return;

    const nowMin = minutesSinceMidnight(pt);

    if (overrideEnd) {
      const remaining = hhmmToMinutes(overrideEnd) - nowMin;
      if (remaining > 0) {
        statusEl.className = 'clock-status in-session';
        labelEl.textContent = `${overrideLabel} ends in`;
        valueEl.textContent = fmtCountdown(remaining);
      } else {
        statusEl.className = 'clock-status not-in-session';
        labelEl.textContent = `${overrideLabel} is over`;
        valueEl.textContent = '\u2014';
      }
      return;
    }

    const scheduleKey = await resolveTodaysSchedule(pt);
    const scheduleData = bells[scheduleKey];
    if (!scheduleData) return;

    const { current, next } = findCurrentAndNext(scheduleData.periods, nowMin);

    if (current) {
      const remaining = hhmmToMinutes(current.end) - nowMin;
      statusEl.className = 'clock-status in-session';
      labelEl.textContent = `${current.name} ends in`;
      valueEl.textContent = fmtCountdown(remaining);
    } else if (next) {
      const until = hhmmToMinutes(next.start) - nowMin;
      statusEl.className = 'clock-status not-in-session';
      labelEl.textContent = `Not in session — ${next.name} starts in`;
      valueEl.textContent = fmtCountdown(until);
    } else {
      statusEl.className = 'clock-status not-in-session';
      labelEl.textContent = 'School day is over';
      valueEl.textContent = '—';
    }
  }

  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   Auto-fit text — shrinks/grows a box's font-size so its content
   fills the box with no overflow (and therefore no scrolling).
   ============================================================ */

// max is deliberately generous: since the rotating bentos show one slide
// at a time in a box that used to hold two boxes' worth of content, short
// text should be allowed to grow a long way before it stops. The binary
// search checks width as well as height, so nothing can overflow.
function fitBoxText(contentEl, { min = 9, max = 240 } = {}) {
  if (!contentEl || contentEl.clientHeight === 0) return;
  let lo = min, hi = max;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    contentEl.style.fontSize = mid + 'px';
    const overflowing =
      contentEl.scrollHeight > contentEl.clientHeight + 0.5 ||
      contentEl.scrollWidth > contentEl.clientWidth + 0.5;
    if (overflowing) hi = mid; else lo = mid;
  }
  contentEl.style.fontSize = lo + 'px';
}

function fitAllBoxes() {
  document.querySelectorAll('.box-content').forEach(el => fitBoxText(el));
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitAllBoxes, 150);
});

/* ============================================================
   Periods — shared by the index page and the agenda page.
   The chosen period travels in the URL (?period=4) so a link to
   "6th Period on Aug 20" is a real, shareable address.
   ============================================================ */

const PERIOD_ORDER = ['4th Period', '6th Period', '7th Period'];

const PERIOD_SLUG = {
  '4th Period': '4',
  '6th Period': '6',
  '7th Period': '7'
};

const PERIOD_COLOR = {
  '4th Period': 'var(--c-goal)',
  '6th Period': 'var(--c-standard)',
  '7th Period': 'var(--c-eld)'
};

const PERIOD_STORAGE_KEY = 'agendaBoard.period';

// accepts "4", "4th", "4th Period", "4th%20Period" — anything whose digits
// match a known period — and returns the canonical name, or null
function normalizePeriod(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  return PERIOD_ORDER.find(p => PERIOD_SLUG[p] === digits) || null;
}

function agendaUrl(dateStr, period) {
  const p = normalizePeriod(period);
  return `agenda.html?date=${dateStr}` + (p ? `&period=${PERIOD_SLUG[p]}` : '');
}

async function loadDates() {
  const res = await fetch('dates.txt');
  const text = await res.text();
  return [...new Set(text.split('\n').map(d => d.trim()).filter(Boolean))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // ascending
}

/* ============================================================
   Index page — pick a period first, then a day from the month
   calendar (with the full date list still available below).
   ============================================================ */

// the calendar never scrolls back past the start of the school year
const CAL_FIRST_YEAR = 2026;
const CAL_FIRST_MONTH = 7; // 0-indexed: 7 = August

const MONTHS_FULL = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

const monthIndex = (year, month) => year * 12 + month;

async function initIndexPage() {
  const pickerEl = document.getElementById('period-picker');
  const gridEl = document.getElementById('cal-grid');
  const listEl = document.getElementById('date-list');
  if (!pickerEl || !gridEl) return;

  const dates = await loadDates();
  const dateSet = new Set(dates);
  const today = getPacificNow().isoDate;

  if (dates.length === 0) {
    gridEl.outerHTML = '<div class="empty-note">No dates found in dates.txt yet.</div>';
    return;
  }

  /* ---- month range: August 2026 through the last month in dates.txt ---- */
  const minIdx = monthIndex(CAL_FIRST_YEAR, CAL_FIRST_MONTH);
  const lastDate = dates[dates.length - 1];
  const lastDt = new Date(`${lastDate}T00:00:00Z`);
  const maxIdx = Math.max(minIdx, monthIndex(lastDt.getUTCFullYear(), lastDt.getUTCMonth()));

  // open on the current month when it's inside the range, otherwise the first
  const todayDt = new Date(`${today}T00:00:00Z`);
  const todayIdx = monthIndex(todayDt.getUTCFullYear(), todayDt.getUTCMonth());
  let viewIdx = Math.min(Math.max(todayIdx, minIdx), maxIdx);

  /* ---- selected period (restored from last visit on this device) ---- */
  let selectedPeriod = normalizePeriod(
    new URLSearchParams(window.location.search).get('period')
  );
  if (!selectedPeriod) {
    try {
      selectedPeriod = normalizePeriod(localStorage.getItem(PERIOD_STORAGE_KEY));
    } catch (e) { /* private browsing / storage disabled */ }
  }

  const titleEl = document.getElementById('cal-title');
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const hintEl = document.getElementById('cal-hint');

  function renderPicker() {
    pickerEl.querySelectorAll('.period-choice').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.period === selectedPeriod);
    });
  }

  function renderHint() {
    if (!hintEl) return;
    hintEl.classList.remove('is-warning');
    hintEl.textContent = selectedPeriod
      ? `Showing ${selectedPeriod}. Click any highlighted day to open its agenda.`
      : 'Pick a period above, then click a highlighted day.';
  }

  function renderCalendar() {
    const year = Math.floor(viewIdx / 12);
    const month = viewIdx % 12;
    titleEl.textContent = `${MONTHS_FULL[month]} ${year}`;
    prevBtn.disabled = viewIdx <= minIdx;
    nextBtn.disabled = viewIdx >= maxIdx;

    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push('<span class="cal-day is-blank"></span>');
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const classes = ['cal-day'];
      if (dateSet.has(iso)) classes.push('has-agenda');
      if (iso === today) classes.push('is-today');

      if (dateSet.has(iso)) {
        const color = selectedPeriod ? PERIOD_COLOR[selectedPeriod] : 'var(--ink)';
        cells.push(
          `<a class="${classes.join(' ')}" href="${agendaUrl(iso, selectedPeriod)}"` +
          ` data-date="${iso}" style="--sel-color:${color}"` +
          ` title="${iso}${iso === today ? ' (today)' : ''}">${day}</a>`
        );
      } else {
        cells.push(`<span class="${classes.join(' ')}">${day}</span>`);
      }
    }
    gridEl.innerHTML = cells.join('');
  }

  function renderList() {
    if (!listEl) return;
    const hasToday = dateSet.has(today);
    const rest = dates.filter(d => d !== today)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // furthest future -> oldest
    const ordered = hasToday ? [today, ...rest] : rest;

    listEl.innerHTML = ordered.map(d => {
      const dt = new Date(`${d}T00:00:00Z`);
      const weekday = WEEKDAYS[dt.getUTCDay()];
      const month = MONTHS[dt.getUTCMonth()];
      const isToday = d === today;
      return `
        <li class="${isToday ? 'is-today' : ''}">
          <a href="${agendaUrl(d, selectedPeriod)}">
            <span>
              <span class="date-main">${month} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}</span>${isToday ? '<span class="today-tag">TODAY</span>' : ''}<br>
              <span class="date-weekday">${weekday}</span>
            </span>
            <span class="date-arrow">View agenda &rarr;</span>
          </a>
        </li>`;
    }).join('');
  }

  function renderAll() {
    renderPicker();
    renderCalendar();
    renderList();
    renderHint();
  }

  pickerEl.querySelectorAll('.period-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPeriod = normalizePeriod(btn.dataset.period);
      try { localStorage.setItem(PERIOD_STORAGE_KEY, PERIOD_SLUG[selectedPeriod]); }
      catch (e) { /* storage disabled — the choice still works this session */ }
      renderAll();
    });
  });

  prevBtn.addEventListener('click', () => {
    if (viewIdx > minIdx) { viewIdx--; renderCalendar(); }
  });
  nextBtn.addEventListener('click', () => {
    if (viewIdx < maxIdx) { viewIdx++; renderCalendar(); }
  });

  // clicking a day before choosing a period sends you back to step 1 rather
  // than opening whichever period happens to be listed first that day
  gridEl.addEventListener('click', (e) => {
    const cell = e.target.closest('a.cal-day');
    if (!cell || selectedPeriod) return;
    e.preventDefault();
    pickerEl.classList.remove('nudge');
    void pickerEl.offsetWidth; // restart the animation
    pickerEl.classList.add('nudge');
    if (hintEl) {
      hintEl.textContent = 'Pick your period first (step 1), then choose that day.';
      hintEl.classList.add('is-warning');
    }
  });

  renderAll();
}

/* ============================================================
   Agenda page — persistent bento board + period tabs
   ============================================================ */

// maps a JSON field name -> the box's content element id, for the boxes
// that show exactly one field and never change
const FIELD_TO_EL = {
  weeklyDeliverable: 'content-deliver'
};

/* ============================================================
   Rotating bentos.

   Three boxes each carry two of the old board's boxes and swap
   between them every 30 seconds. A slide owns three things: the
   label above the text, the text itself, and the box's accent
   color — so the color is always a reliable signal for which of
   the two you're reading, on the board and from across the room.

   A box with only one slide's worth of content in the day's JSON
   (e.g. a day with no Connections written) just sits still on the
   slide it does have, and hides its countdown.
   ============================================================ */

const ROTATE_SECONDS = 30;

// how long the fade-out lasts — must match the .box-rot transition in
// styles.css, so the text is swapped while it's invisible
const ROTATE_SWAP_MS = 240;

const ROTATOR_SPECS = [
  {
    boxId: 'box-focus',
    labelId: 'label-focus',
    contentId: 'content-focus',
    timerId: 'rot-timer-focus',
    slides: [
      { field: 'workingNow', label: 'What should I be working on right now?', color: 'var(--c-working)' },
      { field: 'smartGoal',  label: 'SMART Goal',                             color: 'var(--c-goal)' }
    ]
  },
  {
    boxId: 'box-agenda',
    labelId: 'label-agenda',
    contentId: 'content-agenda',
    timerId: 'rot-timer-agenda',
    slides: [
      { field: 'agenda',      label: 'Agenda / Steps', color: 'var(--c-agenda)' },
      { field: 'connections', label: 'Connections',    color: 'var(--c-connect)' }
    ]
  },
  {
    boxId: 'box-standards',
    labelId: 'label-standards',
    contentId: 'content-standards',
    timerId: 'rot-timer-standards',
    slides: [
      { field: 'contentStandard', label: 'Content Standard', color: 'var(--c-standard)' },
      { field: 'eldStandard',     label: 'ELD Standard',     color: 'var(--c-eld)' }
    ]
  }
];

function hasSlideContent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function createRotator(spec) {
  const box = document.getElementById(spec.boxId);
  const labelEl = document.getElementById(spec.labelId);
  const contentEl = document.getElementById(spec.contentId);
  const timerEl = document.getElementById(spec.timerId);
  if (!box || !labelEl || !contentEl) return null;

  let data = {};
  let slides = spec.slides;
  let index = 0;
  let secondsLeft = ROTATE_SECONDS;
  let tickHandle = null;
  let swapHandle = null;

  function apply(i) {
    const slide = slides[i];
    if (!slide) return;
    box.style.setProperty('--box-color', slide.color);
    labelEl.textContent = slide.label;
    contentEl.style.fontSize = '';
    contentEl.innerHTML = renderBoxValue(data[slide.field]);
    // measure on the frame after the new text is in the DOM, then fade
    // back in — fitting happens while the box is still transparent, so
    // students never see a flash of mis-sized text
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fitBoxText(contentEl);
      box.classList.remove('is-swapping');
    }));
  }

  function show(i, animate) {
    clearTimeout(swapHandle);
    if (!animate) {
      box.classList.remove('is-swapping');
      apply(i);
      return;
    }
    box.classList.add('is-swapping');
    swapHandle = setTimeout(() => apply(i), ROTATE_SWAP_MS);
  }

  function paintTimer() {
    if (timerEl) timerEl.textContent = secondsLeft;
  }

  function tick() {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      index = (index + 1) % slides.length;
      show(index, true);
      secondsLeft = ROTATE_SECONDS;
    }
    paintTimer();
  }

  function stop() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    clearTimeout(swapHandle);
  }

  function setData(periodData) {
    stop();
    data = periodData || {};
    const filled = spec.slides.filter(s => hasSlideContent(data[s.field]));
    slides = filled.length > 0 ? filled : [spec.slides[0]];
    index = 0;
    secondsLeft = ROTATE_SECONDS;
    show(0, false);

    if (slides.length > 1) {
      if (timerEl) timerEl.hidden = false;
      paintTimer();
      tickHandle = setInterval(tick, 1000);
    } else if (timerEl) {
      timerEl.hidden = true;
    }
  }

  return { setData, stop };
}

let boardRotators = null;

function getBoardRotators() {
  if (!boardRotators) {
    boardRotators = ROTATOR_SPECS.map(createRotator).filter(Boolean);
  }
  return boardRotators;
}

// wraps trailing "(N min)"-style durations in a span so they can be
// styled distinctly from the rest of the step text
function highlightDurations(text) {
  return String(text).replace(
    /\((\d+(?:-\d+)?\s*min(?:ute)?s?)\)/gi,
    '<span class="duration">($1)</span>'
  );
}

function renderBoxValue(value) {
  if (Array.isArray(value)) {
    return `<ul>${value.map(item => `<li>${highlightDurations(item)}</li>`).join('')}</ul>`;
  }
  return value ?? '';
}

function renderPeriodContent(periodData) {
  Object.entries(FIELD_TO_EL).forEach(([field, elId]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.style.fontSize = '';
    el.innerHTML = renderBoxValue(periodData[field]);
  });

  // hand the same period data to every rotating box — each one resets to
  // its first slide and restarts its 30-second clock, so switching period
  // tabs doesn't leave one box mid-cycle showing the old class's text
  getBoardRotators().forEach(r => r.setData(periodData));

  // wait for web fonts to finish loading (not just a layout frame) before
  // measuring — fitting against a fallback font's metrics, then having the
  // real font swap in wider/taller afterward, is what causes clipped text
  const fontsReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready
    : Promise.resolve();
  fontsReady.then(() => {
    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  });
}

// Computes, from a bell schedule + which of Ms. Herrick's periods actually
// meet that day, the "effective" period for the current moment: the first
// one that hasn't ended yet (or the last one, once the whole day is over).
// This steps forward at each period's END time rather than its START time,
// so the board flips to the next class the instant the previous one ends —
// it doesn't sit on the just-finished period through the passing
// period/lunch in between.
function computeEffectivePeriod(scheduleData, periodsPresent, nowMin) {
  if (!scheduleData) return null;
  const relevantBells = periodsPresent
    .map(p => scheduleData.periods.find(bp => bp.name === p))
    .filter(Boolean);
  if (relevantBells.length === 0) return null;
  const upcoming = relevantBells.find(bp => nowMin < hhmmToMinutes(bp.end));
  return (upcoming || relevantBells[relevantBells.length - 1]).name;
}

// Figures out "right now, in Pacific time, what should the board be
// showing?" Used by current-day.html to decide what to embed — pulls the
// same data file and bell logic the agenda page itself uses, so the two
// never disagree.
//
// Returns one of:
//   { type: 'agenda', dateStr, period }  — a live class period
//   { type: 'study-hall' }               — default / nothing else scheduled
//   { type: 'vex' }                      — VEX Club (Mon 3pm+, Sat 8am+)
//   { type: 'tutoring' }                 — Tutoring (Tue 3pm+)
//
// Precedence:
//   1. The fixed after-school/before-school specials below always win,
//      regardless of whether a class is technically still "the last one
//      computed" — they're keyed to the wall clock, not to her periods.
//   2. Otherwise, if "now" falls between the end of 3rd period and the end
//      of her last taught period today, show the live class agenda.
//   3. Otherwise (before school, or after her day ends with no special
//      active — e.g. Thursday/Friday afternoons) — Study Hall.
async function resolveLivePage() {
  const pt = getPacificNow();
  const dateStr = pt.isoDate;
  const nowMin = minutesSinceMidnight(pt);
  const weekday = pt.weekdayName;

  // 1. Fixed after-school / before-school specials.
  if (weekday === 'Wednesday' && nowMin >= hhmmToMinutes('15:00')) return { type: 'study-hall' };
  if (weekday === 'Monday' && nowMin >= hhmmToMinutes('15:00')) return { type: 'vex' };
  if (weekday === 'Saturday' && nowMin >= hhmmToMinutes('08:00')) return { type: 'vex' };
  if (weekday === 'Tuesday' && nowMin >= hhmmToMinutes('15:00')) return { type: 'tutoring' };

  // 2. Is "now" inside her teaching block today (end of 3rd period through
  //    the end of her last period)? If so, show the live class agenda.
  let dayData;
  try {
    const res = await fetch(`data/${dateStr}.json`);
    if (!res.ok) throw new Error('not found');
    dayData = await res.json();
  } catch (e) {
    return { type: 'study-hall' };
  }

  const periodsPresent = PERIOD_ORDER.filter(p => dayData.periods && dayData.periods[p]);
  if (periodsPresent.length === 0) return { type: 'study-hall' };

  const bells = await loadBells();
  const scheduleData = bells[dayData.schedule];
  if (!scheduleData) return { type: 'study-hall' };

  const thirdPeriodBell = scheduleData.periods.find(bp => bp.name === '3rd Period');
  const lastPeriodBell = scheduleData.periods.find(
    bp => bp.name === periodsPresent[periodsPresent.length - 1]
  );
  const blockStart = thirdPeriodBell ? hhmmToMinutes(thirdPeriodBell.end) : -Infinity;
  const blockEnd = lastPeriodBell ? hhmmToMinutes(lastPeriodBell.end) : Infinity;

  // 3. Before 3rd period ends, or after her day's last period ends (with no
  //    special active) — Study Hall.
  if (nowMin < blockStart || nowMin >= blockEnd) return { type: 'study-hall' };

  const period = computeEffectivePeriod(scheduleData, periodsPresent, nowMin) || periodsPresent[0];
  return { type: 'agenda', dateStr, period };
}

async function initAgendaPage() {
  const boardGrid = document.getElementById('board-grid');
  if (!boardGrid) return;

  const params = new URLSearchParams(window.location.search);
  const dateStr = params.get('date');
  const urlPeriod = normalizePeriod(params.get('period'));
  const headerDateEl = document.getElementById('agenda-date');
  const scheduleEl = document.getElementById('agenda-schedule');
  const tabsEl = document.getElementById('period-tabs');

  if (!dateStr) {
    if (headerDateEl) headerDateEl.textContent = 'No date specified';
    return;
  }

  // the back link and prev/next buttons keep whichever period you're viewing
  const backLink = document.querySelector('.back-link-inline');
  if (backLink && urlPeriod) {
    backLink.href = `index.html?period=${PERIOD_SLUG[urlPeriod]}`;
  }

  initDayNav(dateStr, urlPeriod);

  let dayData;
  try {
    const res = await fetch(`data/${dateStr}.json`);
    if (!res.ok) throw new Error('not found');
    dayData = await res.json();
  } catch (e) {
    headerDateEl.textContent = dateStr;
    const focusEl = document.getElementById('content-focus');
    if (focusEl) focusEl.textContent = `No agenda file found for ${dateStr}.`;
    return;
  }

  const dt = new Date(`${dateStr}T00:00:00Z`);
  const weekday = WEEKDAYS[dt.getUTCDay()];
  const month = MONTHS[dt.getUTCMonth()];
  headerDateEl.textContent = `${weekday}, ${month} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;

  const bells = await loadBells();
  scheduleEl.textContent = bells[dayData.schedule]?.label || dayData.schedule;

  const periodsPresent = PERIOD_ORDER.filter(p => dayData.periods && dayData.periods[p]);

  // Is the *viewed* date today (in PT)? If so, which of Ms. Herrick's
  // periods is "live" right now? (See computeEffectivePeriod above.)
  const pt = getPacificNow();
  let livePeriodName = null;
  if (pt.isoDate === dateStr) {
    const nowMin = minutesSinceMidnight(pt);
    livePeriodName = computeEffectivePeriod(bells[dayData.schedule], periodsPresent, nowMin);
  }

  tabsEl.innerHTML = periodsPresent.map(p => {
    const isLive = p === livePeriodName;
    return `<button class="period-tab${isLive ? ' is-now' : ''}" data-period="${p}" style="--pin-color:${PERIOD_COLOR[p] || '#cdd8e6'}">${p} &middot; ${dayData.periods[p].grade || ''}</button>`;
  }).join('');

  function selectPeriod(period) {
    tabsEl.querySelectorAll('.period-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === period);
    });
    renderPeriodContent(dayData.periods[period]);

    // keep the address bar honest, so the page can be bookmarked, projected,
    // or handed to a student as a link to exactly this period's board
    const next = new URLSearchParams(window.location.search);
    next.set('date', dateStr);
    next.set('period', PERIOD_SLUG[period]);
    history.replaceState(null, '', `${window.location.pathname}?${next}`);

    try { localStorage.setItem(PERIOD_STORAGE_KEY, PERIOD_SLUG[period]); }
    catch (e) { /* storage disabled */ }

    initDayNav(dateStr, period);
    const back = document.querySelector('.back-link-inline');
    if (back) back.href = `index.html?period=${PERIOD_SLUG[period]}`;
  }

  tabsEl.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', () => selectPeriod(btn.dataset.period));
  });

  // ?period wins; then whichever period is live right now (only meaningful
  // when you're looking at today); then the first period that meets that day
  const defaultPeriod =
    (urlPeriod && periodsPresent.includes(urlPeriod)) ? urlPeriod
    : (livePeriodName && periodsPresent.includes(livePeriodName)) ? livePeriodName
    : periodsPresent[0];
  if (defaultPeriod) selectPeriod(defaultPeriod);
}

/* ============================================================
   Double-click anywhere to toggle fullscreen
   ============================================================ */

function initFullscreenToggle() {
  document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        /* some browsers block this without a prior user gesture context —
           the double-click itself counts as one, so this is mostly a
           safety net for unsupported browsers */
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // the viewport size changes the instant fullscreen toggles, so re-fit
  // box text right away rather than waiting on the debounced resize handler
  document.addEventListener('fullscreenchange', () => {
    setTimeout(fitAllBoxes, 50);
  });
}

/* ============================================================
   Click-to-focus — clicking a box dims everything else; clicking
   the focused box again, or clicking outside all boxes, undims.
   ============================================================ */

function initFocusMode() {
  const boardGrid = document.getElementById('board-grid');
  if (!boardGrid) return;

  // how much of the viewport the enlarged box is allowed to fill
  const FOCUS_MAX_WIDTH_FRAC = 0.86;
  const FOCUS_MAX_HEIGHT_FRAC = 0.86;
  const FOCUS_MAX_SCALE = 3.2;

  function focusBox(box) {
    // measure before any class changes — a box being newly focused is
    // always at its normal (untransformed) grid position at this point
    const rect = box.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const boxCenterX = rect.left + rect.width / 2;
    const boxCenterY = rect.top + rect.height / 2;

    const scale = Math.min(
      Math.max(
        Math.min((vw * FOCUS_MAX_WIDTH_FRAC) / rect.width, (vh * FOCUS_MAX_HEIGHT_FRAC) / rect.height),
        1
      ),
      FOCUS_MAX_SCALE
    );

    box.style.setProperty('--focus-x', `${vw / 2 - boxCenterX}px`);
    box.style.setProperty('--focus-y', `${vh / 2 - boxCenterY}px`);
    box.style.setProperty('--focus-scale', scale);

    boardGrid.classList.add('has-focus');
    boardGrid.querySelectorAll('.agenda-box').forEach(b => b.classList.remove('is-focused'));
    box.classList.add('is-focused');
  }

  function clearFocus() {
    boardGrid.classList.remove('has-focus');
    boardGrid.querySelectorAll('.agenda-box').forEach(b => b.classList.remove('is-focused'));
  }

  boardGrid.querySelectorAll('.agenda-box:not(.box-gamemode):not(.box-scrum)').forEach(box => {
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      if (box.classList.contains('is-focused')) {
        clearFocus();
      } else {
        focusBox(box);
      }
    });
  });

  // clicking anywhere else (background, gaps between boxes) clears focus
  document.addEventListener('click', () => {
    if (boardGrid.classList.contains('has-focus')) clearFocus();
  });

  // Escape also clears focus
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && boardGrid.classList.contains('has-focus')) clearFocus();
  });

  // keep the focused box centered if the window is resized/rotated
  window.addEventListener('resize', () => {
    const focused = boardGrid.querySelector('.agenda-box.is-focused');
    if (focused) focusBox(focused);
  });
}

/* ============================================================
   Prev / Next day navigation — steps to the next-highest or
   next-lowest date present in dates.txt (not necessarily the
   adjacent calendar day).
   ============================================================ */

async function initDayNav(currentDate, period) {
  const prevBtn = document.getElementById('prev-day-btn');
  const nextBtn = document.getElementById('next-day-btn');
  if (!prevBtn || !nextBtn) return;

  const dates = await loadDates();

  const idx = dates.indexOf(currentDate);

  // if the viewed date isn't itself in dates.txt, fall back to the
  // nearest neighbors by comparison rather than array index
  let prevDate, nextDate;
  if (idx !== -1) {
    prevDate = idx > 0 ? dates[idx - 1] : null;
    nextDate = idx < dates.length - 1 ? dates[idx + 1] : null;
  } else {
    prevDate = [...dates].reverse().find(d => d < currentDate) || null;
    nextDate = dates.find(d => d > currentDate) || null;
  }

  // assigned (not addEventListener'd) because this runs again every time the
  // period changes — a stacked listener would fire two navigations at once
  prevBtn.disabled = !prevDate;
  prevBtn.onclick = prevDate
    ? () => { window.location.href = agendaUrl(prevDate, period); }
    : null;

  nextBtn.disabled = !nextDate;
  nextBtn.onclick = nextDate
    ? () => { window.location.href = agendaUrl(nextDate, period); }
    : null;
}

/* ============================================================
   Now Playing — paste a YouTube video, playlist, or (usually)
   YouTube Music playlist link and it embeds inline. Persisted in
   localStorage on this device so it survives refreshes. Uses the
   YouTube IFrame API (not a plain <iframe src>) so we can set the
   starting volume low rather than relying on a URL parameter,
   which YouTube doesn't reliably support.
   ============================================================ */

const NOWPLAYING_START_VOLUME = 10; // 0-100, "one notch above mute"

function parseYouTubeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl.trim());
    let videoId = null;
    let listId = u.searchParams.get('list');

    if (u.hostname.includes('youtu.be')) {
      videoId = u.pathname.slice(1).split('/')[0] || null;
    } else if (u.hostname.includes('youtube.com') || u.hostname.includes('music.youtube.com')) {
      videoId = u.searchParams.get('v');
      if (!videoId && u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/embed/')[1]?.split('/')[0] || null;
      }
      if (!videoId && u.pathname.startsWith('/shorts/')) {
        videoId = u.pathname.split('/shorts/')[1]?.split('/')[0] || null;
      }
    }
    return { videoId: videoId || null, listId: listId || null };
  } catch (e) {
    return { videoId: null, listId: null };
  }
}

// lazily loads the YouTube IFrame API script exactly once, no matter
// how many times a new link gets pasted in
let ytApiPromise = null;
function loadYouTubeIframeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') prevReady();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

/* ============================================================
   Shared random-track machinery for every Now Playing box that has
   an editable link field (agenda, tutoring, study hall). Backs two
   behaviors: auto-filling a track when nothing is saved yet, and the
   die-shaped button that swaps in a new random pick on demand.

   music.txt lives at the repo root, one YouTube link per line.
   Fetched once and cached for the life of the page.
   ============================================================ */

let musicListPromise = null;
function loadMusicList() {
  if (!musicListPromise) {
    musicListPromise = fetch('music.txt')
      .then(r => r.ok ? r.text() : '')
      .then(text => text.split('\n').map(l => l.trim()).filter(Boolean))
      .catch(() => []);
  }
  return musicListPromise;
}

async function pickRandomMusicUrl() {
  const list = await loadMusicList();
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

// Same idea as loadMusicList/pickRandomMusicUrl above, but for Theater
// Mode's separate pool — theater.txt lives at the repo root, one
// YouTube link per line, fetched once and cached for the life of the
// page. Kept deliberately separate from music.txt so background music
// picks and theater-mode video picks never draw from the same list.
let theaterListPromise = null;
function loadTheaterList() {
  if (!theaterListPromise) {
    theaterListPromise = fetch('theater.txt')
      .then(r => r.ok ? r.text() : '')
      .then(text => text.split('\n').map(l => l.trim()).filter(Boolean))
      .catch(() => []);
  }
  return theaterListPromise;
}

async function pickRandomTheaterUrl() {
  const list = await loadTheaterList();
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

// Returns a YT onStateChange handler: once the video actually starts
// playing, it checks the real duration exactly once. Anything longer
// than an hour gets a fresh random start point somewhere between 0:00
// and one hour before the very end (so it never always opens on the
// same stretch, but always leaves a full hour to play). Anything an
// hour or shorter just plays normally from 0:00. Calls onJump(seconds)
// only when a jump actually happens, so the caller can update its
// input field to match.
function makeRandomStartHandler(YT, onJump) {
  let checked = false;
  return (e) => {
    if (checked || e.data !== YT.PlayerState.PLAYING) return;
    checked = true;
    const duration = e.target.getDuration ? e.target.getDuration() : 0;
    if (duration > 3600) {
      const start = Math.floor(Math.random() * (duration - 3600));
      e.target.seekTo(start, true);
      onJump(start);
    }
  };
}

// Wires a die-shaped randomize button that sits on the same row as a
// Now Playing link input: clicking it hands a fresh music.txt pick to
// the box's own load function, same as if it had been typed in.
function wireRandomButton(btn, loadFn) {
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadFn();
  });
  btn.addEventListener('dblclick', (e) => e.stopPropagation());
}

function initNowPlaying() {
  const input = document.getElementById('nowplaying-input');
  const embedContainer = document.getElementById('nowplaying-embed');
  const box = document.querySelector('.box-nowplaying');
  const randomBtn = document.getElementById('nowplaying-random-btn');
  if (!input || !embedContainer || !box) return;

  const STORAGE_KEY = 'agendaBoard.nowPlayingUrl';
  let player = null;

  // opts.isRandom marks a link that came from music.txt (auto-fill or the
  // die button) rather than something pasted in by hand: those get muted
  // autoplay (so they start without a click) and the >1hr random-start
  // check from makeRandomStartHandler(). A manually pasted link never
  // autoplays and is never randomly seeked.
  async function renderFromUrl(url, opts = {}) {
    const isRandom = !!opts.isRandom;
    const { videoId, listId } = parseYouTubeUrl(url);
    if (!videoId && !listId) {
      embedContainer.innerHTML = '';
      box.classList.remove('has-video');
      return;
    }

    embedContainer.innerHTML = '<div id="nowplaying-player"></div>';
    box.classList.add('has-video');

    const YT = await loadYouTubeIframeApi();
    if (player && player.destroy) {
      try { player.destroy(); } catch (e) { /* ignore */ }
    }

    const playerVars = { autoplay: isRandom ? 1 : 0, rel: 0, loop: 1 };
    if (isRandom) playerVars.mute = 1; // muted autoplay is allowed without a click; unmuted below
    if (listId) {
      playerVars.listType = 'playlist';
      playerVars.list = listId;
    } else if (videoId) {
      // YouTube only loops a single video if `playlist` is also set to
      // that same video's ID — loop:1 alone is silently ignored here.
      playerVars.playlist = videoId;
    }

    const onRandomStart = isRandom ? makeRandomStartHandler(YT, (start) => {
      input.value = `${url}&t=${start}s`;
    }) : null;

    player = new YT.Player('nowplaying-player', {
      width: '100%',
      height: '100%',
      // omit videoId entirely for playlist-only links — passing
      // `videoId: undefined` explicitly makes the IFrame API try to load
      // a video literally called "undefined" and throw "Invalid video id"
      ...(videoId ? { videoId } : {}),
      playerVars,
      events: {
        onReady: (e) => {
          e.target.setVolume(NOWPLAYING_START_VOLUME);
          if (isRandom) e.target.unMute();
        },
        ...(onRandomStart ? { onStateChange: onRandomStart } : {})
      }
    });
  }

  function commit() {
    const url = input.value.trim();
    if (!url) {
      localStorage.removeItem(STORAGE_KEY);
      embedContainer.innerHTML = '';
      box.classList.remove('has-video');
      return;
    }
    localStorage.setItem(STORAGE_KEY, url);
    renderFromUrl(url, { isRandom: false });
  }

  async function playRandomTrack() {
    const url = await pickRandomMusicUrl();
    if (!url) return;
    input.value = url;
    localStorage.setItem(STORAGE_KEY, url);
    renderFromUrl(url, { isRandom: true });
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    input.value = saved;
    renderFromUrl(saved, { isRandom: false });
  } else {
    // nothing saved yet on this device — start with a random track from
    // music.txt instead of sitting empty
    playRandomTrack();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commit(); input.blur(); }
  });
  input.addEventListener('blur', commit);
  // keep typing/selecting text from triggering the focus-mode or
  // double-click-fullscreen handlers on the box behind it
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());

  wireRandomButton(randomBtn, playRandomTrack);
}

/* ============================================================
   Count-up timer — a stopwatch for timing work blocks, logins,
   and transitions. Start / Stop / Clear, counting minutes and
   seconds (it rolls over to H:MM:SS past an hour).
   ============================================================ */

function initCountUpTimer() {
  const box = document.querySelector('.box-timer');
  const displayEl = document.getElementById('timer-display');
  const startBtn = document.getElementById('timer-start');
  const stopBtn = document.getElementById('timer-stop');
  const clearBtn = document.getElementById('timer-clear');
  if (!box || !displayEl || !startBtn || !stopBtn || !clearBtn) return;

  let elapsedMs = 0;     // time banked from previous run segments
  let startedAt = null;  // wall-clock ms when the current segment began
  let ticker = null;
  let lastTickSecond = -1; // last whole second we've already played a tick for

  // measured against Date.now() rather than counting interval fires, so a
  // throttled background tab can't make the timer drift slow
  const totalMs = () => elapsedMs + (startedAt === null ? 0 : Date.now() - startedAt);

  /* ---- ticking sound — synthesized with Web Audio so there's no sound
     file to fetch. A soft tick plays once per elapsed second while the
     timer is running; every 30th second gets a louder, lower tick so
     the room can hear time passing without anyone watching the clock. */
  let audioCtx = null;
  function getAudioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTick(loud) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = loud ? 1500 : 2700;
      const peak = loud ? 0.4 : 0.1;
      const dur = loud ? 0.11 : 0.035;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (e) { /* audio unavailable in this browser/context */ }
  }

  function checkTick() {
    if (startedAt === null) return;
    const totalSeconds = Math.floor(totalMs() / 1000);
    if (totalSeconds > lastTickSecond) {
      lastTickSecond = totalSeconds;
      playTick(totalSeconds > 0 && totalSeconds % 30 === 0);
    }
  }

  function format(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function paint() {
    displayEl.textContent = format(totalMs());
    const running = startedAt !== null;
    box.classList.toggle('is-running', running);
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    clearBtn.disabled = !running && totalMs() === 0;
    checkTick();
  }

  function start() {
    if (startedAt !== null) return;
    getAudioCtx(); // create/resume from this click — a real user gesture
    startedAt = Date.now();
    // don't replay a tick for the second we're resuming within
    lastTickSecond = Math.floor(totalMs() / 1000);
    ticker = setInterval(paint, 250);
    paint();
  }

  function stop() {
    if (startedAt === null) return;
    elapsedMs += Date.now() - startedAt;
    startedAt = null;
    clearInterval(ticker);
    ticker = null;
    paint();
  }

  function clear() {
    stop();
    elapsedMs = 0;
    lastTickSecond = -1;
    paint();
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  clearBtn.addEventListener('click', clear);

  // the buttons sit inside a bento box that also handles click-to-focus and
  // double-click-to-fullscreen — keep those from firing on timer clicks
  [startBtn, stopBtn, clearBtn].forEach(btn => {
    btn.addEventListener('click', (e) => e.stopPropagation());
    btn.addEventListener('dblclick', (e) => e.stopPropagation());
  });

  paint();
}

/* ============================================================
   Game Mode — a toggle button in the top hover-bar that swaps
   Agenda/Content Standard/Connections/SMART Goal for one big
   celebratory countdown to the end of the *current live* class
   period, plus screen-wide falling confetti. Toggled off again
   the same way (or it never turns on if there's no live period
   to count down to, since a countdown needs an end time).
   ============================================================ */

const CONFETTI_COLORS = ['#ff5e5e', '#ffb347', '#ffe066', '#6ee7b7', '#38bdf8', '#a78bfa', '#f472b6'];
const CONFETTI_COUNT = 90;
const CONFETTI_MIN_SIZE = 6;   // px, smallest confetti piece (falls fastest)
const CONFETTI_MAX_SIZE = 22;  // px, largest confetti piece (falls slowest)
const CONFETTI_MIN_FALL = 2.6; // s, fall duration for the smallest pieces
const CONFETTI_MAX_FALL = 8;   // s, fall duration for the largest pieces
const CONFETTI_MIN_DRIFT = 18; // px, narrowest side-to-side sway
const CONFETTI_MAX_DRIFT = 55; // px, widest side-to-side sway

function spawnConfetti(layer) {
  layer.innerHTML = '';
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const inner = document.createElement('span');
    inner.className = 'confetti-piece-inner';
    piece.appendChild(inner);

    const left = Math.random() * 100;
    // size drives everything else: bigger piece -> slower fall (inverse
    // relationship), so pick the size first and derive fall duration from it
    const sizeT = Math.random(); // 0 = smallest, 1 = largest
    const size = CONFETTI_MIN_SIZE + sizeT * (CONFETTI_MAX_SIZE - CONFETTI_MIN_SIZE);
    const fallDuration = CONFETTI_MIN_FALL + sizeT * (CONFETTI_MAX_FALL - CONFETTI_MIN_FALL);
    const spinDuration = 0.8 + Math.random() * 1.4;
    const delay = Math.random() * 6;
    const drift = CONFETTI_MIN_DRIFT + Math.random() * (CONFETTI_MAX_DRIFT - CONFETTI_MIN_DRIFT);
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

    piece.style.left = `${left}vw`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 1.6}px`;
    piece.style.setProperty('--drift', `${drift}px`);
    piece.style.animationDuration = `${fallDuration}s`;
    piece.style.animationDelay = `${delay}s`;

    inner.style.background = color;
    inner.style.borderRadius = Math.random() < 0.5 ? '50%' : '2px';
    inner.style.animationDuration = `${spinDuration}s`;
    inner.style.animationDelay = `${delay}s`;

    layer.appendChild(piece);
  }
}

function initGameMode() {
  const boardGrid = document.getElementById('board-grid');
  const toggleBtn = document.getElementById('gamemode-toggle-btn');
  const countdownEl = document.getElementById('gamemode-countdown');
  const confettiLayer = document.getElementById('confetti-layer');
  const autoInput = document.getElementById('gamemode-auto-input');
  if (!boardGrid || !toggleBtn || !countdownEl || !confettiLayer) return;

  let active = false;
  let tickHandle = null;

  async function tick() {
    const pt = getPacificNow();
    const scheduleKey = await resolveTodaysSchedule(pt);
    const bells = await loadBells();
    const scheduleData = bells[scheduleKey];
    if (!scheduleData) { countdownEl.textContent = '00:00'; return; }

    const nowMin = minutesSinceMidnight(pt);
    const { current } = findCurrentAndNext(scheduleData.periods, nowMin);

    if (current) {
      const remaining = hhmmToMinutes(current.end) - nowMin;
      countdownEl.textContent = fmtCountdown(remaining);
    } else {
      countdownEl.textContent = '00:00';
    }
  }

  function turnOn() {
    // Clean-Up Mode and Theater Mode are their own full-board takeovers —
    // never show more than one at once.
    if (window.__cleanupMode && window.__cleanupMode.isActive()) window.__cleanupMode.turnOff();
    if (window.__theaterMode && window.__theaterMode.isActive()) window.__theaterMode.turnOff();
    active = true;
    boardGrid.classList.add('game-mode-active');
    toggleBtn.classList.add('is-active');
    spawnConfetti(confettiLayer);
    tick();
    tickHandle = setInterval(tick, 1000);
    // Working/Deliver/SMART Goal just changed size (moved into the
    // left column) — re-fit their text to the new box dimensions.
    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  function turnOff() {
    active = false;
    boardGrid.classList.remove('game-mode-active');
    toggleBtn.classList.remove('is-active');
    confettiLayer.innerHTML = '';
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (active) turnOff(); else turnOn();
  });

  /* ---- Auto Game Mode — type a number of minutes-left, and Game
     Mode switches itself on the moment the live period's countdown
     reaches that number. Persisted per device; fires once per period
     (identified by date + period name) so turning Game Mode back off
     manually doesn't immediately re-trigger it. ---- */

  const GAMEMODE_AUTO_KEY = 'agendaBoard.gamemodeAutoMinutes';

  if (autoInput) {
    let autoMinutes = null;
    let firedForPeriodKey = null;

    try {
      const stored = localStorage.getItem(GAMEMODE_AUTO_KEY);
      if (stored !== null && stored !== '') {
        autoMinutes = Number(stored);
        autoInput.value = stored;
        autoInput.classList.add('is-armed');
      }
    } catch (e) { /* storage disabled */ }

    autoInput.addEventListener('click', (e) => e.stopPropagation());
    autoInput.addEventListener('change', () => {
      const raw = autoInput.value.trim();
      if (raw === '') {
        autoMinutes = null;
        autoInput.classList.remove('is-armed');
        try { localStorage.removeItem(GAMEMODE_AUTO_KEY); } catch (e) { /* storage disabled */ }
        return;
      }
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) return;
      autoMinutes = num;
      firedForPeriodKey = null; // a new threshold gets a fresh chance to fire
      autoInput.classList.add('is-armed');
      try { localStorage.setItem(GAMEMODE_AUTO_KEY, String(num)); } catch (e) { /* storage disabled */ }
    });

    async function autoCheck() {
      if (autoMinutes === null || active) return;
      const pt = getPacificNow();
      const scheduleKey = await resolveTodaysSchedule(pt);
      const bells = await loadBells();
      const scheduleData = bells[scheduleKey];
      if (!scheduleData) return;

      const nowMin = minutesSinceMidnight(pt);
      const { current } = findCurrentAndNext(scheduleData.periods, nowMin);
      if (!current) return;

      const remaining = hhmmToMinutes(current.end) - nowMin;
      const periodKey = `${pt.isoDate}|${current.name}`;
      if (remaining <= autoMinutes && firedForPeriodKey !== periodKey) {
        firedForPeriodKey = periodKey;
        turnOn();
      }
    }

    autoCheck();
    setInterval(autoCheck, 1000);
  }

  // lets other scripts on the page (e.g. vex.js's "auto Game Mode during
  // Break" logic) trigger Game Mode without re-implementing turnOn/turnOff
  window.__gameMode = { turnOn, turnOff, isActive: () => active };
}

/* ============================================================
   Clean-Up Mode — 7th Period only. Always auto-starts the moment
   10 minutes remain in 7th Period (no input to configure — this
   one's fixed, unlike Game Mode's auto-trigger). Draws numbers
   1-36 with no repeats over 5 minutes via a little claw-machine
   animation: whoever's number comes up puts their Chromebook away.
   Same full-board-takeover shape as Game Mode, but sparkles
   instead of confetti — and turning one mode on turns the other
   off, so they never show at the same time.
   ============================================================ */

const THEATER_PERIOD_NAME = '7th Period';
const THEATER_AUTO_MINUTES = 5;        // fixed — 7th Period only, starts w/ 5 min left

const CLEANUP_PERIOD_NAME = '7th Period';
const CLEANUP_AUTO_MINUTES = 10;       // fixed — always starts w/ 10 min left
const CLEANUP_NUMBER_COUNT = 36;
const CLEANUP_TOTAL_MS = 5 * 60 * 1000; // get through all 36 numbers in 5 min
const CLEANUP_DROP_MS = 900;
const CLEANUP_GRAB_MS = 280;
const CLEANUP_LIFT_MS = 900;
const CLEANUP_PIT_BALL_COUNT = 10;

// flat colors cycled for the "already pulled" jar chips — deliberately flat
// (no gradient) per the ball-pit/claw balls, which are rendered as glassy
// gradients so the jar chips read as a visually distinct, simpler token
const CLEANUP_JAR_COLORS = ['#fbbf24', '#38bdf8', '#a78bfa', '#4ade80', '#fb7185', '#f97316'];

const SPARKLE_COUNT = 70;
const SPARKLE_MIN_SIZE = 5;
const SPARKLE_MAX_SIZE = 16;
const SPARKLE_MIN_FALL = 3;
const SPARKLE_MAX_FALL = 9;
const SPARKLE_MIN_DRIFT = 14;
const SPARKLE_MAX_DRIFT = 46;

function spawnSparkles(layer) {
  layer.innerHTML = '';
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const piece = document.createElement('span');
    piece.className = 'sparkle-piece';
    const inner = document.createElement('span');
    inner.className = 'sparkle-piece-inner';
    piece.appendChild(inner);

    const left = Math.random() * 100;
    const sizeT = Math.random();
    const size = SPARKLE_MIN_SIZE + sizeT * (SPARKLE_MAX_SIZE - SPARKLE_MIN_SIZE);
    const fallDuration = SPARKLE_MIN_FALL + sizeT * (SPARKLE_MAX_FALL - SPARKLE_MIN_FALL);
    const twinkleDuration = 0.9 + Math.random() * 1.6;
    const delay = Math.random() * 6;
    const drift = SPARKLE_MIN_DRIFT + Math.random() * (SPARKLE_MAX_DRIFT - SPARKLE_MIN_DRIFT);

    piece.style.left = `${left}vw`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    piece.style.setProperty('--drift', `${drift}px`);
    piece.style.animationDuration = `${fallDuration}s`;
    piece.style.animationDelay = `${delay}s`;

    inner.style.animationDuration = `${twinkleDuration}s`;
    inner.style.animationDelay = `${delay}s`;

    layer.appendChild(piece);
  }
}

// Fisher-Yates — returns [1..count] in random order, no repeats.
function shuffledNumbers(count) {
  const arr = Array.from({ length: count }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Reads each number aloud via the browser's built-in speech synthesis
// (no external service, no setup) — silently does nothing if the
// browser doesn't support it or a voice isn't available yet.
function speakCleanupNumber(n) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // don't let calls stack up/overlap
    const utter = new SpeechSynthesisUtterance(`Number ${n}`);
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  } catch (e) { /* speech synthesis unavailable — silently skip */ }
}

function initCleanupMode() {
  const boardGrid = document.getElementById('board-grid');
  const toggleBtn = document.getElementById('cleanup-toggle-btn');
  const sparkleLayer = document.getElementById('sparkle-layer');
  const clawArm = document.getElementById('cleanup-claw-arm');
  const numberEl = document.getElementById('cleanup-number');
  const countdownEl = document.getElementById('cleanup-countdown');
  const messageEl = document.getElementById('cleanup-message');
  const calledListEl = document.getElementById('cleanup-called-list');
  const pitEl = document.getElementById('cleanup-ball-pit');
  const jarEl = document.getElementById('cleanup-jar');
  if (!boardGrid || !toggleBtn || !sparkleLayer || !clawArm || !numberEl || !countdownEl) return;

  // decorative resting balls in the claw-machine pit — placed once,
  // never move or mean anything, just set the scene
  if (pitEl && !pitEl.dataset.seeded) {
    pitEl.dataset.seeded = 'true';
    for (let i = 0; i < CLEANUP_PIT_BALL_COUNT; i++) {
      const ball = document.createElement('span');
      ball.className = 'pit-ball';
      ball.style.left = `${8 + Math.random() * 78}%`;
      ball.style.bottom = `${Math.random() * 55}%`;
      pitEl.appendChild(ball);
    }
  }

  let active = false;
  let sequenceTimeout = null;
  let countdownHandle = null;
  let queue = [];
  let queueIndex = 0;
  let sequenceEndsAt = 0;

  function resetClaw() {
    clawArm.classList.remove('is-dropping', 'is-grabbing', 'is-lifting');
  }

  function tickCountdown() {
    const msLeft = Math.max(0, sequenceEndsAt - Date.now());
    countdownEl.textContent = fmtCountdown(msLeft / 60000);
    if (msLeft <= 0 && countdownHandle) { clearInterval(countdownHandle); countdownHandle = null; }
  }

  function finishSequence() {
    if (messageEl) messageEl.textContent = 'Clean-up crew complete — thank you!';
  }

  function scheduleNext() {
    if (!active) return;
    if (queueIndex >= CLEANUP_NUMBER_COUNT) { finishSequence(); return; }
    // pace remaining draws evenly across whatever time is actually left,
    // rather than a fixed gap, so the sequence still lands on time even
    // if a tab was backgrounded and timers got throttled/delayed
    const remainingNumbers = CLEANUP_NUMBER_COUNT - queueIndex;
    const remainingMs = Math.max(0, sequenceEndsAt - Date.now());
    const gap = remainingMs / remainingNumbers;
    sequenceTimeout = setTimeout(pullNextBall, gap);
  }

  function pullNextBall() {
    if (!active) return;
    if (queueIndex >= queue.length) { finishSequence(); return; }
    const number = queue[queueIndex];
    queueIndex++;

    resetClaw();
    requestAnimationFrame(() => clawArm.classList.add('is-dropping'));

    sequenceTimeout = setTimeout(() => {
      clawArm.classList.add('is-grabbing');

      sequenceTimeout = setTimeout(() => {
        clawArm.classList.remove('is-dropping');
        clawArm.classList.add('is-lifting');

        numberEl.textContent = String(number);
        numberEl.classList.remove('is-revealing');
        void numberEl.offsetWidth; // restart the reveal animation
        numberEl.classList.add('is-revealing');
        speakCleanupNumber(number);

        if (calledListEl) {
          const chip = document.createElement('span');
          chip.className = 'cleanup-called-chip';
          chip.textContent = number;
          calledListEl.appendChild(chip);
        }
        if (jarEl) {
          // drop a flat, numbered circle into the jar behind the big
          // number — the accumulating pile of everyone who's already
          // been called
          const jarBall = document.createElement('span');
          jarBall.className = 'cleanup-jar-ball';
          jarBall.textContent = number;
          jarBall.style.setProperty(
            '--jar-ball-color',
            CLEANUP_JAR_COLORS[(number - 1) % CLEANUP_JAR_COLORS.length]
          );
          jarEl.appendChild(jarBall);
        }
        if (messageEl) {
          messageEl.textContent = `Number ${number} — put your Chromebook away!`;
        }

        sequenceTimeout = setTimeout(() => {
          resetClaw();
          scheduleNext();
        }, CLEANUP_LIFT_MS);
      }, CLEANUP_GRAB_MS);
    }, CLEANUP_DROP_MS);
  }

  function turnOn() {
    if (active) return;
    // Game Mode and Theater Mode are their own full-board takeovers —
    // never show more than one at once.
    if (window.__gameMode && window.__gameMode.isActive()) window.__gameMode.turnOff();
    if (window.__theaterMode && window.__theaterMode.isActive()) window.__theaterMode.turnOff();

    active = true;
    boardGrid.classList.add('cleanup-mode-active');
    toggleBtn.classList.add('is-active');
    spawnSparkles(sparkleLayer);

    queue = shuffledNumbers(CLEANUP_NUMBER_COUNT);
    queueIndex = 0;
    sequenceEndsAt = Date.now() + CLEANUP_TOTAL_MS;
    numberEl.textContent = '?';
    numberEl.classList.remove('is-revealing');
    if (calledListEl) calledListEl.innerHTML = '';
    if (jarEl) jarEl.innerHTML = '';
    if (messageEl) messageEl.textContent = 'Here we go — watch for your number!';

    tickCountdown();
    countdownHandle = setInterval(tickCountdown, 1000);
    pullNextBall();

    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  function turnOff() {
    if (!active) return;
    active = false;
    boardGrid.classList.remove('cleanup-mode-active');
    toggleBtn.classList.remove('is-active');
    sparkleLayer.innerHTML = '';
    resetClaw();
    if (sequenceTimeout) { clearTimeout(sequenceTimeout); sequenceTimeout = null; }
    if (countdownHandle) { clearInterval(countdownHandle); countdownHandle = null; }
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (active) turnOff(); else turnOn();
  });

  // lets Game Mode's turnOn() switch this back off, same pattern as
  // window.__gameMode above
  window.__cleanupMode = { turnOn, turnOff, isActive: () => active };

  /* ---- Auto-trigger — always on, 7th Period only, fires once the
     live countdown hits CLEANUP_AUTO_MINUTES. Unlike Game Mode's
     auto-trigger this isn't a text input Ms. Herrick sets per device;
     it's a fixed default so it just works every day without setup. ---- */

  let firedForPeriodKey = null;

  async function autoCheck() {
    if (active) return;
    const pt = getPacificNow();
    const scheduleKey = await resolveTodaysSchedule(pt);
    const bells = await loadBells();
    const scheduleData = bells[scheduleKey];
    if (!scheduleData) return;

    const nowMin = minutesSinceMidnight(pt);
    const { current } = findCurrentAndNext(scheduleData.periods, nowMin);
    if (!current || current.name !== CLEANUP_PERIOD_NAME) return;

    const remaining = hhmmToMinutes(current.end) - nowMin;
    const periodKey = `${pt.isoDate}|${current.name}`;
    if (remaining <= CLEANUP_AUTO_MINUTES && firedForPeriodKey !== periodKey) {
      firedForPeriodKey = periodKey;
      turnOn();
    }
  }

  autoCheck();
  setInterval(autoCheck, 1000);
}

/* ============================================================
   Theater Mode — 7th Period only, like Clean-Up Mode. Auto-starts
   the moment 5 minutes remain in 7th Period, right after Clean-Up
   Mode's own 5-minute sequence finishes. It never auto-starts in
   any other period; the toolbar button still turns it on by hand
   whenever you want it. Same full-board-takeover shape as
   Game Mode and Clean-Up Mode, but instead of a countdown/animation
   panel, the entire right-hand panel is one huge YouTube player
   showing a random pick from theater.txt (a separate list from
   music.txt's background-music links). Turning this mode on turns
   the other two off, and vice versa, so only one ever shows at once.
   ============================================================ */

function initTheaterMode() {
  const boardGrid = document.getElementById('board-grid');
  const toggleBtn = document.getElementById('theater-toggle-btn');
  const embedContainer = document.getElementById('theater-embed');
  const messageEl = document.getElementById('theater-message');
  if (!boardGrid || !toggleBtn || !embedContainer) return;

  let active = false;
  let player = null;

  async function renderRandomVideo() {
    if (messageEl) messageEl.textContent = '';
    embedContainer.innerHTML = '';

    const url = await pickRandomTheaterUrl();
    if (!url) {
      if (messageEl) messageEl.textContent = 'Add video links to theater.txt to use Theater Mode.';
      return;
    }

    const { videoId, listId } = parseYouTubeUrl(url);
    if (!videoId && !listId) {
      if (messageEl) messageEl.textContent = 'Add video links to theater.txt to use Theater Mode.';
      return;
    }

    embedContainer.innerHTML = '<div id="theater-player"></div>';

    const YT = await loadYouTubeIframeApi();
    if (player && player.destroy) {
      try { player.destroy(); } catch (e) { /* ignore */ }
    }

    // Same muted-autoplay-then-unmute dance as Now Playing's random
    // picks (see initNowPlaying) — muted autoplay is allowed without a
    // click, then we unmute once the player reports ready.
    const playerVars = { autoplay: 1, rel: 0, mute: 1 };
    if (listId) {
      playerVars.listType = 'playlist';
      playerVars.list = listId;
    }

    // reuses the same >1hr random-start logic Now Playing uses for its
    // random music.txt picks, so a long video doesn't always open on
    // the same opening stretch
    const onRandomStart = makeRandomStartHandler(YT, () => { /* no input field to sync here */ });

    player = new YT.Player('theater-player', {
      width: '100%',
      height: '100%',
      ...(videoId ? { videoId } : {}),
      playerVars,
      events: {
        onReady: (e) => {
          e.target.setVolume(NOWPLAYING_START_VOLUME);
          e.target.unMute();
        },
        onStateChange: onRandomStart
      }
    });
  }

  function turnOn() {
    if (active) return;
    // Game Mode and Clean-Up Mode are their own full-board takeovers —
    // never show more than one at once.
    if (window.__gameMode && window.__gameMode.isActive()) window.__gameMode.turnOff();
    if (window.__cleanupMode && window.__cleanupMode.isActive()) window.__cleanupMode.turnOff();

    active = true;
    boardGrid.classList.add('theater-mode-active');
    toggleBtn.classList.add('is-active');
    renderRandomVideo();

    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  function turnOff() {
    if (!active) return;
    active = false;
    boardGrid.classList.remove('theater-mode-active');
    toggleBtn.classList.remove('is-active');
    if (player && player.destroy) {
      try { player.destroy(); } catch (e) { /* ignore */ }
    }
    player = null;
    embedContainer.innerHTML = '';
    if (messageEl) messageEl.textContent = '';
    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (active) turnOff(); else turnOn();
  });

  // lets Game Mode's and Clean-Up Mode's turnOn() switch this back off,
  // same pattern as window.__gameMode / window.__cleanupMode above
  window.__theaterMode = { turnOn, turnOff, isActive: () => active };

  /* ---- Auto-trigger — always on, but 7th Period ONLY (same single-
     period restriction as Clean-Up Mode). Fires once the live
     countdown hits THEATER_AUTO_MINUTES, i.e. the last 5 minutes of
     7th Period, right as Clean-Up Mode's own sequence finishes. No
     other period auto-starts Theater Mode — the toolbar button still
     turns it on by hand any time. ---- */

  let firedForPeriodKey = null;

  async function autoCheck() {
    if (active) return;
    const pt = getPacificNow();
    const scheduleKey = await resolveTodaysSchedule(pt);
    const bells = await loadBells();
    const scheduleData = bells[scheduleKey];
    if (!scheduleData) return;

    const nowMin = minutesSinceMidnight(pt);
    const { current } = findCurrentAndNext(scheduleData.periods, nowMin);
    if (!current) return;
    if (current.name !== THEATER_PERIOD_NAME) return;

    const remaining = hhmmToMinutes(current.end) - nowMin;
    const periodKey = `${pt.isoDate}|${current.name}`;
    if (remaining <= THEATER_AUTO_MINUTES && firedForPeriodKey !== periodKey) {
      firedForPeriodKey = periodKey;
      turnOn();
    }
  }

  autoCheck();
  setInterval(autoCheck, 1000);
}

/* ============================================================
   Month calendar bento — sits in the half of the old clock slot
   the clock gave up. Shows the current (Pacific) month with today
   highlighted. Re-renders once a minute so a board left running
   overnight rolls over to the new day on its own.
   ============================================================ */

const CAL_DOW_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function initMiniCalendar() {
  const gridEl = document.getElementById('cal-mini-grid');
  const titleEl = document.getElementById('cal-mini-title');
  if (!gridEl || !titleEl) return;

  let lastRendered = null;

  function render() {
    const pt = getPacificNow();
    if (pt.isoDate === lastRendered) return;
    lastRendered = pt.isoDate;

    const [year, month, day] = pt.isoDate.split('-').map(Number);
    const monthIdx = month - 1;

    titleEl.textContent = `${MONTHS_FULL[monthIdx]} ${year}`;

    const firstWeekday = new Date(Date.UTC(year, monthIdx, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

    const cells = CAL_DOW_LETTERS.map(
      letter => `<span class="cal-mini-dow">${letter}</span>`
    );
    for (let i = 0; i < firstWeekday; i++) {
      cells.push('<span class="cal-mini-blank"></span>');
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const weekday = (firstWeekday + d - 1) % 7;
      const classes = ['cal-mini-day'];
      if (weekday === 0 || weekday === 6) classes.push('is-weekend');
      if (d === day) classes.push('is-today');
      cells.push(`<span class="${classes.join(' ')}">${d}</span>`);
    }

    gridEl.innerHTML = cells.join('');
  }

  render();
  setInterval(render, 60000);
}

/* ============================================================
   In-class Help Queue bento.

   Same behaviour as the Tutoring page's queue box — paste a room
   link, it's remembered on this device, and the input tucks itself
   away until you hover — but packed into one small bento that also
   carries its own "Join the queue at" banner.

   Uses its own storage key so pasting a room code for a class
   period never quietly rewrites what the Tutoring board is showing
   after school.
   ============================================================ */

/* Shared Help Queue parsing — used by the in-class bento below and by the
   Tutoring page's queue box in tutoring.js.

   The board only ever shows students the five-character room code; the full
   link lives on Google Classroom. Accepts either a pasted room link or the
   bare code, and hands back both the code to display and the URL to embed. */

const QUEUE_BASE_URL = 'https://iherrick-mps.github.io/queue/';

function parseQueueRoom(raw) {
  const text = String(raw || '').trim();
  if (!text) return { code: '', url: '' };

  // just the code typed in on its own — build the room link around it
  if (/^[A-Za-z0-9]{4,8}$/.test(text)) {
    const code = text.toUpperCase();
    return { code: code, url: QUEUE_BASE_URL + '?room=' + code };
  }

  // otherwise it's a link — pull ?room=XXXXX out of it
  let code = '';
  try {
    code = new URL(text).searchParams.get('room') || '';
  } catch (e) {
    const m = text.match(/[?&]room=([^&#\s]+)/i);
    if (m) code = m[1];
  }
  return { code: code.toUpperCase(), url: text };
}

function initClassQueue() {
  const input = document.getElementById('class-queue-input');
  const embedContainer = document.getElementById('class-queue-embed');
  const box = document.getElementById('class-queue-box');
  const codeEl = document.getElementById('class-queue-code');
  if (!input || !embedContainer || !box) return;

  const STORAGE_KEY = 'agendaBoard.classQueueUrl';

  function renderFromUrl(raw) {
    const room = parseQueueRoom(raw);
    const url = room.url;
    if (codeEl) codeEl.textContent = room.code;

    if (!url) {
      embedContainer.innerHTML = '';
      box.classList.remove('has-queue');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = 'Help Queue';
    iframe.allow = 'clipboard-write';

    embedContainer.innerHTML = '';
    embedContainer.appendChild(iframe);
    box.classList.add('has-queue');
  }

  function commit() {
    const url = input.value.trim();
    if (!url) {
      localStorage.removeItem(STORAGE_KEY);
      renderFromUrl('');
      return;
    }
    localStorage.setItem(STORAGE_KEY, url);
    renderFromUrl(url);
  }

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); }
  catch (e) { /* storage disabled */ }
  if (saved) {
    input.value = saved;
    renderFromUrl(saved);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commit(); input.blur(); }
  });
  input.addEventListener('blur', commit);
  // keep typing/selecting from triggering click-to-focus or the
  // double-click-fullscreen handler on the box behind it
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initIndexPage();
  initAgendaPage();
  initFullscreenToggle();
  initFocusMode();
  initNowPlaying();
  initCountUpTimer();
  initGameMode();
  initCleanupMode();
  initTheaterMode();
  initMiniCalendar();
  initClassQueue();

  // belt-and-suspenders: re-fit everything once web fonts are confirmed
  // loaded, in case something rendered/measured before that point
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => fitAllBoxes());
  }
});