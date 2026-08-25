/* ============================================================
   VEX Robotics Club page — after-school (3:00–4:00 PM) board.
   Own bento layout, reusing the shared clock / Game Mode / confetti /
   click-to-focus plumbing from script.js (same id="board-grid").
   Depends on getPacificNow(), minutesSinceMidnight(), hhmmToMinutes(),
   loadBells(), resolveTodaysSchedule(), findCurrentAndNext(),
   parseYouTubeUrl(), loadYouTubeIframeApi(), and fitAllBoxes(), all
   defined in script.js — load this file after script.js.
   ============================================================ */

/* ---- Team roster — preliminary teams, grouped in roster order.
   Add/edit teams here as rosters change: { name: '92120A', note: 'First Last, First Last, First Last' } ---- */
const VEX_TEAMS = [
  { name: '92120A', note: 'Leo, Holden, Timo' },
  { name: '92120B', note: 'Kyle, Ruslan, Cole' },
  { name: '92120C', note: 'Rhys, Rylan, Samuel' },
  { name: '92120D', note: 'Timothy, Noell, Lillian' },
  { name: '92120E', note: 'Antonio, Sughas, Nathaniel' },
  { name: '92120F', note: 'Mia, Elijah, Roman' },
];

/* ---- Next competition — edit these two lines as new dates are set ---- */
const VEX_NEXT_COMPETITION = '2027-01-15'; // YYYY-MM-DD
const VEX_NEXT_COMPETITION_LABEL = 'January 15';

/* ---- SCRUM board stages (columns) — rows are VEX_TEAMS above ---- */
const VEX_SCRUM_STAGES = [
  'Build Chassis',
  'Build Arm',
  'Iterating on Arm',
  'Full Team Practicing',
  'Developing Autonomous',
];
const VEX_SCRUM_KEY = 'agendaBoard.vexScrum';
const VEX_SCRUM_MAX_SPARKLES = 14; // sparkle count at 100% complete
// each team gets its own progress-bar/checkbox color, cycling through
// this palette in roster order (reuses the site's existing accent colors)
const VEX_SCRUM_TEAM_COLORS = [
  'var(--c-goal)',
  'var(--c-connect)',
  'var(--c-eld)',
  'var(--c-standard)',
  'var(--c-agenda)',
  'var(--c-working)',
];

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

/* ---------- SCRUM board — teams x build stages, checkboxes, saved to
   localStorage, with a per-row progress-bar fill + intensity-scaled
   sparkles as more of that team's stages get checked off ---------- */

// reads saved checkbox state and reshapes it to exactly match the
// current VEX_TEAMS/VEX_SCRUM_STAGES lists (new teams start unchecked;
// removed teams' old data is just ignored, not deleted from storage)
function vexLoadScrumState() {
  let saved = {};
  try {
    const raw = localStorage.getItem(VEX_SCRUM_KEY);
    if (raw) saved = JSON.parse(raw) || {};
  } catch (e) { /* storage disabled or corrupt JSON — start fresh */ }

  const state = {};
  VEX_TEAMS.forEach(t => {
    const existing = Array.isArray(saved[t.name]) ? saved[t.name] : [];
    state[t.name] = VEX_SCRUM_STAGES.map((_, i) => !!existing[i]);
  });
  return state;
}

function vexSaveScrumState(state) {
  try { localStorage.setItem(VEX_SCRUM_KEY, JSON.stringify(state)); } catch (e) { /* storage disabled */ }
}

function vexScrumPercent(rowState) {
  if (!rowState || !rowState.length) return 0;
  const done = rowState.filter(Boolean).length;
  return Math.round((done / rowState.length) * 100);
}

