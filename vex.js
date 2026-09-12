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
  { name: '92120A', note: 'Kyle, Ruslan, Leo' },
  { name: '92120B', note: 'Holden, Sughas, Nathaniel' },
  { name: '92120C', note: 'Cole, Timo, Timothy' },
  { name: '92120D', note: 'Rhys, Ryland, Samuel' },
  { name: '92120E', note: 'Lily, Noelle, Mia' },
  { name: '92120F', note: 'Antonio, Elijah, Roman' },
];

/* ---- Next competition — edit these two lines as new dates are set ---- */
const VEX_NEXT_COMPETITION = '2027-01-15'; // YYYY-MM-DD
const VEX_NEXT_COMPETITION_LABEL = 'January 15';

/* ---- SCRUM board stages (columns) — rows are VEX_TEAMS above ---- */
const VEX_SCRUM_STAGES = [
  'Build Drivetrain',
  'Build Scoring Mechanism',
  'Iterating on Scoring Mechanism',
  'Full Team Practicing',
  'Developing Autonomous',
];
const VEX_SCRUM_KEY = 'agendaBoard.vexScrum';
const VEX_SCRUM_MAX_SPARKLES = 14; // sparkle count at 100% complete
// each team gets its own progress-bar/checkbox color, cycling through
// this palette in roster order (reuses the site's existing accent colors)
const VEX_SCRUM_TEAM_COLORS = [
  'var(--c-goal)',   // 92120A
  '#5AE8E8',         // 92120B
  '#92120C',         // 92120C
  '#9912BA',         // 92120D
  'var(--c-agenda)', // 92120E
  'var(--c-working)',// 92120F
];

/* ---- FAQ bento — rotates one question at a time.
   Answers below are from the VIQRC Level Up Game Manual (2026-27),
   version 2.0. Re-check them after each manual update; VEX ships
   scheduled revisions through the season. ---- */
const VEX_FAQ_ROTATE_MS = 15000; // 15 seconds per question
// Keep answers short — the text scales to fill the bento, so every extra
// clause shrinks the font for the whole rotation.
const VEX_FAQS = [
  {
    q: 'How big can our robot be?',
    a: '11" x 20" x 15" at the start of a match. After that you can expand to 11" x 24" wide, and as tall as you like.'
  },
  {
    q: 'How many people are on a team?',
    a: 'Three at the field: two drivers and one loader. Drivers swap the controller between 0:35 and 0:25.'
  },
  {
    q: "What is this year's game called?",
    a: 'Level Up. Score bean bags into goals for 1, 3, 6, 12, or 16 points. Carry one bag at a time.'
  },
  {
    q: 'How many motors can we have?',
    a: 'Six VEX IQ Smart Motors. Spares count against the limit even when they are unplugged.'
  },
];
const VEX_FAQ_COLORS = [
  'var(--c-connect)',
  'var(--c-goal)',
  'var(--c-eld)',
  'var(--c-standard)',
];

/* ---- Now Playing defaults ---- */
const VEX_NOWPLAYING_URL = 'https://music.youtube.com/playlist?list=PLKwpsUctVAO8&si=Aio1rMg-SqWJhbM6';
const VEX_NOWPLAYING_VOLUME = 10; // 0-100

/* ---- Clean-Up overlay ---- */
const VEX_PACKUP_SONG_URL = 'https://www.youtube.com/watch?v=Ds6IwEKRLUU';
const VEX_PACKUP_VOLUME = 30; // louder than the work playlist — it's a cue

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

// Each stage now holds one of three values rather than a boolean:
//   0 = not started, 1 = in progress, 2 = finished
// reads saved state and reshapes it to exactly match the current
// VEX_TEAMS/VEX_SCRUM_STAGES lists (new teams start empty; removed
// teams' old data is just ignored, not deleted from storage)
function vexLoadScrumState() {
  let saved = {};
  try {
    const raw = localStorage.getItem(VEX_SCRUM_KEY);
    if (raw) saved = JSON.parse(raw) || {};
  } catch (e) { /* storage disabled or corrupt JSON — start fresh */ }

  const state = {};
  VEX_TEAMS.forEach(t => {
    const existing = Array.isArray(saved[t.name]) ? saved[t.name] : [];
    state[t.name] = VEX_SCRUM_STAGES.map((_, i) => {
      const v = existing[i];
      if (v === true) return 2;          // migrate old boolean "checked" to finished
      if (v === 1 || v === 2) return v;
      return 0;
    });
  });
  return state;
}

