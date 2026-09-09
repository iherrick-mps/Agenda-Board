/* ============================================================
   Indoor Lunch page.

   Two independent widgets, both auto-starting on load with no
   student interaction:

   1) Big video box — always plays a random pick from a fixed
      YouTube playlist (not editable by students, unlike the Now
      Playing boxes elsewhere in the app). Starts at max volume,
      pinned to the best resolution YouTube reports (same
      getAvailableQualityLevels()-based approach as Theater Mode
      in script.js), and with captions on by default.

   2) Scooby-Doo trivia bento — cycles a random question from
      scooby-trivia.json: 30s showing the question + 4 choices,
      then 10s highlighting the correct one, then on to a new
      question. Never repeats a question twice in a row; reshuffles
      once every question in the pool has been shown.

   Depends on loadYouTubeIframeApi(), makeBestQualityPinner(), and
   ROTATE_SWAP_MS, all defined in script.js — load this file after
   script.js.
   ============================================================ */

/* ---------- Big video box ---------- */

const LUNCHVIDEO_PLAYLIST_ID = 'PLTue1tY6L2toERPgcq30laM64vVd863F3';
const LUNCHVIDEO_PLAYLIST_LENGTH = 163; // used only to pick a random start index

async function initIndoorLunchVideo() {
  const embedContainer = document.getElementById('lunchvideo-embed');
  const messageEl = document.getElementById('lunchvideo-message');
  if (!embedContainer) return;

  embedContainer.innerHTML = '<div id="lunchvideo-player"></div>';

  const YT = await loadYouTubeIframeApi();
  const startIndex = Math.floor(Math.random() * LUNCHVIDEO_PLAYLIST_LENGTH);

  // vq is only a hint (YouTube may ignore it outright) — pinBestQuality
  // below does the real work, same as Theater Mode.
  const playerVars = {
    autoplay: 1,
    mute: 1,   // muted autoplay is allowed without a click; unmuted in onReady
    rel: 0,
    listType: 'playlist',
    list: LUNCHVIDEO_PLAYLIST_ID,
    index: startIndex,
    vq: 'hd1080',
    cc_load_policy: 1, // captions/subtitles on by default when available
    cc_lang_pref: 'en',
    hl: 'en'
  };

  const pinBestQuality = makeBestQualityPinner();

  new YT.Player('lunchvideo-player', {
    width: '100%',
    height: '100%',
    playerVars,
    events: {
      onReady: (e) => {
        e.target.setVolume(100);
        e.target.unMute();
        pinBestQuality(e.target);
      },
      onStateChange: (e) => {
        // quality levels aren't reported until playback is underway
        if (e.data === YT.PlayerState.PLAYING) pinBestQuality(e.target);
      },
      // fires when YouTube's adaptive streaming moves the video —
      // our cue to put it back up top
      onPlaybackQualityChange: (e) => pinBestQuality(e.target),
      onError: () => {
        if (messageEl) {
          messageEl.textContent = 'This video isn\u2019t available right now \u2014 reload the page for another pick.';
        }
      }
    }
  });
}

/* ---------- Scooby-Doo trivia bento ---------- */

const TRIVIA_URL = 'scooby-trivia.json';
const TRIVIA_QUESTION_SECONDS = 30;
const TRIVIA_ANSWER_SECONDS = 10;
const TRIVIA_LETTERS = ['A', 'B', 'C', 'D'];

let triviaListPromise = null;
function loadTriviaList() {
  if (!triviaListPromise) {
    triviaListPromise = fetch(TRIVIA_URL)
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);
  }
  return triviaListPromise;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Fisher-Yates shuffle of [0..n). If the freshly-shuffled order would
// open on the same question that just finished (avoidFirst), swap it
// out of the lead slot so a reshuffle never plays one question twice
// in a row.
function shuffledIndices(n, avoidFirst) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (avoidFirst !== null && arr.length > 1 && arr[0] === avoidFirst) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}

async function initIndoorLunchTrivia() {
  const box = document.getElementById('trivia-box');
  const questionEl = document.getElementById('trivia-question');
  const optionsEl = document.getElementById('trivia-options');
  const phaseLabelEl = document.getElementById('trivia-phase-label');
  const timerEl = document.getElementById('trivia-timer');
  if (!box || !questionEl || !optionsEl) return;

  const list = await loadTriviaList();
  if (!list.length) {
    questionEl.textContent = 'Add questions to scooby-trivia.json to use Trivia.';
    optionsEl.innerHTML = '';
    return;
  }

  let queue = shuffledIndices(list.length, null);
  let queuePos = 0;
  let lastIndex = null;
  let currentItem = null;
  let phase = 'question'; // 'question' | 'answer'
  let secondsLeft = TRIVIA_QUESTION_SECONDS;
  let swapHandle = null;

  function nextQuestionIndex() {
    if (queuePos >= queue.length) {
      queue = shuffledIndices(list.length, lastIndex);
      queuePos = 0;
    }
    const idx = queue[queuePos];
    queuePos += 1;
    lastIndex = idx;
    return idx;
  }

  function renderQuestionPhase() {
    currentItem = list[nextQuestionIndex()];
    questionEl.textContent = currentItem.q;
    optionsEl.innerHTML = currentItem.options.map((opt, i) => `
      <div class="trivia-option" data-idx="${i}">
        <span class="opt-letter">${TRIVIA_LETTERS[i]}</span>
        <span class="opt-text">${escapeHtml(opt)}</span>
      </div>
    `).join('');
    if (phaseLabelEl) phaseLabelEl.textContent = 'Question';
  }

  function renderAnswerPhase() {
    optionsEl.querySelectorAll('.trivia-option').forEach((el) => {
      const idx = Number(el.dataset.idx);
      const isCorrect = idx === currentItem.correctIndex;
      el.classList.toggle('is-correct', isCorrect);
      el.classList.toggle('is-dimmed', !isCorrect);
    });
    if (phaseLabelEl) phaseLabelEl.textContent = 'Answer';
  }

  // same fade-out-swap-fade-in shape as the main board's rotating
  // bentos (see createRotator() in script.js) — ROTATE_SWAP_MS must
  // match the .box-rot transition duration in styles.css
  function swapTo(renderFn) {
    clearTimeout(swapHandle);
    box.classList.add('is-swapping');
    swapHandle = setTimeout(() => {
      renderFn();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        box.classList.remove('is-swapping');
      }));
    }, ROTATE_SWAP_MS);
  }

  function paintTimer() {
    if (timerEl) timerEl.textContent = secondsLeft;
  }

  function tick() {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      if (phase === 'question') {
        phase = 'answer';
        secondsLeft = TRIVIA_ANSWER_SECONDS;
        swapTo(renderAnswerPhase);
      } else {
        phase = 'question';
        secondsLeft = TRIVIA_QUESTION_SECONDS;
        swapTo(renderQuestionPhase);
      }
    }
    paintTimer();
  }

  // first render — nothing to fade from yet
  renderQuestionPhase();
  if (timerEl) timerEl.hidden = false;
  paintTimer();
  setInterval(tick, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  initIndoorLunchVideo();
  initIndoorLunchTrivia();
});
