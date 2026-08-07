# Agenda Board

A daily agenda board for Robotics & Coding, deployable to GitHub Pages.

## What's here
- `index.html` — list of dates (pulled from `dates.txt`, newest first). Click a date to open that day's board.
- `agenda.html` — the board itself. Reads `?date=YYYY-MM-DD` from the URL and loads the matching file from `data/`.
- `styles.css` — all colors and sizing. The 5 box colors are CSS variables at the top (`--c-goal`, `--c-standard`, `--c-eld`, `--c-agenda`, `--c-connect`) — change a hex value there to re-theme a box everywhere.
- `script.js` — clock/countdown logic, date list rendering, box rendering.
- `bells.json` — the three bell schedules (Regular, Shortened/Wednesday, Minimum Day), built from the 2025-26 bell schedule PDF.
- `dates.txt` — plain list of dates, one `YYYY-MM-DD` per line. Add a line here every time you add a new day's JSON file.
- `data/YYYY-MM-DD.json` — one file per school day. Sample files for 2026-08-10, 08-11, 08-12 are included as examples.

## Adding a new day
1. Duplicate a file in `data/` and rename it to the new date, e.g. `data/2026-08-13.json`.
2. Set `"schedule"` to `"regular"`, `"shortened"`, or `"minimum"`.
3. Fill in `"4th Period"`, `"6th Period"`, `"7th Period"` (only include the ones that meet that day — Minimum Days, for example, only have 4th Period).
4. Add the date to `dates.txt`.

Each period needs: `grade`, `smartGoal`, `contentStandard`, `eldStandard`, `agenda` (array of steps), `connections`.

## The clock
- Always shows real Pacific Time, regardless of the device/browser's own timezone.
- The countdown is based on **today's real schedule** (not whatever date you're viewing) — it checks today's data file for the `schedule` field first, and falls back to Wednesday = Shortened / everything else = Regular if there's no file for today yet.
- When class is in session: counts down to the end of the current period.
- Between periods (passing period, lunch, before/after school): shows "Not in session" and counts down to the next period.
- If viewing *today's* board, the tab for whichever period is live right now is auto-selected and marked LIVE.

## Deploying to GitHub Pages
1. Push this folder to a GitHub repo (e.g. `iherrick-mps/agenda-board`).
2. In the repo: **Settings → Pages → Source → Deploy from branch**, pick `main` (or your default branch) and `/ (root)`.
3. Your board will be live at `https://iherrick-mps.github.io/agenda-board/`.

No build step, no dependencies — it's plain HTML/CSS/JS, so it works as-is on GitHub Pages.

## Testing locally
From this folder: `python3 -m http.server 8000`, then open `http://localhost:8000`. (Opening `index.html` directly by double-clicking won't work — the browser blocks the `fetch()` calls for local files without a server.)
