# Agenda Board

A daily agenda board for Robotics & Coding, deployable to GitHub Pages.

## What's here
- `index.html` — **pick a period, then pick a day.** A month calendar (starting August 2026, running through the last month present in `data/index.json`) with today outlined; days that have an agenda file are clickable, the rest are greyed out. Each load also checks the current Monday-through-Sunday week for newly added agenda files.
- `agenda.html` — the board itself: a full-screen, no-scroll grid of boxes. Reads `?date=YYYY-MM-DD&period=4` from the URL and loads the matching file from `data/`.
- `styles.css` — all colors and sizing. The 7 box colors are CSS variables at the top (`--c-working`, `--c-deliverable`, `--c-goal`, `--c-standard`, `--c-eld`, `--c-agenda`, `--c-connect`) — change a hex value there to re-theme a box everywhere. The board layout itself (which box goes where, and how big) is the `grid-template-areas` block in the `.board-grid` rule.
- `script.js` — clock/countdown logic, date list rendering, box rendering, and the auto-fit-text routine.
- `bells.json` — the three bell schedules (Regular, Shortened/Wednesday, Minimum Day), built from the 2025-26 bell schedule PDF.
- `data/index.json` — archive index of agenda dates. Files added during the current week are discovered automatically, so they do not need to be registered separately.
- `overview.html` / `overview.js` — the **Day Overview**: today's plans for both tracks side by side (8th grade left, 6th/7th right). `current-day.html` shows this automatically from the 1st period bell through the end of 3rd period.
- `transitions.html` / `transitions.js` — the **Transition Times** table: every class, every day, how long it took to settle.
- `transitions-record.js` — writes the Transition Timer's reading to Firestore. Loaded only by `agenda.html`.
- `firebase-config.js` — Firebase keys for the board's own Firebase project. Nothing else in the repo uses these; the help queue is a separate project reached through an iframe and is not affected by them.
- `firestore.rules` — the complete rules file to paste into the Firebase console. Not uploaded to GitHub Pages by necessity, but harmless if it is.
- `data/YYYY-MM-DD.json` — one file per school day. Sample files for 2026-08-07, 08-10, 08-11, 08-12 are included as examples.

## The agenda board layout
Ten boxes tile the full screen with no scrolling, no matter what screen it's displayed on:
**Clock**, **Ms. Herrick** (name), **Now Playing**, **What should I be working on right now?**, **Due on Sunday** (this week's deliverable), **ELD Standard**, **Content Standard**, **Agenda/Steps**, **Connections**, **SMART Goal**. Agenda/Steps gets the most space since it usually has the most content; ELD Standard and Content Standard sit stacked together on the left and are intentionally small since students don't read those directly. Time durations in agenda steps (e.g. "(5 min)") are automatically styled in a muted monospace so they're easy to skim without competing with the step text.

Each text box's font automatically grows or shrinks to fill exactly the space it has — no wasted space, and it never overflows or scrolls, regardless of how much or little text is in that box that day.

**Transition Timer:** a stopwatch strip sitting between the clock and the name card — Start, Stop, Clear, counting `MM:SS` (it rolls over to `H:MM:SS` past an hour). The digits turn green while it's running. It measures against the real wall clock rather than counting ticks, so it stays accurate even if the browser throttles the tab. It clears and starts itself at the bell for **4th, 6th, and 7th period only** — her three classes, the ones a transition is recorded for — so each of those periods begins timing with nobody touching it, and it stops on its own when that class ends. Every other bell (Advisory, 1st through 3rd, lunch, after school) leaves it alone; **Start** is still there to time anything else by hand, and once a button has been touched no bell will stop that run out from under you. Press **Stop** once the class is settled — that reading is the transition, and a small green `recorded` mark appears under the label to confirm it's on file. See "Transition Times" below.

**Clock box:** shows today's real date (`YYYY/MM/DD · WEEKDAY`), the live Pacific time, and the countdown — always reflects the real day/time, not whatever date's board you're viewing. "Ms. Herrick" sits in its own small box directly underneath, sized so the two together match the height of the Working/Deliverable boxes beside them.

**Now Playing:** a black box with a text field — paste any YouTube video or playlist link and press Enter (or click away) and it embeds inline, starting at a low volume (just above mute) rather than whatever volume YouTube defaults to. YouTube Music playlist links generally work too as long as they carry a `list=` ID, though some auto-generated "mix" playlists may not embed. The link is saved in the browser's local storage on that device, so it survives a page refresh, but it isn't synced anywhere — pasting it again on a different computer/browser starts fresh. Once something is playing, the paste-in field tucks itself away so it doesn't compete with the video — hover over the box to bring it back and change the link.

**Period switcher:** the three period tabs (plus the date, schedule type, prev/next day buttons, the mode toggles, and a **← Home** link) are tucked away at the very top edge of the screen — fully collapsed to zero height when idle. Hover your mouse near the top to reveal them; move away and they tuck back out of sight. The controls are grouped — where you are / which period / which mode — and the bar wraps onto as many rows as it needs, so a narrower window or a 1280-wide projector stacks the groups instead of running them off the right edge. **← Home** always leaves the board entirely, even when the board is being shown inside `current-day.html`.

**Prev/Next day buttons:** step to the next-highest or next-lowest date in the agenda data — not the literal next calendar day. If there's a gap in your dates (e.g. a weekend, or a day you haven't built yet), it skips straight to whatever's actually listed.

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
- Prev/Next day and the "← Home" back link carry the current period with them.
- If the URL asks for a period that doesn't meet that day (e.g. `period=6` on a Minimum Day), the board falls back to the live period, then to the first period that does meet.
- `index.html?period=6` opens the home page with 6th Period already selected. The last period picked is also remembered on that device.

