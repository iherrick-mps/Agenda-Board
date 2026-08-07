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

  return pacificNow.weekdayName === 'Wednesday' ? 'shortened' : 'regular';
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

    const timeEl = document.getElementById('clock-time');
    if (timeEl) {
      timeEl.innerHTML =
        `${h12}<span class="colon">:</span>${mm}<span class="colon">:</span>${ss} ` +
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
   Index page — date list (today pinned to top, then furthest
   future down to oldest)
   ============================================================ */

async function initIndexPage() {
  const listEl = document.getElementById('date-list');
  if (!listEl) return;

  const res = await fetch('dates.txt');
  const pt = getPacificNow();
  const text = await res.text();
  const dates = text.split('\n').map(d => d.trim()).filter(Boolean);

  if (dates.length === 0) {
    listEl.outerHTML = '<div class="empty-note">No dates found in dates.txt yet.</div>';
    return;
  }

  const today = pt.isoDate;
  const hasToday = dates.includes(today);
  const rest = dates.filter(d => d !== today)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // furthest future -> oldest
  const ordered = hasToday ? [today, ...rest] : rest;

  listEl.innerHTML = ordered.map(d => {
    const dt = new Date(`${d}T00:00:00Z`);
    const weekday = WEEKDAYS[dt.getUTCDay()];
    const month = MONTHS[dt.getUTCMonth()];
    const day = dt.getUTCDate();
    const year = dt.getUTCFullYear();
    const isToday = d === today;
    return `
      <li class="${isToday ? 'is-today' : ''}">
        <a href="agenda.html?date=${d}">
          <span>
            <span class="date-main">${month} ${day}, ${year}</span>${isToday ? '<span class="today-tag">TODAY</span>' : ''}<br>
            <span class="date-weekday">${weekday}</span>
          </span>
          <span class="date-arrow">View agenda &rarr;</span>
        </a>
      </li>`;
  }).join('');
}

/* ============================================================
   Agenda page — persistent bento board + period tabs
   ============================================================ */

const PERIOD_ORDER = ['4th Period', '6th Period', '7th Period'];
const PIN_COLOR = {
  '4th Period': 'var(--c-goal)',
  '6th Period': 'var(--c-standard)',
  '7th Period': 'var(--c-eld)'
};

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

function renderBoxValue(value) {
  if (Array.isArray(value)) {
    return `<ul>${value.map(item => `<li>${item}</li>`).join('')}</ul>`;
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
  // wait a frame so layout settles before measuring
  requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
}

async function initAgendaPage() {
  const boardGrid = document.getElementById('board-grid');
  if (!boardGrid) return;

  const params = new URLSearchParams(window.location.search);
  const dateStr = params.get('date');
  const headerDateEl = document.getElementById('agenda-date');
  const scheduleEl = document.getElementById('agenda-schedule');
  const tabsEl = document.getElementById('period-tabs');

  if (!dateStr) {
    headerDateEl.textContent = 'No date specified';
    return;
  }

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

  // Is the *viewed* date today (in PT)? If so, which period is live right now?
  const pt = getPacificNow();
  let livePeriodName = null;
  if (pt.isoDate === dateStr) {
    const scheduleData = bells[dayData.schedule];
    if (scheduleData) {
      const nowMin = minutesSinceMidnight(pt);
      const { current } = findCurrentAndNext(scheduleData.periods, nowMin);
      if (current) livePeriodName = current.name;
    }
  }

  tabsEl.innerHTML = periodsPresent.map(p => {
    const isLive = p === livePeriodName;
    return `<button class="period-tab${isLive ? ' is-now' : ''}" data-period="${p}" style="--pin-color:${PIN_COLOR[p] || '#cdd8e6'}">${p} &middot; ${dayData.periods[p].grade || ''}</button>`;
  }).join('');

  function selectPeriod(period) {
    tabsEl.querySelectorAll('.period-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === period);
    });
    renderPeriodContent(dayData.periods[period]);
  }

  tabsEl.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', () => selectPeriod(btn.dataset.period));
  });

  const defaultPeriod = (livePeriodName && periodsPresent.includes(livePeriodName))
    ? livePeriodName
    : periodsPresent[0];
  if (defaultPeriod) selectPeriod(defaultPeriod);
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initIndexPage();
  initAgendaPage();
});
