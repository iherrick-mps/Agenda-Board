/* ============================================================
   Study Hall page — Now Playing box.

   Behaves like the daily-page "Now Playing" box (editable, paste any
   YouTube link, persists on this device) EXCEPT:
     - it defaults to a fixed fallback video instead of starting empty
     - whenever the video actually loaded is that default video, it
       picks a random point between 0:00:00 and 6:00:00 on every page
       load/reload (so an 8-hour stream doesn't always open on the
       same few minutes) — the video starts playing from 0:00 first,
       then jumps to that point once playback has actually begun
       (rather than cueing straight to it before anything plays)
     - the input box is updated to show a normal YouTube-style
       timestamped link (?v=...&t=...s), the same way a link looks
       if you copy it while paused at that point in the video
     - it starts playing automatically at 10% volume rather than
       waiting for a click

   Uses its own localStorage key + element IDs (studyhall-nowplaying-*)
   so it never shares state with, or gets double-initialized by, the
   generic initNowPlaying() in script.js that runs on the daily pages.

   Depends on parseYouTubeUrl(), loadYouTubeIframeApi(), and
   NOWPLAYING_START_VOLUME, all defined in script.js — load this file
   after script.js.
   ============================================================ */

const STUDYHALL_DEFAULT_VIDEO_ID = 'v9EdW9ADEZQ';
const STUDYHALL_DEFAULT_URL = `https://www.youtube.com/watch?v=${STUDYHALL_DEFAULT_VIDEO_ID}`;
const STUDYHALL_RANDOM_WINDOW_SECONDS = 6 * 60 * 60; // 0:00:00–6:00:00

function studyHallRandomStartSeconds() {
  return Math.floor(Math.random() * STUDYHALL_RANDOM_WINDOW_SECONDS);
}

function initStudyHallNowPlaying() {
  const input = document.getElementById('studyhall-nowplaying-input');
  const embedContainer = document.getElementById('studyhall-nowplaying-embed');
  const box = document.getElementById('studyhall-nowplaying-box');
  if (!input || !embedContainer || !box) return;

  const STORAGE_KEY = 'agendaBoard.studyHallNowPlayingUrl';
  let player = null;

  async function renderFromUrl(url) {
    const { videoId, listId } = parseYouTubeUrl(url);
    if (!videoId && !listId) {
      input.value = url;
      embedContainer.innerHTML = '';
      box.classList.remove('has-video');
      return;
    }

    // Only the fixed default video gets a fresh random jump-point on
    // every load — a custom link a student pastes in plays normally.
    const isDefaultVideo = videoId === STUDYHALL_DEFAULT_VIDEO_ID;
    let randomStartSeconds = null;
    if (isDefaultVideo) {
      randomStartSeconds = studyHallRandomStartSeconds();
      input.value = `${STUDYHALL_DEFAULT_URL}&t=${randomStartSeconds}s`;
    } else {
      input.value = url;
    }

    embedContainer.innerHTML = '<div id="studyhall-nowplaying-player"></div>';
    box.classList.add('has-video');

    const YT = await loadYouTubeIframeApi();
    if (player && player.destroy) {
      try { player.destroy(); } catch (e) { /* ignore */ }
    }

    // Autoplay-with-sound is blocked by most browsers unless the video
    // starts muted; we unmute and set the real volume once it's ready.
    // No "start" cue point here on purpose — the default video begins
    // playing at 0:00 like normal, and we jump forward only once
    // playback has actually started (see onStateChange below).
    const playerVars = { autoplay: 1, rel: 0, mute: 1 };
    if (listId) {
      playerVars.listType = 'playlist';
      playerVars.list = listId;
    }

    let hasJumped = false;

    player = new YT.Player('studyhall-nowplaying-player', {
      width: '100%',
      height: '100%',
      videoId: videoId || undefined,
      playerVars,
      events: {
        onReady: (e) => {
          e.target.setVolume(NOWPLAYING_START_VOLUME);
          e.target.unMute();
        },
        onStateChange: (e) => {
          if (
            isDefaultVideo &&
            !hasJumped &&
            randomStartSeconds !== null &&
            e.data === YT.PlayerState.PLAYING
          ) {
            hasJumped = true;
            e.target.seekTo(randomStartSeconds, true);
          }
        }
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

  const saved = localStorage.getItem(STORAGE_KEY) || STUDYHALL_DEFAULT_URL;
  renderFromUrl(saved);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commit(); input.blur(); }
  });
  input.addEventListener('blur', commit);
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
}

document.addEventListener('DOMContentLoaded', initStudyHallNowPlaying);