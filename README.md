# Agenda Board

A daily agenda board for Robotics & Coding, deployable to GitHub Pages.

## What's here
- `index.html` — list of dates (pulled from `dates.txt`). **Today is always pinned to the top**; everything else is sorted furthest-future down to oldest below it.
- `agenda.html` — the board itself: a full-screen, no-scroll grid of boxes. Reads `?date=YYYY-MM-DD` from the URL and loads the matching file from `data/`.
- `styles.css` — all colors and sizing. The 7 box colors are CSS variables at the top (`--c-working`, `--c-deliverable`, `--c-goal`, `--c-standard`, `--c-eld`, `--c-agenda`, `--c-connect`) — change a hex value there to re-theme a box everywhere. The board layout itself (which box goes where, and how big) is the `grid-template-areas` block in the `.board-grid` rule.
- `script.js` — clock/countdown logic, date list rendering, box rendering, and the auto-fit-text routine.
- `bells.json` — the three bell schedules (Regular, Shortened/Wednesday, Minimum Day), built from the 2025-26 bell schedule PDF.
- `dates.txt` — plain list of dates, one `YYYY-MM-DD` per line. Add a line here every time you add a new day's JSON file.
- `data/YYYY-MM-DD.json` — one file per school day. Sample files for 2026-08-07, 08-10, 08-11, 08-12 are included as examples.

## The agenda board layout
Ten boxes tile the full screen with no scrolling, no matter what screen it's displayed on:
**Clock**, **Ms. Herrick** (name), **Now Playing**, **What should I be working on right now?**, **This week's deliverable**, **SMART Goal**, **Agenda/Steps**, **Connections**, **Content Standard**, **ELD Standard**. Agenda/Steps gets the most space since it usually has the most content; Content Standard and ELD Standard are intentionally small since students don't read those directly.

Each text box's font automatically grows or shrinks to fill exactly the space it has — no wasted space, and it never overflows or scrolls, regardless of how much or little text is in that box that day.

**Clock box:** shows today's real date (`YYYY/MM/DD · WEEKDAY`), the live Pacific time, and the countdown — always reflects the real day/time, not whatever date's board you're viewing. "Ms. Herrick" sits in its own small box directly underneath, sized so the two together match the height of the Working/Deliverable boxes beside them.

**Now Playing:** a black box with a text field — paste any YouTube video or playlist link and press Enter (or click away) and it embeds inline. YouTube Music playlist links generally work too as long as they carry a `list=` ID, though some auto-generated "mix" playlists may not embed. The link is saved in the browser's local storage on that device, so it survives a page refresh, but it isn't synced anywhere — pasting it again on a different computer/browser starts fresh.

**Period switcher:** the three period tabs (plus the date, schedule type, prev/next day buttons, and a link back to the date list) are tucked away at the very top edge of the screen — fully collapsed to zero height when idle. Hover your mouse near the top to reveal them; move away and they tuck back out of sight.

**Prev/Next day buttons:** step to the next-highest or next-lowest date *in `dates.txt`* — not the literal next calendar day. If there's a gap in your dates (e.g. a weekend, or a day you haven't built yet), it skips straight to whatever's actually listed.

**Click-to-focus:** click any box to fade everything else down to a faint wash and bring that box forward; click it again, click anywhere outside all boxes, or press Escape to return to normal.

**Double-click anywhere** to toggle fullscreen.

On small/narrow screens (phones, small tablets) the board automatically falls back to a normal scrolling single-column layout instead, since a bento grid that tight isn't legible at that size.

## Adding clickable links inside a box
Any string field (agenda steps, connections, etc.) can contain raw HTML, since it's inserted directly — so a clickable link like a Google Classroom join code can be added as an agenda step:
```json
"<a href=\"https://classroom.google.com/c/XXXX?cjc=YYYY\" target=\"_blank\" rel=\"noopener\">Join Google Classroom</a>"
```
This is already done for 2026-08-10 as an example, using each grade's actual join link.

## Adding a new day
1. Duplicate a file in `data/` and rename it to the new date, e.g. `data/2026-08-13.json`.
2. Set `"schedule"` to `"regular"`, `"shortened"`, or `"minimum"`.
3. Fill in `"4th Period"`, `"6th Period"`, `"7th Period"` (only include the ones that meet that day — Minimum Days, for example, only have 4th Period).
4. Add the date to `dates.txt`.

Each period needs:
- `grade` — display label next to the period tab
- `workingNow` — one line answering "what should I be working on right now?"
- `weeklyDeliverable` — this week's concrete deliverable (repeat the same value across each day in a week, since it doesn't change day to day)
- `smartGoal`, `contentStandard`, `eldStandard` — one line each
- `agenda` — array of step strings (shows as an arrow-bulleted list)
- `connections` — a sentence or two on prior/future learning

## The clock
- Always shows real Pacific Time, regardless of the device/browser's own timezone.
- The countdown is based on **today's real schedule** (not whatever date you're viewing) — it checks today's data file for the `schedule` field first, and falls back to Wednesday = Shortened / everything else = Regular if there's no file for today yet.
- When class is in session: counts down to the end of the current period.
- Between periods (passing period, lunch, before/after school): shows "Not in session" and counts down to the next period.
- If viewing *today's* board, the tab for whichever period is live right now is auto-selected and marked LIVE.
- The clock is one of the eight boxes in the grid (top-left), not a separate floating widget — it stays in place while the other seven boxes' content changes as you switch period tabs.

## Deploying to GitHub Pages
1. Push this folder to a GitHub repo (e.g. `iherrick-mps/agenda-board`).
2. In the repo: **Settings → Pages → Source → Deploy from branch**, pick `main` (or your default branch) and `/ (root)`.
3. Your board will be live at `https://iherrick-mps.github.io/agenda-board/`.

No build step, no dependencies — it's plain HTML/CSS/JS, so it works as-is on GitHub Pages.

## Testing locally
From this folder: `python3 -m http.server 8000`, then open `http://localhost:8000`. (Opening `index.html` directly by double-clicking won't work — the browser blocks the `fetch()` calls for local files without a server.)