// (re)fills a row's sparkle layer — more sparkles, bigger and brighter,
// the closer that row is to 100%; empty at 0%. Sparkles glow white at
// low completion and pick up more of the team's own color as it climbs.
function vexRenderSparkles(layerEl, percent, color) {
  layerEl.innerHTML = '';
  if (percent <= 0) return;

  const intensity = percent / 100; // 0..1
  const count = Math.max(1, Math.round(intensity * VEX_SCRUM_MAX_SPARKLES));

  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'vex-sparkle';
    s.textContent = '\u2726'; // ✦
    s.style.left = `${Math.random() * Math.max(4, percent - 4)}%`;
    s.style.top = `${8 + Math.random() * 82}%`;
    s.style.setProperty('--sparkle-size', `${7 + intensity * 9}px`);
    s.style.setProperty('--sparkle-opacity', String(0.5 + intensity * 0.5));
    s.style.setProperty('--sparkle-dur', `${1.1 + Math.random() * 1.3}s`);
    s.style.setProperty('--sparkle-delay', `${Math.random() * 1.6}s`);
    if (color) s.style.setProperty('--sparkle-color', color);
    layerEl.appendChild(s);
  }
}

function initVexScrumBoard() {
  const tableEl = document.getElementById('vex-scrum-table');
  if (!tableEl || VEX_TEAMS.length === 0) return;

  const state = vexLoadScrumState();
  const rowRefs = {}; // team name -> { fillEl, sparkleEl }
  tableEl.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'vex-scrum-cell vex-scrum-corner';
  corner.style.gridRow = '1';
  corner.style.gridColumn = '1';
  tableEl.appendChild(corner);

  VEX_SCRUM_STAGES.forEach((stage, colIdx) => {
    const head = document.createElement('div');
    head.className = 'vex-scrum-cell vex-scrum-head';
    head.textContent = stage;
    head.style.gridRow = '1';
    head.style.gridColumn = String(colIdx + 2);
    tableEl.appendChild(head);
  });

  function paintRow(teamName) {
    const refs = rowRefs[teamName];
    if (!refs) return;
    const percent = vexScrumPercent(state[teamName]);
    refs.fillEl.style.setProperty('--fill-percent', `${percent}%`);
    vexRenderSparkles(refs.sparkleEl, percent, refs.color);
  }

  VEX_TEAMS.forEach((team, rowIdx) => {
    const gridRow = rowIdx + 2;
    const color = VEX_SCRUM_TEAM_COLORS[rowIdx % VEX_SCRUM_TEAM_COLORS.length];

    // fill + sparkle layers first (DOM order = paint order, so they
    // stay behind the team label and checkboxes appended after them)
    const fill = document.createElement('div');
    fill.className = 'vex-scrum-fill';
    fill.classList.add(rowIdx % 2 === 0 ? 'vex-scrum-row-even' : 'vex-scrum-row-odd');
    fill.style.gridRow = String(gridRow);
    fill.style.gridColumn = '1 / -1';
    fill.style.setProperty('--team-color', color);
    tableEl.appendChild(fill);

    const sparkleLayer = document.createElement('div');
    sparkleLayer.className = 'vex-scrum-sparkles';
    sparkleLayer.style.gridRow = String(gridRow);
    sparkleLayer.style.gridColumn = '1 / -1';
    tableEl.appendChild(sparkleLayer);

    rowRefs[team.name] = { fillEl: fill, sparkleEl: sparkleLayer, color };

    const label = document.createElement('div');
    label.className = 'vex-scrum-cell vex-scrum-team';
    label.textContent = team.name;
    label.style.gridRow = String(gridRow);
    label.style.gridColumn = '1';
    label.style.setProperty('--team-color', color);
    tableEl.appendChild(label);

    VEX_SCRUM_STAGES.forEach((stage, colIdx) => {
      const cell = document.createElement('div');
      cell.className = 'vex-scrum-cell vex-scrum-check';
      cell.style.gridRow = String(gridRow);
      cell.style.gridColumn = String(colIdx + 2);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state[team.name][colIdx];
      checkbox.setAttribute('aria-label', `${team.name} \u2014 ${stage}`);
      checkbox.dataset.team = team.name;
      checkbox.dataset.stage = String(colIdx);
      checkbox.style.accentColor = color;

      cell.appendChild(checkbox);
      tableEl.appendChild(cell);
    });

    paintRow(team.name);
  });

  tableEl.addEventListener('change', (e) => {
    const cb = e.target;
    if (!(cb instanceof HTMLInputElement) || cb.type !== 'checkbox') return;
    const team = cb.dataset.team;
    const stageIdx = Number(cb.dataset.stage);
    if (!team || Number.isNaN(stageIdx) || !state[team]) return;

    state[team][stageIdx] = cb.checked;
    vexSaveScrumState(state);
    paintRow(team);
  });
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

function vexFormatNowPlayingTitle(data) {
  if (!data || !data.title) return null;
  const author = (data.author || '').replace(/\s*-\s*Topic$/i, '').trim();
  return author ? `${data.title} by ${author}` : data.title;
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
  const shuffleBtn = document.getElementById('vex-shuffle-btn');
  const repeatBtn = document.getElementById('vex-repeat-btn');
  if (!box || !embedContainer) return;

  const HIDDEN_KEY = 'agendaBoard.vexVisualsHidden';
  const SHUFFLE_KEY = 'agendaBoard.vexShuffle';
  const REPEAT_ONE_KEY = 'agendaBoard.vexRepeatOne';
  let player = null;
  let isPlaying = false;

  // shuffle defaults ON; repeat-one defaults OFF; the whole playlist
  // always loops (see setLoop(true) in onReady) regardless of either
  let shuffleOn = true;
  let repeatOneOn = false;
  try {
    const s = localStorage.getItem(SHUFFLE_KEY);
    if (s !== null) shuffleOn = s === '1';
  } catch (e) { /* storage disabled */ }
  try {
    const r = localStorage.getItem(REPEAT_ONE_KEY);
    if (r !== null) repeatOneOn = r === '1';
  } catch (e) { /* storage disabled */ }

  function setHidden(hidden) {
    box.classList.toggle('visuals-hidden', hidden);
    if (toggleBtn) toggleBtn.textContent = hidden ? 'Show Video' : 'Hide Video';
    try { localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0'); } catch (e) { /* storage disabled */ }
  }

  function updatePlayPauseIcon() {
    if (playPauseBtn) playPauseBtn.textContent = isPlaying ? '\u23F8' : '\u25B6';
  }

  function setShuffle(on) {
    shuffleOn = on;
    if (shuffleBtn) shuffleBtn.classList.toggle('is-active', on);
    if (player && player.setShuffle) player.setShuffle(on);
    try { localStorage.setItem(SHUFFLE_KEY, on ? '1' : '0'); } catch (e) { /* storage disabled */ }
  }

  function setRepeatOne(on) {
    repeatOneOn = on;
    if (repeatBtn) repeatBtn.classList.toggle('is-active', on);
    try { localStorage.setItem(REPEAT_ONE_KEY, on ? '1' : '0'); } catch (e) { /* storage disabled */ }
  }

  // reflect saved/default state on the buttons right away, even before
  // the player exists — setShuffle()/setRepeatOne() below re-apply once ready
  if (shuffleBtn) shuffleBtn.classList.toggle('is-active', shuffleOn);
  if (repeatBtn) repeatBtn.classList.toggle('is-active', repeatOneOn);

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
      playerVars.loop = 1; // whole playlist loops back to the start by default
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
          // setLoop/setShuffle are the reliable way to control a playlist
          // that's already loaded — playerVars.loop above is a backup
          if (e.target.setLoop) e.target.setLoop(true);
          if (e.target.setShuffle) e.target.setShuffle(shuffleOn);
        },
        onStateChange: (e) => {
          isPlaying = e.data === YT.PlayerState.PLAYING;
          updatePlayPauseIcon();
          if (titleText && e.target.getVideoData) {
            const formatted = vexFormatNowPlayingTitle(e.target.getVideoData());
            if (formatted) titleText.textContent = formatted;
          }
          // "repeat current song": replay it instead of letting the
          // playlist advance to the next track
          if (e.data === YT.PlayerState.ENDED && repeatOneOn) {
            e.target.seekTo(0);
            e.target.playVideo();
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
  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setShuffle(!shuffleOn);
    });
  }
  if (repeatBtn) {
    repeatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setRepeatOne(!repeatOneOn);
    });
  }
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initVexCountdown();
  initVexTeams();
  initVexScrumBoard();
  initVexSaturdaySchedule();
  initVexNowPlaying();
  initVexBreakAutoGameMode();
});