## Adding a new day
1. Duplicate a file in `data/` and rename it to the new date, e.g. `data/2026-08-13.json`.
2. Set `"schedule"` to `"regular"`, `"shortened"`, or `"minimum"`.
3. Fill in `"4th Period"`, `"6th Period"`, `"7th Period"` (only include the ones that meet that day — Minimum Days, for example, only have 4th Period).
4. Add the date to `data/index.json` when it is outside the current week. Files added during the current week are picked up automatically on the next page load.

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

## Chimes
On every page, the moment the green in-session countdown reaches `00:00` — the bell — the board plays a five-note chime and pauses whatever music or video is playing, so the chime isn't competing with a playlist for the room's attention.

- **Bell chime:** a slow, long-ringing five notes (about 3.5 seconds) so it carries over a talking class. It follows whichever countdown the page is actually showing, which means the pages with a fixed end time (Tutoring's 4:00 PM, VEX's Monday club end) chime at their own end too.
- **Mode chime:** a quicker, brighter five-note flourish, played instead whenever **Game Mode** or **Clean-Up Mode** takes over the board — whether that was the toolbar button or the automatic trigger. It's deliberately different from the bell so nobody starts packing up at the wrong moment. It pauses the music the same way, which matters most in Clean-Up Mode, where the numbers are then called out loud.
- Pausing covers ordinary `<audio>`/`<video>` as well as every YouTube embed on the page (Now Playing, Theater Mode, Study Hall, Indoor Lunch, VEX). Nothing resumes automatically — press play again when you're ready.
- Browsers won't let a page make noise until it's been interacted with at least once, so the first click or keypress on the board (anything at all — switching tabs, toggling fullscreen) is what arms the audio for the rest of the day. If the board has been freshly loaded and never touched, the first bell may be silent.
- The chimes are synthesized in the browser with Web Audio, so there are no sound files to host and nothing extra to fetch.

## Deploying to GitHub Pages
1. Push this folder to a GitHub repo (e.g. `iherrick-mps/agenda-board`).
2. In the repo: **Settings → Pages → Source → Deploy from branch**, pick `main` (or your default branch) and `/ (root)`.
3. Your board will be live at `https://iherrick-mps.github.io/agenda-board/`.

## One gotcha for the HTML unit
Box content is rendered as HTML so that links work. That means a literal tag name typed into a JSON field — `locate <header> and <body> together` — is parsed as markup by the browser and **disappears from the board**. Write tag names escaped instead: `locate &lt;header&gt; and &lt;body&gt; together`.

No build step, no dependencies — it's plain HTML/CSS/JS, so it works as-is on GitHub Pages.

