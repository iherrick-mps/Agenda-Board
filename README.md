# Agenda Board

A daily agenda board for Robotics & Coding, deployable to GitHub Pages.

## What's here
- `index.html` — **pick a period, then pick a day.** A month calendar (starting August 2026, running through the last month present in `dates.txt`) with today outlined; days that have an agenda file are clickable, the rest are greyed out. The old full date list is still there, collapsed under "Or see every date as a list."
- `agenda.html` — the board itself: a full-screen, no-scroll grid of boxes. Reads `?date=YYYY-MM-DD&period=4` from the URL and loads the matching file from `data/`.
- `styles.css` — all colors and sizing. The 7 box colors are CSS variables at the top (`--c-working`, `--c-deliverable`, `--c-goal`, `--c-standard`, `--c-eld`, `--c-agenda`, `--c-connect`) — change a hex value there to re-theme a box everywhere. The board layout itself (which box goes where, and how big) is the `grid-template-areas` block in the `.board-grid` rule.
- `script.js` — clock/countdown logic, date list rendering, box rendering, and the auto-fit-text routine.
- `bells.json` — the three bell schedules (Regular, Shortened/Wednesday, Minimum Day), built from the 2025-26 bell schedule PDF.
- `dates.txt` — plain list of dates, one `YYYY-MM-DD` per line. Add a line here every time you add a new day's JSON file.
- `data/YYYY-MM-DD.json` — one file per school day. Sample files for 2026-08-07, 08-10, 08-11, 08-12 are included as examples.

## The agenda board layout
Ten boxes tile the full screen with no scrolling, no matter what screen it's displayed on:
**Clock**, **Ms. Herrick** (name), **Now Playing**, **What should I be working on right now?**, **Due on Sunday** (this week's deliverable), **ELD Standard**, **Content Standard**, **Agenda/Steps**, **Connections**, **SMART Goal**. Agenda/Steps gets the most space since it usually has the most content; ELD Standard and Content Standard sit stacked together on the left and are intentionally small since students don't read those directly. Time durations in agenda steps (e.g. "(5 min)") are automatically styled in a muted monospace so they're easy to skim without competing with the step text.

Each text box's font automatically grows or shrinks to fill exactly the space it has — no wasted space, and it never overflows or scrolls, regardless of how much or little text is in that box that day.

**Count-up timer:** a stopwatch strip sitting between the clock and the name card — Start, Stop, Clear, counting `MM:SS` (it rolls over to `H:MM:SS` past an hour). The digits turn green while it's running. It measures against the real wall clock rather than counting ticks, so it stays accurate even if the browser throttles the tab. It resets on page reload; it's meant for timing a work block, a login, or a transition, not for carrying time across days.

**Clock box:** shows today's real date (`YYYY/MM/DD · WEEKDAY`), the live Pacific time, and the countdown — always reflects the real day/time, not whatever date's board you're viewing. "Ms. Herrick" sits in its own small box directly underneath, sized so the two together match the height of the Working/Deliverable boxes beside them.

**Now Playing:** a black box with a text field — paste any YouTube video or playlist link and press Enter (or click away) and it embeds inline, starting at a low volume (just above mute) rather than whatever volume YouTube defaults to. YouTube Music playlist links generally work too as long as they carry a `list=` ID, though some auto-generated "mix" playlists may not embed. The link is saved in the browser's local storage on that device, so it survives a page refresh, but it isn't synced anywhere — pasting it again on a different computer/browser starts fresh. Once something is playing, the paste-in field tucks itself away so it doesn't compete with the video — hover over the box to bring it back and change the link.

**Period switcher:** the three period tabs (plus the date, schedule type, prev/next day buttons, and a link back to the date list) are tucked away at the very top edge of the screen — fully collapsed to zero height when idle. Hover your mouse near the top to reveal them; move away and they tuck back out of sight.

**Prev/Next day buttons:** step to the next-highest or next-lowest date *in `dates.txt`* — not the literal next calendar day. If there's a gap in your dates (e.g. a weekend, or a day you haven't built yet), it skips straight to whatever's actually listed.

**Click-to-focus:** click any box to fade everything else down to a faint wash and bring that box forward; click it again, click anywhere outside all boxes, or press Escape to return to normal.

**Double-click anywhere** to toggle fullscreen.

On small/narrow screens (phones, small tablets) the board automatically falls back to a normal scrolling single-column layout instead, since a bento grid that tight isn't legible at that size.

## Adding links or codes inside a box
Any string field (agenda steps, connections, etc.) can contain raw HTML, since it's inserted directly — so a clickable link could be added as an agenda step:
```json
"<a href=\"https://classroom.google.com/c/XXXX?cjc=YYYY\" target=\"_blank\" rel=\"noopener\">Join Google Classroom</a>"
```
That said, since this board is meant to be projected (not clicked by students), 2026-08-10 instead shows each grade's join code as **plain text** — e.g. `"Google Classroom Code: IFUO4BFC"` — pulled from the `cjc=` part of the join URL, which is the actual code students would type in manually.

## Periods in the URL
Every board address carries its period: `agenda.html?date=2026-08-19&period=6`. `period` accepts `4`, `6`, or `7` (it will also accept `4th` or the full `4th Period`).

- Switching period tabs on the board rewrites the address bar, so the URL always matches what's on screen — you can bookmark or share a link to one specific period's day.
- Prev/Next day and the "All dates" back link carry the current period with them.
- If the URL asks for a period that doesn't meet that day (e.g. `period=6` on a Minimum Day), the board falls back to the live period, then to the first period that does meet.
- `index.html?period=6` opens the home page with 6th Period already selected. The last period picked is also remembered on that device.

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

## One gotcha for the HTML unit
Box content is rendered as HTML so that links work. That means a literal tag name typed into a JSON field — `locate <header> and <body> together` — is parsed as markup by the browser and **disappears from the board**. Write tag names escaped instead: `locate &lt;header&gt; and &lt;body&gt; together`.

No build step, no dependencies — it's plain HTML/CSS/JS, so it works as-is on GitHub Pages.

## Testing locally
From this folder: `python3 -m http.server 8000`, then open `http://localhost:8000`. (Opening `index.html` directly by double-clicking won't work — the browser blocks the `fetch()` calls for local files without a server.)
