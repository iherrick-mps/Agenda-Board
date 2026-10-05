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

## Scores on the VEX banner

The Monday "You should be working on your robot!" banner is a small carousel. Every
team that has played in the **last 14 days** gets a slide — both sides, their scores,
the followed team picked out, and the status and date above (`Final · Oct 3`,
`Q3 4:21 · Oct 5`) — and the reminder itself is the last slide in the cycle. It swaps
every 12 seconds, most recent game first.

The reminder stays *in* the rotation rather than being displaced, so the nudge to get
building still comes round every cycle instead of the board showing nothing but sports
all afternoon. With no recent games it's the only slide and simply sits there.

Fourteen days is wide enough to cover a bye week or a gap between fixtures, while a
team whose season ended months ago drops out rather than showing a stale score as
though it were news. The date on every card is there for the same reason. Change
`VEX_SCORE_WINDOW_DAYS` in `vex.js` to widen or narrow it.

Teams live in `VEX_SCORE_FEEDS` near the top of `vex.js`. Two sources, because no one
free feed covers all of them:

| source | where | how to name a team |
|---|---|---|
| `mlb` | `statsapi.mlb.com`, the official MLB API | `teamId` — the MLB club id (145 White Sox, 135 Padres) |
| `espn` | `site.api.espn.com` | `path` — everything between `/sports/` and `/schedule` in the team's ESPN URL |

Shipped with: White Sox, Padres, SDSU football, SDSU men's basketball, Chargers, San
Diego FC, San Diego Wave. Delete a line to drop a team; add one to follow another.

**Nothing here can break the board.** Each feed is fetched and parsed on its own, and
one that 404s, times out, or comes back in an unexpected shape is skipped with a
console warning while the rest carry on. If every feed fails — or no team played, or
the games haven't started, or they were postponed — the banner shows the reminder
exactly as it always did. The banner is the default; the score is the treat.

> **The ESPN paths are best-effort.** The two MLB ids are certain. The ESPN ones,
> especially the two soccer clubs, are from memory and may need correcting — a wrong
> path simply 404s and that team never appears, so the symptom is silence rather than
> breakage. Open the console on `vex.html` to see which feeds warned.

## VEX clean-up

The Clean-Up overlay on `vex.html` takes over the board **10 minutes before the end of
the day's last build block**, on club days only. That end comes from
`vex-sessions.json`, so it follows the real session rather than a time written into
the code: 4:00 PM on a Monday, 10:45 AM on a Saturday (the end of the second work
period, before snack and dismissal). It's the same file the competition countdown
reads, so the two can't disagree about when building stops. On a day with no session
— a holiday, a no-school Monday — it never fires.

It fires once per day, so dismissing it by hand doesn't bring it straight back, and
the Clean-Up button still works whenever you want it. The song plays at full volume:
it's a cue for a room that's already packing up and talking over it.

Ten minutes here rather than the 7 the 7th Period class gets — VEX has a field and six
robots' worth of parts to put away, not Chromebooks.

## VEX competition countdown

The Next Competition bento counts **build time**, not calendar time: `DD:HH:MM` of
actual hands-on-the-robot time left before `VEX_NEXT_COMPETITION` in `vex.js`. Sitting
through Thanksgiving break doesn't build anything, so only real sessions count. A
"day" here is 24 hours of build time, not a calendar day.

Which days those are lives in **`vex-sessions.json`**:

- **Saturdays** — only days marked *Saturday School* on the Saturday-school calendar.
  No-school Saturdays, breaks, and event Saturdays (STEAM Expo, SD Festival of Science
  & Engineering) are out.
- **Mondays** — from the MSA-SD academic calendar. A Monday counts unless it's No
  School, a Minimum Day, or on the shortened (Wednesday) schedule. Campus-event
  Mondays still count: school is in session, so club runs.

Session hours are in the same file under `blocks` — Mondays are 3:00–4:00 PM, and
Saturdays are the two work periods, 8:00–9:30 and 10:00–10:45 (break and snack aren't
build time). Editing a date or an hour there is all it takes; nothing is hard-coded in
`vex.js`.

