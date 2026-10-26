/* ============================================================
   teacher-plan.js — live teacher run-of-show for one day.
   Reads data/teacher/YYYY-MM-DD.json + bells.json.
   URL options: ?date=2026-10-26  ?time=11:30 (pretend it's that time)
   ============================================================ */
(function () {
  const params = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- Pacific time, with optional ?time= override (keeps ticking) ----
  function pacificParts(d) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "long" });
    const o = {}; f.formatToParts(d).forEach((p) => (o[p.type] = p.value));
    const h = o.hour === "24" ? 0 : +o.hour;
    return { iso: `${o.year}-${o.month}-${o.day}`, weekday: o.weekday, sec: h * 3600 + +o.minute * 60 + +o.second };
  }
  let offsetSec = 0;
  const startReal = pacificParts(new Date());
  if (params.get("time")) {
    const [hh, mm] = params.get("time").split(":").map(Number);
    offsetSec = hh * 3600 + mm * 60 - startReal.sec;
  }
  const nowSec = () => pacificParts(new Date()).sec + offsetSec;
  const toSec = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 3600 + m * 60; };
  const fmtClock = (s) => { s = Math.max(0, Math.floor(s)); let h = Math.floor(s / 3600) % 24; const m = Math.floor(s / 60) % 60;
    const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${ap}`; };
  const fmtLeft = (s) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, "0")}`; };

  const date = params.get("date") || startReal.iso;
  const weekday = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

  let plan, periods = [], selPeriod = null, selSeg = null, lastKey = "";

  async function load() {
    $("tp-date").textContent = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    try {
      const r = await fetch(`data/teacher/${date}.json`, { cache: "no-store" });
      if (!r.ok) throw 0;
      plan = await r.json();
    } catch (e) {
      $("tp-main").innerHTML = `<div class="empty">No teacher plan for this day yet. (Looking for <code>data/teacher/${esc(date)}.json</code>.)</div>`;
      tickClock(); setInterval(tickClock, 1000); return;
    }
    let schedName = weekday === "Wednesday" ? "shortened" : "regular";
    try { const d = await fetch(`data/${date}.json`, { cache: "no-store" }); if (d.ok) { const j = await d.json(); if (j.schedule) schedName = j.schedule; } } catch (e) {}
    const bells = await (await fetch("bells.json", { cache: "no-store" })).json();
    const sched = bells[schedName] || bells.regular;

    $("tp-title").textContent = plan.title || "Teacher Plan";
    $("tp-note").textContent = plan.note || "";
    for (const [name, p] of Object.entries(plan.periods)) {
      const bell = sched.periods.find((b) => b.name === name);
      if (!bell) continue;
      const start = toSec(bell.start), end = toSec(bell.end);
      let t = start;
      const segs = p.segments.map((s) => { const g = { ...s, start: t, end: t + s.min * 60 }; t = g.end; return g; });
      if (segs.length) segs[segs.length - 1].end = Math.max(segs[segs.length - 1].end, end);
      periods.push({ name, ...p, start, end, segs });
    }
    periods.sort((a, b) => a.start - b.start);
    tick(); setInterval(tick, 1000);
  }

  function livePeriod(n) { return periods.find((p) => n >= p.start && n < p.end); }
  function autoPeriod(n) { return livePeriod(n) || periods.find((p) => p.start > n) || periods[periods.length - 1]; }
  function liveSegIndex(p, n) { return p.segs.findIndex((s) => n >= s.start && n < s.end); }

  function tickClock() { $("tp-clock").textContent = fmtClock(nowSec()).replace(" ", ":" + String(Math.floor(nowSec()) % 60).padStart(2, "0") + " "); }

  function tick() {
    tickClock();
    const n = nowSec();
    const p = selPeriod ? periods.find((x) => x.name === selPeriod) : autoPeriod(n);
    if (!p) return;
    const live = livePeriod(n);
    const phase = n < p.start ? "before" : n >= p.end ? "after" : "live";
    const liveIdx = phase === "live" ? liveSegIndex(p, n) : -1;
    const showIdx = selSeg !== null ? selSeg : phase === "live" ? liveIdx : 0;
    const key = [p.name, phase, liveIdx, showIdx, live && live.name].join("|");
    if (key !== lastKey) { lastKey = key; render(p, phase, liveIdx, showIdx, live); }
    updateLive(p, phase, liveIdx, showIdx, n);
  }

  function render(p, phase, liveIdx, showIdx, live) {
    // tabs
    $("tp-tabs").innerHTML = periods.map((x) => `<button class="tp-tab${x.name === p.name ? " active" : ""}${live && live.name === x.name ? " live" : ""}" data-p="${esc(x.name)}">${esc(x.name)}<small>${esc(x.grade)} · ${fmtClock(x.start)}–${fmtClock(x.end)}</small></button>`).join("");
    $("tp-tabs").querySelectorAll(".tp-tab").forEach((b) => b.onclick = () => {
      const auto = autoPeriod(nowSec());
      selPeriod = b.dataset.p === auto.name ? null : b.dataset.p; selSeg = null; lastKey = ""; tick();
    });

    const s = p.segs[showIdx];
    const following = (phase === "live" && selSeg === null) ? p.segs[liveIdx + 1] : null;
    const status = selSeg !== null ? `Previewing step ${showIdx + 1} of ${p.segs.length}`
      : phase === "live" ? `Now · step ${liveIdx + 1} of ${p.segs.length}`
      : phase === "before" ? `Up next · ${esc(p.name)} starts at ${fmtClock(p.start)}`
      : `${esc(p.name)} is over · showing step 1`;

    const prepKey = `tp-prep-${date}-${p.name}`;
    let checked = {};
    try { checked = JSON.parse(localStorage.getItem(prepKey) || "{}"); } catch (e) {}

    $("tp-main").innerHTML = `
    <div class="tp-wrap">
      <div>
        <div class="card now">
          <div class="now-status" id="now-status">${status}${selSeg !== null ? `<span class="peek" id="back-live">← back to live</span>` : ""}</div>
          <div class="now-title">${esc(s.title)}</div>
          <div class="now-time"><span class="now-left" id="now-left">${s.min}:00</span><span class="now-range">${fmtClock(s.start)} – ${fmtClock(s.end)} · ${s.min} min</span></div>
          <div class="bar"><div id="now-bar"></div></div>
          <div class="label lbl-do">What to do</div><p>${esc(s.do)}</p>
          <div class="label lbl-why">Why</div><p>${esc(s.why)}</p>
          <div class="label lbl-tips">Tips</div><ul>${s.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          ${following ? `<div class="next-up">Next at ${fmtClock(following.start)}: ${esc(following.title)}</div>` : ""}
        </div>
        ${phase === "before" ? prepCard(p, checked) : ""}
        <div class="card watch"><h2>Watch for</h2><ul>${p.watchFor.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
      </div>
      <div>
        <div class="card goal"><h2>${esc(p.grade)} · ${esc(p.topic)}</h2>
          <p><strong>SMART goal:</strong> ${esc(p.goal)}</p>
          <p><strong>Exit ticket:</strong> ${esc(p.exitTicket)}</p>
          <div class="meta">Bloom: ${esc(p.bloom)}</div></div>
        <div class="card tl"><h2>Schedule</h2><ol>${p.segs.map((g, i) => `<li data-i="${i}" class="${i === liveIdx ? "cur" : (phase === "after" || (phase === "live" && i < liveIdx)) ? "done" : ""}${i === showIdx ? " sel" : ""}"><span class="t">${fmtClock(g.start)}</span><span>${esc(g.title)}</span><span class="m">${g.min}m</span></li>`).join("")}</ol></div>
        ${phase !== "before" ? prepCard(p, checked) : ""}
        <details class="card acc"><summary>Accommodations</summary><table>${(plan.accommodations || []).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</table></details>
        <details class="card fw acc"><summary>Frameworks</summary><table>${(plan.frameworks || []).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</table></details>
      </div>
    </div>`;

    document.querySelectorAll(".tl li").forEach((li) => li.onclick = () => {
      const i = +li.dataset.i; selSeg = (phase === "live" && i === liveIdx) ? null : i; lastKey = ""; tick();
    });
    const back = $("back-live"); if (back) back.onclick = () => { selSeg = null; lastKey = ""; tick(); };
    document.querySelectorAll(".prep input").forEach((cb) => cb.onchange = () => {
      checked[cb.dataset.k] = cb.checked;
      try { localStorage.setItem(prepKey, JSON.stringify(checked)); } catch (e) {}
    });
  }

  function prepCard(p, checked) {
    return `<div class="card prep"><h2>Before ${esc(p.name)}</h2>${p.prep.map((x, i) => `<label><input type="checkbox" data-k="${i}"${checked[i] ? " checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>`;
  }

  function updateLive(p, phase, liveIdx, showIdx, n) {
    const left = $("now-left"), bar = $("now-bar"), st = $("now-status");
    if (!left) return;
    const s = p.segs[showIdx];
    if (phase === "live" && selSeg === null) {
      left.textContent = fmtLeft(s.end - n) + " left";
      bar.style.width = (100 * (n - s.start) / (s.end - s.start)).toFixed(1) + "%";
    } else if (phase === "before" && selSeg === null) {
      left.textContent = "starts in " + fmtLeft(p.start - n);
      bar.style.width = "0%";
    } else {
      left.textContent = `${s.min}:00`;
      bar.style.width = "0%";
    }
  }

  load();
})();