## Testing locally
From this folder: `python3 -m http.server 8000`, then open `http://localhost:8000`. (Opening `index.html` directly by double-clicking won't work — the browser blocks the `fetch()` calls for local files without a server.)

## Transition Times

Every class period's transition length is recorded automatically and collected at
`transitions.html`.

**How a record gets made.** The Transition Timer clears and starts itself the instant
the bell for one of her three classes rings. When Ms. Herrick presses **Stop**, that reading is saved right then —
so closing the tab, losing the projector, or reloading can't lose it. When the next
bell rings, the record for the period that just ended is finalized. A period where
the timer was never stopped still gets a row, flagged `not stopped` and struck
through, and it's left out of every average — the reading there is "how long the tab
sat open," not a transition.

Only 4th, 6th, and 7th period are recorded — and those are now the only bells that
start the timer at all. It used to start itself at every bell and simply throw the
other readings away, which left it ticking through Advisory, lunch, and the whole
afternoon. The rest of the day it's a plain stopwatch: press Start yourself, and no
bell will interrupt a run you started.

**Where it goes.** A `transitions` collection in the board's own Firebase project —
separate from the help queue, which the board only ever embeds in an iframe and
never talks to directly. One document per class per day, with a deterministic ID
(`2026-09-17_4` = September 17th, 4th period). That ID is the reason the projector,
the laptop, and three forgotten tabs all write to the same row instead of filling
the table with duplicates. A write also refuses to overwrite a stopped reading with
a never-stopped one, so a stale tab sitting at 48:12 can't clobber the real 1:34.

**The table.** One row per school day, one column per class, plus a day average and
per-class averages across the range. Readings are color-banded — green under 2
minutes, amber in between, red over 5 — with a length bar under each so a column can
be read at a glance. Filter to the last 2 weeks / 30 days / all time, download the
whole range as CSV, or hover a cell and click **×** to delete a bad record. The table
is live: a period that ends while the page is open appears on its own.

### Firebase setup (one time)

The board records into its **own** Firebase project, separate from the help queue.
The queue is only ever embedded in an iframe — the board never talks to it directly,
so none of this touches it.

**1. Create the database.** In the new project: **Build → Firestore Database →
Create database**. Choose **Native mode** (not Datastore mode) and a US location —
`us-west1` is closest to Pacific time. The location is permanent; everything else here
can be changed later.

**2. Register a web app.** Project settings (the gear) → **Your apps** → the **Web**
icon (`</>`). Give it any nickname; **don't** check "Firebase Hosting" — the board is
already hosted on GitHub Pages. Firebase then shows a `firebaseConfig = { ... }` block.

**3. Copy those keys into `firebase-config.js`,** replacing the ones already there.
Keep the `const firebaseConfig = {` line exactly as it is; only the six values inside
change. These keys are safe to commit — they identify the project, they don't grant
access to it. What actually guards the data is the rules file in step 4.

**4. Publish the rules.** **Build → Firestore Database → Rules**, select everything in
the editor, paste `firestore.rules` over it, and **Publish**. A new database starts
either wide open for 30 days ("test mode") or locked shut ("production mode") — both
need replacing, the first because records quietly stop saving a month in.

**Check it worked.** Open `transitions.html`. Before the rules are published it says
*"Couldn't read the records: Missing or insufficient permissions."* After, it should
say *"No transition records in this range yet."* — and the first class period that
ends with the board open fills in a row.

Until all four steps are done the board still works normally and the timer still runs;
the records just silently fail to save.

Records have no TTL — unlike queue rooms, this data is the point, and a year of it is
a few hundred tiny documents.

## Day Overview

`overview.html` shows one day's plans as two columns: **8th grade (4th Period)** on
the left, **6th & 7th grade** on the right. Since 6th and 7th normally run the same
plan, they share one column; on a day where their JSON actually differs, that column
splits into two labeled cards instead of quietly showing one and hiding the other.

Each column carries the SMART goal, what they're working on, the agenda steps, the
Sunday deliverable, both standards, and the connections — the same fields the bento
board rotates through, just all visible at once.

`current-day.html` switches to this page on its own **from the 1st period bell
through the end of 3rd period** — the stretch of the day before she starts teaching —
then hands off to the live class board at the 3rd period bell, exactly as before.
Outside that window it's still reachable from the home page, and its Prev/Next
buttons walk through any date in the agenda data, so it works for reading a day ahead.

The page re-fetches its day file every five minutes, so editing a JSON file updates
the projected overview without anyone reloading anything.
