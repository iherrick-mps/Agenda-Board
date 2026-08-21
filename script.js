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

    const dateEl = document.getElementById('clock-date');
    if (dateEl) {
      dateEl.textContent = `${pt.isoDate.replaceAll('-', '/')} \u00b7 ${pt.weekdayName.toUpperCase()}`;
    }

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

  function focusBox(box) {
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

    const playerVars = { autoplay: 0, rel: 0 };
    if (listId) {
      playerVars.listType = 'playlist';
      playerVars.list = listId;
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

  // measured against Date.now() rather than counting interval fires, so a
  // throttled background tab can't make the timer drift slow
  const totalMs = () => elapsedMs + (startedAt === null ? 0 : Date.now() - startedAt);

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
  }

  function start() {
    if (startedAt !== null) return;
    startedAt = Date.now();
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

function spawnConfetti(layer) {
  layer.innerHTML = '';
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const left = Math.random() * 100;
    const fallDuration = 3.5 + Math.random() * 3.5;
    const spinDuration = 0.8 + Math.random() * 1.4;
    const delay = Math.random() * 6;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.left = `${left}vw`;
    piece.style.background = color;
    piece.style.borderRadius = Math.random() < 0.5 ? '50%' : '2px';
    piece.style.animationDuration = `${fallDuration}s, ${spinDuration}s`;
    piece.style.animationDelay = `${delay}s, ${delay}s`;
    layer.appendChild(piece);
  }
}

function initGameMode() {
  const boardGrid = document.getElementById('board-grid');
  const toggleBtn = document.getElementById('gamemode-toggle-btn');
  const countdownEl = document.getElementById('gamemode-countdown');
  const confettiLayer = document.getElementById('confetti-layer');
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
