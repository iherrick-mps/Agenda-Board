/* ============================================================
   Tutoring page — Help Queue box.

   Plain iframe embed of the "queue" repo's own room page (a full
   app with its own join box and live ticket list) — no video-style
   URL parsing needed, just point an <iframe> at whatever link is
   pasted in. Behaves like the Now Playing box otherwise: the link
   persists on this device (localStorage) and the input tucks itself
   away once a link is loaded, reappearing on hover so it can be
   changed for a new day's room code.

   Uses its own element IDs (queue-input / queue-embed / has-queue)
   so it never collides with the generic initNowPlaying() in
   script.js, which also runs on this page for the Now Playing box.
   ============================================================ */

function initTutoringQueue() {
  const input = document.getElementById('queue-input');
  const embedContainer = document.getElementById('queue-embed');
  const box = document.getElementById('tutoring-queue-box');
  const joinCodeEl = document.getElementById('joinlink-code');
  if (!input || !embedContainer || !box) return;

  const STORAGE_KEY = 'agendaBoard.tutoringQueueUrl';

  function renderFromUrl(raw) {
    // parseQueueRoom() lives in script.js — takes either a pasted room
    // link or the bare code and gives back both. Students only ever see
    // the code; the link is posted on Google Classroom.
    const room = (typeof parseQueueRoom === 'function')
      ? parseQueueRoom(raw)
      : { code: '', url: String(raw || '').trim() };
    const url = room.url;

    if (joinCodeEl) {
      joinCodeEl.textContent = room.code;
      // shared auto-fit helper from script.js — same one every other
      // box-content uses — re-run so the code line re-fits the banner
      // now that its text has changed
      if (typeof fitBoxText === 'function') {
        fitBoxText(document.getElementById('content-joinlink'));
      }
    }

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

document.addEventListener('DOMContentLoaded', initTutoringQueue);
