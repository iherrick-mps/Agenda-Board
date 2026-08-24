/* ============================================================
   VEX Robotics Club page — after-school (3:00–4:00 PM) board.
   Own bento layout, reusing the shared clock / Game Mode / confetti /
   click-to-focus plumbing from script.js (same id="board-grid").
   Depends on getPacificNow(), minutesSinceMidnight(), hhmmToMinutes(),
   loadBells(), resolveTodaysSchedule(), findCurrentAndNext(),
   parseYouTubeUrl(), loadYouTubeIframeApi(), and fitAllBoxes(), all
   defined in script.js — load this file after script.js.
   ============================================================ */

/* ---- Team roster — empty for now. Add teams as they're formed:
   { name: '87292A', note: 'Alex, Jordan, Sam' } ---- */
const VEX_TEAMS = [
  // { name: '87292A', note: 'Alex, Jordan, Sam' },
];

/* ---- Next competition — edit these two lines as new dates are set ---- */
const VEX_NEXT_COMPETITION = '2027-01-15'; // YYYY-MM-DD
const VEX_NEXT_COMPETITION_LABEL = 'January 15';

/* ---- Now Playing defaults ---- */
const VEX_NOWPLAYING_URL = 'https://music.youtube.com/playlist?list=PLKwpsUctVAO8&si=Aio1rMg-SqWJhbM6';
const VEX_NOWPLAYING_VOLUME = 10; // 0-100

/* ---------- helpers ---------- */

function vexParseIsoDateLocal(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight — no UTC offset surprises
}

