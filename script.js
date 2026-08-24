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

    const scheduleKey = await resolveTodaysSchedule(pt);
    const scheduleData = bells[scheduleKey];
    const statusEl = document.getElementById('clock-status');
    const labelEl = document.getElementById('clock-status-label');
    const valueEl = document.getElementById('clock-status-value');

    if (!scheduleData || !statusEl) return;

    const nowMin = minutesSinceMidnight(pt);
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

function fitBoxText(contentEl, { min = 9, max = 160 } = {}) {
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

// maps a JSON field name -> the box's content element id
const FIELD_TO_EL = {
  workingNow:        'content-working',
  weeklyDeliverable: 'content-deliver',
  smartGoal:         'content-goal',
  contentStandard:   'content-standard',
  eldStandard:       'content-eld',
  agenda:            'content-agenda',
  connections:       'content-connect'
};

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

// Figures out "right now, in Pacific time, which date + period should the
// board be showing?" Used by current-day.html to decide what to embed —
// pulls the same data file and bell logic the agenda page itself uses, so
// the two never disagree.
async function resolveLiveDateAndPeriod() {
  const pt = getPacificNow();
  const dateStr = pt.isoDate;

  let dayData;
  try {
    const res = await fetch(`data/${dateStr}.json`);
    if (!res.ok) throw new Error('not found');
    dayData = await res.json();
  } catch (e) {
    return { dateStr, period: null };
  }

  const periodsPresent = PERIOD_ORDER.filter(p => dayData.periods && dayData.periods[p]);
  const bells = await loadBells();
  const nowMin = minutesSinceMidnight(pt);
  const period =
    computeEffectivePeriod(bells[dayData.schedule], periodsPresent, nowMin) ||
    periodsPresent[0] || null;

  return { dateStr, period };
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
    const workingEl = document.getElementById('content-working');
    if (workingEl) workingEl.textContent = `No agenda file found for ${dateStr}.`;
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

  boardGrid.querySelectorAll('.agenda-box:not(.box-gamemode)').forEach(box => {
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

function initNowPlaying() {
  const input = document.getElementById('nowplaying-input');
  const embedContainer = document.getElementById('nowplaying-embed');
  const box = document.querySelector('.box-nowplaying');
  if (!input || !embedContainer || !box) return;

  const STORAGE_KEY = 'agendaBoard.nowPlayingUrl';
  let player = null;

  async function renderFromUrl(url) {
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

    const playerVars = { autoplay: 0, rel: 0, loop: 1 };
    if (listId) {
      playerVars.listType = 'playlist';
      playerVars.list = listId;
    } else if (videoId) {
      // YouTube only loops a single video if `playlist` is also set to
      // that same video's ID — loop:1 alone is silently ignored here.
      playerVars.playlist = videoId;
    }

    player = new YT.Player('nowplaying-player', {
      width: '100%',
      height: '100%',
      videoId: videoId || undefined,
      playerVars,
      events: {
        onReady: (e) => e.target.setVolume(NOWPLAYING_START_VOLUME)
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
    renderFromUrl(url);
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    input.value = saved;
    renderFromUrl(saved);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commit(); input.blur(); }
  });
  input.addEventListener('blur', commit);
  // keep typing/selecting text from triggering the focus-mode or
  // double-click-fullscreen handlers on the box behind it
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
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

  // belt-and-suspenders: re-fit everything once web fonts are confirmed
  // loaded, in case something rendered/measured before that point
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => fitAllBoxes());
  }
});