A block already under way counts only the part still ahead, so during club the clock
ticks down live, second by second, rather than dropping in one lump at the bell.
Outside club hours it holds still — no build time is being spent, so a stopped clock
is the honest reading. Session times are
anchored to Pacific explicitly, like the rest of the board, so a laptop set to another
timezone still shows the right number. If the file is missing or unreadable the bento
shows `--:--:--` rather than zero — "no time left" is the opposite of the truth and
not something to guess at.

**Keeping it current.** The list runs to the end of the 2026-27 year. When the
calendar changes, edit `vex-sessions.json` directly.

## VEX music

The Now Playing box on `vex.html` has a playlist switcher in its top-left corner,
opposite the Show/Hide Video button. It names the playlist that's currently going —
**Class Playlist** or **Guardians Mix** — and clicking it swaps to the other one. The
choice is remembered per device, so the laptop and the projector can each sit on a
different list.

Switching swaps the playlist inside the existing player rather than rebuilding the
embed, which keeps the volume and avoids re-tripping the browser's autoplay rules. It
also starts the new list on a random track, the same way a fresh page load does.

To add or change a playlist, edit `VEX_PLAYLISTS` near the top of `vex.js` — the
button cycles however many entries are in that list, so a third is just another entry.
The first entry is what a device gets before anyone picks.

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

**Rolling totals.** Across the top, one card per grade: how much class time that
grade has spent on transitions over the **last five school days**. The window is
counted in school days taken from the records themselves, not calendar days, so a
holiday or a four-day week doesn't quietly shorten it. All three grades share one
window so the numbers are comparable, and periods where the timer was never stopped
are left out, same as everywhere else. These totals keep their own window on purpose
— the range buttons below them don't change them.

**The table.** One row per school day, one column per class, plus a day average and
per-class averages across the range. Readings are color-banded — green under 2
minutes, amber in between, red over 5 — with a length bar under each so a column can
be read at a glance. Filter to the last 2 weeks / 30 days / all time, download the
whole range as CSV, or hover a cell and click **×** to delete a bad record. The table
is live: a period that ends while the page is open appears on its own.

### Earned game time

The **Game Time** button in the hover-bar starts Game Mode for however long the live
class has earned: **30 minutes minus every second that grade spent in transitions this
week**, Monday through today. A class that settles quickly keeps most of the half
hour; one that dawdles spends it.

The button carries the number before you press it (`Game Time · 19m`) and lights up
when there's time banked, so the class can see what they earned. Pressing it starts a
countdown of exactly that length, which **stops itself when the time runs out** rather
than running to the bell. Pressing it again ends it early.

Each grade is exactly one period (4th = 8th grade, 6th = 7th, 7th = 6th), so each
class earns its own number. The totals come from the same records the Transition Timer
writes, so this needs Firebase set up (below).

Two things deliberately don't cost a class its reward:

- **Periods where the timer was never stopped** are skipped, exactly as they're left
  out of the averages on `transitions.html` — that reading is how long a tab sat open,
  not a transition.
- **If the records can't be read**, the button says `No records yet` and refuses to
  start, instead of silently handing out a full 30 minutes. An unknown week is never
  treated as a clean one.

A grade that has already spent its 30 minutes shows `None earned` when pressed.

**Fridays are game time, start to finish.** Clean-Up Mode's automatic start is
Monday through Thursday only — on Fridays 7th Period ends on earned game time, and a
claw machine calling numbers over the top of it would cut that short. The Clean-Up
button still works by hand any day, Fridays included.

> **Why a button and not a timer.** This used to fire itself when the live countdown
> reached the earned number. That depended on a Firestore read resolving at exactly
> the right second on a board that had been open all day — and when any part of that
> didn't hold, the reward simply never appeared, with nothing on screen to explain
> why. A button answers when pressed, and says why when it can't.

The separate **Auto Game Mode at ___ min left** box is unchanged and unrelated: type a
number and Game Mode starts itself at that many minutes left, Fridays only. Leave it
empty and nothing auto-starts.

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