// counts how many Mondays + Saturdays fall in [fromDate, toDateExclusive)
function vexCountMondaysAndSaturdays(fromDate, toDateExclusive) {
  let count = 0;
  const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  while (cur < toDateExclusive) {
    const day = cur.getDay(); // 0=Sun ... 6=Sat
    if (day === 1 || day === 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function vexFmt12(hhmm) {
  let [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = ((h + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* ---------- Countdown to next competition ---------- */

function initVexCountdown() {
  const numEl = document.getElementById('vex-countdown-number');
  const subEl = document.getElementById('vex-countdown-sub');
  if (!numEl) return;

  function paint() {
    const pt = getPacificNow();
    const today = vexParseIsoDateLocal(pt.isoDate);
    const target = vexParseIsoDateLocal(VEX_NEXT_COMPETITION);

    if (today >= target) {
      numEl.textContent = 'Today!';
      if (subEl) subEl.textContent = VEX_NEXT_COMPETITION_LABEL;
      return;
    }

    const n = vexCountMondaysAndSaturdays(today, target);
    numEl.textContent = String(n);
    if (subEl) {
      subEl.textContent = `Monday${n === 1 ? '' : 's'}/Saturday${n === 1 ? '' : 's'} until ${VEX_NEXT_COMPETITION_LABEL}`;
    }
  }

  paint();
  setInterval(paint, 60 * 1000);
}

/* ---------- Team roster ---------- */

function initVexTeams() {
  const listEl = document.getElementById('vex-teams-list');
  if (!listEl) return;

  if (VEX_TEAMS.length === 0) {
    listEl.innerHTML = ''; // CSS :empty::before shows the placeholder
    return;
  }

  listEl.innerHTML = VEX_TEAMS.map(t => {
    const note = t.note ? `<span class="vex-team-note">${t.note}</span>` : '';
    return `<li><span class="vex-team-name">${t.name}</span>${note}</li>`;
  }).join('');

  document.fonts.ready.then(() => {
    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  });
}

/* ---------- Saturday-only bell schedule ---------- */

async function initVexSaturdaySchedule() {
  const grid = document.getElementById('board-grid');
  const listEl = document.getElementById('vex-schedule-list');
  if (!grid) return;

  async function paint() {
    const pt = getPacificNow();
    const isSaturday = pt.weekdayName === 'Saturday';
    grid.classList.toggle('is-saturday', isSaturday);
    if (!isSaturday || !listEl) return;

    const bells = await loadBells();
    const sched = bells.saturday;
    if (!sched) {
      listEl.innerHTML = '<li>No Saturday schedule found in bells.json.</li>';
      return;
    }

    const nowMin = minutesSinceMidnight(getPacificNow());
    listEl.innerHTML = sched.periods.map(p => {
      const start = hhmmToMinutes(p.start);
      const end = hhmmToMinutes(p.end);
      const isNow = nowMin >= start && nowMin < end;
      return `<li class="${isNow ? 'is-now' : ''}">` +
        `<span class="vex-sched-name">${p.name}</span>` +
        `<span class="vex-sched-time">${vexFmt12(p.start)}&ndash;${vexFmt12(p.end)}</span>` +
        `</li>`;
    }).join('');

    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  await paint();
  setInterval(paint, 30 * 1000);
}

/* ---------- Auto Game Mode during the Saturday "Break" period ---------- */

function initVexBreakAutoGameMode() {
  let activatedByAuto = false;

  async function check() {
    const gm = window.__gameMode;
    if (!gm) return;

    const pt = getPacificNow();
    if (pt.weekdayName !== 'Saturday') {
      if (activatedByAuto && gm.isActive()) { gm.turnOff(); activatedByAuto = false; }
      return;
    }

    const scheduleKey = await resolveTodaysSchedule(pt);
    const bells = await loadBells();
    const scheduleData = bells[scheduleKey];
    if (!scheduleData) return;

    const nowMin = minutesSinceMidnight(pt);
    const { current } = findCurrentAndNext(scheduleData.periods, nowMin);
    const isBreak = !!(current && current.name.trim().toLowerCase() === 'break');

    if (isBreak && !gm.isActive()) {
      gm.turnOn();
      activatedByAuto = true;
    } else if (!isBreak && activatedByAuto && gm.isActive()) {
      // only auto-turn-off if WE turned it on — never fight a manual toggle
      gm.turnOff();
      activatedByAuto = false;
    }
  }

  check();
  setInterval(check, 1000);
}

/* ---------- Now Playing: title-only by default + custom controls ---------- */

function initVexNowPlaying() {
  const box = document.getElementById('vex-nowplaying-box');
  const embedContainer = document.getElementById('vex-nowplaying-embed');
  const toggleBtn = document.getElementById('vex-visuals-toggle');
  const titleText = document.getElementById('vex-title-text');
  const playPauseBtn = document.getElementById('vex-playpause-btn');
  const prevBtn = document.getElementById('vex-prev-btn');
  const nextBtn = document.getElementById('vex-next-btn');
  if (!box || !embedContainer) return;

  const HIDDEN_KEY = 'agendaBoard.vexVisualsHidden';
  let player = null;
  let isPlaying = false;

  function setHidden(hidden) {
    box.classList.toggle('visuals-hidden', hidden);
    if (toggleBtn) toggleBtn.textContent = hidden ? 'Show Video' : 'Hide Video';
    try { localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0'); } catch (e) { /* storage disabled */ }
  }

  function updatePlayPauseIcon() {
    if (playPauseBtn) playPauseBtn.textContent = isPlaying ? '\u23F8' : '\u25B6';
  }

  async function init() {
    const { videoId, listId } = parseYouTubeUrl(VEX_NOWPLAYING_URL);

    embedContainer.innerHTML = '<div id="vex-nowplaying-player"></div>';
    box.classList.add('has-video');

    const YT = await loadYouTubeIframeApi();

    // Autoplay-with-sound is blocked by most browsers unless the video
    // starts muted; unmute and set the real (quiet) volume once it's ready.
    const playerVars = { autoplay: 1, rel: 0, mute: 1 };
    if (listId) {
      playerVars.listType = 'playlist';
      playerVars.list = listId;
    }

    player = new YT.Player('vex-nowplaying-player', {
      width: '100%',
      height: '100%',
      // omit videoId entirely for playlist-only links (e.g. our music
      // playlist default) — passing `videoId: undefined` explicitly makes
      // the IFrame API try to load a video literally called "undefined"
      // and throw "Invalid video id" instead of just starting the list
      ...(videoId ? { videoId } : {}),
      playerVars,
      events: {
        onReady: (e) => {
          e.target.setVolume(VEX_NOWPLAYING_VOLUME);
          e.target.unMute();
        },
        onStateChange: (e) => {
          isPlaying = e.data === YT.PlayerState.PLAYING;
          updatePlayPauseIcon();
          if (titleText && e.target.getVideoData) {
            const data = e.target.getVideoData();
            if (data && data.title) titleText.textContent = data.title;
          }
        }
      }
    });
  }

  init();

  // hidden (title-only) by default — only an explicit "0" turns it off
  let savedHidden = null;
  try { savedHidden = localStorage.getItem(HIDDEN_KEY); } catch (e) { /* storage disabled */ }
  setHidden(savedHidden === null ? true : savedHidden === '1');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setHidden(!box.classList.contains('visuals-hidden'));
    });
    toggleBtn.addEventListener('dblclick', (e) => e.stopPropagation());
  }
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!player) return;
      if (isPlaying) player.pauseVideo(); else player.playVideo();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (player && player.previousVideo) player.previousVideo();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (player && player.nextVideo) player.nextVideo();
    });
  }
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initVexCountdown();
  initVexTeams();
  initVexSaturdaySchedule();
  initVexNowPlaying();
  initVexBreakAutoGameMode();
});