function vexSaveScrumState(state) {
  try { localStorage.setItem(VEX_SCRUM_KEY, JSON.stringify(state)); } catch (e) { /* storage disabled */ }
}

// in-progress stages earn half credit, so a row's fill creeps forward
// as work starts rather than only jumping when a stage is finished
function vexScrumPercent(rowState) {
  if (!rowState || !rowState.length) return 0;
  const earned = rowState.reduce((sum, v) => sum + (v === 2 ? 1 : v === 1 ? 0.5 : 0), 0);
  return Math.round((earned / rowState.length) * 100);
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
    head.style.gridRow = '1';
    head.style.gridColumn = String(colIdx + 2);

    const headName = document.createElement('span');
    headName.className = 'vex-scrum-head-name';
    headName.textContent = stage;
    head.appendChild(headName);

    // tells the room which of the two boxes below is which
    const headSub = document.createElement('span');
    headSub.className = 'vex-scrum-head-sub';
    headSub.textContent = 'started \u00B7 done';
    head.appendChild(headSub);

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
      const value = state[team.name][colIdx];

      const cell = document.createElement('div');
      cell.className = 'vex-scrum-cell vex-scrum-check';
      cell.style.gridRow = String(gridRow);
      cell.style.gridColumn = String(colIdx + 2);
      cell.classList.toggle('is-wip', value === 1);
      cell.classList.toggle('is-done', value === 2);

      // two boxes per stage: "started" (in progress) and "done".
      // They're kept coherent by the change handler below — you can
      // never end up with done ticked and started empty.
      [['wip', 'in progress'], ['done', 'finished']].forEach(([kind, what]) => {
        const mark = document.createElement('label');
        mark.className = `vex-scrum-mark vex-scrum-mark--${kind}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = kind === 'wip' ? value >= 1 : value === 2;
        checkbox.setAttribute('aria-label', `${team.name} \u2014 ${stage} \u2014 ${what}`);
        checkbox.dataset.team = team.name;
        checkbox.dataset.stage = String(colIdx);
        checkbox.dataset.kind = kind;
        checkbox.style.accentColor = color;

        mark.appendChild(checkbox);
        cell.appendChild(mark);
      });

      tableEl.appendChild(cell);
    });

    paintRow(team.name);
  });

  tableEl.addEventListener('change', (e) => {
    const cb = e.target;
    if (!(cb instanceof HTMLInputElement) || cb.type !== 'checkbox') return;
    const team = cb.dataset.team;
    const stageIdx = Number(cb.dataset.stage);
    const kind = cb.dataset.kind;
    if (!team || Number.isNaN(stageIdx) || !state[team]) return;

    let value = state[team][stageIdx];
    if (kind === 'wip') {
      // unticking "started" abandons the stage entirely, done included
      value = cb.checked ? Math.max(value, 1) : 0;
    } else {
      // unticking "done" drops back to in progress, not to nothing
      value = cb.checked ? 2 : 1;
    }
    state[team][stageIdx] = value;
    vexSaveScrumState(state);

    // re-sync both boxes in this cell from the single source of truth,
    // so the pair can never display a contradictory combination
    const cell = cb.closest('.vex-scrum-check');
    if (cell) {
      cell.querySelectorAll('input[type="checkbox"]').forEach(box => {
        box.checked = box.dataset.kind === 'wip' ? value >= 1 : value === 2;
      });
      cell.classList.toggle('is-wip', value === 1);
      cell.classList.toggle('is-done', value === 2);
    }
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
  let shuffleBag = [];      // indices left to play in this shuffle cycle
  let bagSize = 0;          // playlist length the current bag was built for
  let advancing = false;    // guards against double-advancing on ENDED

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

  // NOTE: YouTube's own player.setShuffle() is unreliable here — it only
  // reorders the *upcoming* queue, silently no-ops if the playlist hasn't
  // finished loading, and has no working "un-shuffle". So shuffle is done
  // by hand: we read the playlist once and pick our own next index.
  function setShuffle(on) {
    shuffleOn = on;
    if (shuffleBtn) shuffleBtn.classList.toggle('is-active', on);
    try { localStorage.setItem(SHUFFLE_KEY, on ? '1' : '0'); } catch (e) { /* storage disabled */ }
  }

  // Read the length fresh every single time. YouTube fills getPlaylist()
  // in incrementally — it reports only the first chunk of a long list at
  // first and grows over the next several seconds — so caching whatever
  // number it happened to report first permanently strands us inside
  // that opening chunk.
  function playlistLength() {
    if (!player || !player.getPlaylist) return 0;
    const list = player.getPlaylist();
    return Array.isArray(list) ? list.length : 0;
  }

  // Shuffle bag: hold every index, hand them out in random order, and only
  // reshuffle once the bag is empty. That guarantees the whole playlist
  // plays through before any track comes round again — picking a fresh
  // random number each time is what lets one song repeat four times.
  function refillBag(length, exclude) {
    const bag = [];
    for (let i = 0; i < length; i++) if (i !== exclude) bag.push(i);
    for (let i = bag.length - 1; i > 0; i--) {   // Fisher-Yates
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    shuffleBag = bag;
    bagSize = length;
  }

  function nextShuffledIndex() {
    const length = playlistLength();
    if (length <= 1) return 0;
    const current = player.getPlaylistIndex ? player.getPlaylistIndex() : -1;
    // rebuild when YouTube finishes loading more of the list, or when the
    // bag runs dry and a new cycle starts
    if (length !== bagSize || !shuffleBag.length) refillBag(length, current);
    const next = shuffleBag.pop();
    return typeof next === 'number' ? next : 0;
  }

  function advanceTrack() {
    if (!player) return;
    if (shuffleOn && playlistLength() > 1 && player.playVideoAt) {
      player.playVideoAt(nextShuffledIndex());
    } else if (player.nextVideo) {
      player.nextVideo();
    }
  }

  // playerVars/list are applied asynchronously, so the playlist is usually
  // empty at onReady and then arrives in pieces over the next few seconds.
  // Keep looking for a full 20s rather than stopping at the first non-empty
  // answer. The bag itself is built lazily on the first track change and
  // rebuilt whenever the reported length grows, so a late-arriving tail of
  // the playlist gets picked up either way.
  let loopSet = false;
  let jumpedToRandomStart = false;
  let lastSeenLength = 0;
  function waitForPlaylist(tries = 0) {
    if (!player || !player.getPlaylist) return;
    const length = playlistLength();

    if (!loopSet && length && player.setLoop) {
      player.setLoop(true);
      loopSet = true;
    }

    // Jump to a random track on page load, so the board doesn't open on
    // the same song every afternoon. Wait for two consecutive polls that
    // report the same length — YouTube delivers a long playlist in
    // chunks, and jumping on the first chunk would only ever land in the
    // opening handful of tracks.
    if (!jumpedToRandomStart && shuffleOn && length > 1 && length === lastSeenLength) {
      jumpedToRandomStart = true;
      if (player.playVideoAt) player.playVideoAt(nextShuffledIndex());
    }
    lastSeenLength = length;

    if (tries < 80) setTimeout(() => waitForPlaylist(tries + 1), 250);
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
          waitForPlaylist();
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
          if (e.data === YT.PlayerState.ENDED) {
            if (repeatOneOn) {
              e.target.seekTo(0);
              e.target.playVideo();
            } else if (shuffleOn && playlistLength() > 1 && !advancing) {
              // beat the player's own sequential auto-advance to the punch
              advancing = true;
              advanceTrack();
              setTimeout(() => { advancing = false; }, 1000);
            }
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
      advanceTrack();
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

  // lets the Clean-Up overlay silence the work playlist without
  // reaching into this function's private player handle
  window.__vexNowPlaying = {
    pause: () => { if (player && player.pauseVideo) player.pauseVideo(); },
    resume: () => { if (player && player.playVideo) player.playVideo(); },
  };
}

/* ---------- FAQ rotator ---------- */

function initVexFaq() {
  const box = document.getElementById('box-faq');
  const wrapEl = document.getElementById('vex-faq');
  const qEl = document.getElementById('vex-faq-q');
  const aEl = document.getElementById('vex-faq-a');
  const dotsEl = document.getElementById('vex-faq-dots');
  if (!box || !wrapEl || !qEl || !aEl || VEX_FAQS.length === 0) return;

  if (dotsEl) {
    dotsEl.innerHTML = VEX_FAQS
      .map(() => '<span class="vex-faq-dot"></span>')
      .join('');
  }

  let idx = 0;

  function paint(i) {
    const faq = VEX_FAQS[i];
    qEl.textContent = faq.q;
    aEl.textContent = faq.a;
    box.style.setProperty('--box-color', VEX_FAQ_COLORS[i % VEX_FAQ_COLORS.length]);
    if (dotsEl) {
      Array.from(dotsEl.children).forEach((dot, n) => {
        dot.classList.toggle('is-active', n === i);
      });
    }
    // answers vary a lot in length, so re-fit the text after each swap
    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  paint(0);
  if (VEX_FAQS.length === 1) return;

  setInterval(() => {
    wrapEl.classList.add('is-fading');
    // wait out the CSS fade (0.3s) before swapping the text, so the
    // question never visibly changes mid-transition
    setTimeout(() => {
      idx = (idx + 1) % VEX_FAQS.length;
      paint(idx);
      wrapEl.classList.remove('is-fading');
    }, 300);
  }, VEX_FAQ_ROTATE_MS);
}

/* ---------- Clean-Up overlay ----------
   Full-board takeover in the same shape as Game Mode: hide every VEX
   bento, put the checklist on the right and a plain single-video Now
   Playing bento on the left. The work playlist pauses while it's up
   and resumes when it's dismissed.

   Called "packup" in the code because script.js already uses
   `cleanup-mode-active` for the 7th Period Chromebook claw machine.
   ------------------------------------------------------------------ */

function initVexPackUp() {
  const boardGrid = document.getElementById('board-grid');
  const toggleBtn = document.getElementById('packup-toggle-btn');
  const embedEl = document.getElementById('vex-packup-embed');
  if (!boardGrid || !toggleBtn || !embedEl) return;

  let active = false;
  let packupPlayer = null;
  let building = false;

  async function ensurePlayer() {
    if (packupPlayer || building) return;
    building = true;

    const { videoId } = parseYouTubeUrl(VEX_PACKUP_SONG_URL);
    if (!videoId) { building = false; return; }

    embedEl.innerHTML = '<div id="vex-packup-player"></div>';
    const YT = await loadYouTubeIframeApi();

    packupPlayer = new YT.Player('vex-packup-player', {
      width: '100%',
      height: '100%',
      videoId,
      // loop on a single video only works if that video is also named as
      // a one-item playlist — otherwise YouTube ignores loop entirely
      playerVars: { autoplay: 1, rel: 0, mute: 1, loop: 1, playlist: videoId },
      events: {
        onReady: (e) => {
          e.target.setVolume(VEX_PACKUP_VOLUME);
          e.target.unMute();
          if (active) e.target.playVideo();
        }
      }
    });
    building = false;
  }

  function turnOn() {
    if (active) return;
    // never stack two full-board takeovers
    if (window.__gameMode && window.__gameMode.isActive()) window.__gameMode.turnOff();

    active = true;
    boardGrid.classList.add('packup-mode-active');
    toggleBtn.classList.add('is-active');

    if (window.__vexNowPlaying) window.__vexNowPlaying.pause();

    if (!packupPlayer) {
      ensurePlayer();
    } else {
      packupPlayer.seekTo(0);
      packupPlayer.playVideo();
    }

    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  function turnOff() {
    if (!active) return;
    active = false;
    boardGrid.classList.remove('packup-mode-active');
    toggleBtn.classList.remove('is-active');

    if (packupPlayer && packupPlayer.pauseVideo) packupPlayer.pauseVideo();
    if (window.__vexNowPlaying) window.__vexNowPlaying.resume();

    requestAnimationFrame(() => requestAnimationFrame(fitAllBoxes));
  }

  toggleBtn.addEventListener('click', () => (active ? turnOff() : turnOn()));

  // Game Mode has no hook for "something else is taking over", so wrap its
  // turnOn once. This covers both the toolbar button and vex.js's automatic
  // Game Mode during the Saturday Break.
  if (window.__gameMode && !window.__gameMode.__packupWrapped) {
    const originalTurnOn = window.__gameMode.turnOn;
    window.__gameMode.turnOn = function (...args) {
      turnOff();
      return originalTurnOn.apply(this, args);
    };
    window.__gameMode.__packupWrapped = true;
  }

  window.__vexPackUp = { turnOn, turnOff, isActive: () => active };
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initVexCountdown();
  initVexTeams();
  initVexScrumBoard();
  initVexSaturdaySchedule();
  initVexFaq();
  initVexNowPlaying();
  initVexPackUp();
  initVexBreakAutoGameMode();
});