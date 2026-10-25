(function () {
  "use strict";

  const D = window.EMBA;
  const REG = D.program.courseRegistry;
  const STORE_DONE = "emba28.done";
  const STORE_PREFS = "emba28.prefs";

  const KINDS = {
    assignment: { label: "Assignments", tag: "Assignment", checkable: true, due: true },
    exam: { label: "Exams", tag: "Exam", checkable: true, due: true },
    case: { label: "Cases", tag: "Case", checkable: true },
    reading: { label: "Readings", tag: "Reading", checkable: true },
    session: { label: "Class sessions", tag: "Class" },
    colloquium: { label: "Colloquium", tag: "Colloquium" },
    office: { label: "Office hrs & reviews", tag: "Office hrs" },
    event: { label: "Program events", tag: "Event" }
  };
  const HAS_REQ = new Set(["assignment", "exam", "case", "reading"]);
  const HAS_MODE = new Set(["assignment", "exam"]);
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // ---------- storage (never trusted to exist) ----------
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode etc. */ }
  }

  // ---------- dates ----------
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const todayIso = iso(new Date());
  const fmtDate = (s) => { const d = parseDate(s); return MON[d.getMonth()] + " " + d.getDate(); };
  const fmtDow = (s) => DOW[parseDate(s).getDay()];
  function fmtTime(t) {
    if (!t) return "";
    if (t === "00:00") return "12:00 AM";
    if (t === "23:59") return "11:59 PM";
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + String(m).padStart(2, "0") + " " + ap;
  }
  const shortTime = (t) => fmtTime(t).replace(":00", "").replace(" AM", "a").replace(" PM", "p");
  const fmtRange = (a, b) => a ? fmtTime(a) + (b ? " – " + fmtTime(b) : "") : "";
  function fmtLongDate(s) {
    const d = parseDate(s);
    return DOW[d.getDay()] + ", " + MONTH_LONG[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const courseInfo = (id) => REG[id] || { code: id, name: id, color: "#00356b" };
  const courseNum = (id) => id === "PROGRAM" ? "EMBA" : id.replace("MGT", "");
  const fmtPts = (p) => p == null ? "" : (Math.round(p * 100) / 100) + "%";

  // ---------- build the unified item list ----------
  const courses = D.courses.slice().sort((a, b) => a.id.localeCompare(b.id));
  courses.forEach((c) => { REG[c.id] = Object.assign({}, REG[c.id] || {}, { code: c.code, name: c.name, color: (REG[c.id] || {}).color || "#00356b" }); });
  const courseById = Object.fromEntries(courses.map((c) => [c.id, c]));

  // The master schedule lists last names ("Baron/Adler/Kim"); expand them from courseRegistry.faculty.
  function facultyFor(courseId, lastNames) {
    const fac = (REG[courseId] && REG[courseId].faculty) || [];
    if (!lastNames) return fac;
    return lastNames.split("/").map((ln) => {
      ln = ln.trim();
      return fac.find((f) => f.name.split(/\s+/).pop().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .startsWith(ln.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().slice(0, 4))) || { name: ln };
    });
  }
  const facultyNames = (fac) => fac.map((f) => f.name).join(", ");

  const items = [];
  (D.sessions || []).forEach((s) => {
    if (s.kind === "event") {
      items.push({ id: s.id, kind: "event", course: "PROGRAM", title: s.title, date: s.date, time: s.start, endTime: s.end });
      return;
    }
    const c = courseById[s.course] || {};
    const it = {
      id: s.id, kind: s.course === "MGT699" ? "colloquium" : "session", course: s.course,
      title: s.name, date: s.date, time: s.start, endTime: s.end,
      location: s.room ? "Room " + s.room : null, topics: []
    };
    if (s.instructor) { it.faculty = facultyFor(s.course, s.instructor); it.instructor = facultyNames(it.faculty); }
    (c.topics || []).forEach((t) => {
      if (t.date !== s.date) return;
      if (t.start && s.start && (t.start < s.start || (s.end && t.start >= s.end))) return;
      it.topics.push(t.label);
    });
    const sp = (c.speakers || []).find((x) => x.date === s.date);
    if (sp) {
      it.title = "Colloquium: " + sp.speaker;
      it.speaker = sp;
      it.location = sp.location;
    }
    items.push(it);
  });
  (D.program.milestones || []).forEach((m) => items.push({ id: m.id, kind: "event", course: "PROGRAM", title: m.title, date: m.date, endDate: m.endDate }));
  courses.forEach((c) => (c.items || []).forEach((x) => {
    items.push(Object.assign({}, x, { kind: x.type, course: c.id }));
  }));
  function facultyHtml(fac) {
    return fac.map((f) => (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + "</a>" : esc(f.name)) +
      (f.title ? ' <span style="color:var(--ink-3)">· ' + esc(f.title) + "</span>" : "") +
      (f.verify ? ' <span class="verify" title="' + esc(f.verify) + '">⚠ verify</span>' : "")).join("<br>");
  }
  items.forEach((it) => { it.sortKey = (it.date || "9999-99-99") + " " + (it.time || "99:99") + " " + (KINDS[it.kind].due ? "0" : "1"); });
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const coursesWithItems = Object.keys(REG).filter((id) => items.some((i) => i.course === id));

  // ---------- state ----------
  const done = new Set(load(STORE_DONE, []));
  const defaults = {
    view: "list",
    kinds: Object.keys(KINDS),
    req: ["required", "optional"],
    mode: ["individual", "group", "unspecified"],
    courses: coursesWithItems.slice(),
    range: "cycle",
    hideDone: false,
    month: todayIso.slice(0, 7)
  };
  const prefs = Object.assign({}, defaults, load(STORE_PREFS, {}));
  ["kinds", "req", "mode", "courses"].forEach((k) => { prefs[k] = new Set(prefs[k]); });
  // A course added after the user last visited should show up, not stay hidden.
  const seen = new Set(load(STORE_PREFS, {}).knownCourses || []);
  coursesWithItems.forEach((id) => { if (!seen.has(id)) prefs.courses.add(id); });
  if (!["cycle", "upcoming", "all"].includes(prefs.range)) prefs.range = defaults.range;
  let query = "";

  // The current class cycle: from the Sunday after the last class weekend through the
  // Saturday that ends the next one (about two weeks).
  function currentCycle() {
    const wk = D.program.classWeekends;
    const i = wk.findIndex((w) => w[1] >= todayIso);
    if (i < 0) return null;
    const start = i ? iso(new Date(parseDate(wk[i - 1][1]).getTime() + 864e5)) : todayIso;
    return { start, end: wk[i][1], weekend: wk[i] };
  }
  const cycle = currentCycle();
  const cycleLabel = cycle ? fmtDow(cycle.start) + " " + fmtDate(cycle.start) + " – " + fmtDow(cycle.end) + " " + fmtDate(cycle.end) : "";

  function persist() {
    save(STORE_PREFS, {
      view: prefs.view, kinds: [...prefs.kinds], req: [...prefs.req], mode: [...prefs.mode],
      courses: [...prefs.courses], range: prefs.range, hideDone: prefs.hideDone, month: prefs.month,
      knownCourses: coursesWithItems
    });
  }
  function setDone(id, on) {
    if (on) done.add(id); else done.delete(id);
    save(STORE_DONE, [...done]);
    render();
  }

  function matches(it, opts) {
    opts = opts || {};
    if (!prefs.kinds.has(it.kind)) return false;
    if (!prefs.courses.has(it.course)) return false;
    if (HAS_REQ.has(it.kind) && !prefs.req.has(it.required === false ? "optional" : "required")) return false;
    if (HAS_MODE.has(it.kind) && !prefs.mode.has(it.mode || "unspecified")) return false;
    if (prefs.hideDone && done.has(it.id)) return false;
    if (!opts.ignoreRange) {
      if (prefs.range === "upcoming" && it.date && (it.endDate || it.date) < todayIso) return false;
      if (prefs.range === "cycle" && cycle && (!it.date || it.date > cycle.end || (it.endDate || it.date) < cycle.start)) return false;
    }
    if (query) {
      const hay = [it.title, it.notes, courseInfo(it.course).code, courseInfo(it.course).name, (it.topics || []).join(" "),
        it.speaker && it.speaker.title, it.instructor, facultyNames(facultyFor(it.course))].join(" ").toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  }

  // ---------- filters UI ----------
  const $ = (sel) => document.querySelector(sel);
  // Each filter group is a dropdown of checkboxes; the button summarizes what's selected.
  let openDD = null;
  function ddOption(group, o) {
    const on = prefs[group].has(o.value);
    return '<label class="dd-opt' + (on ? "" : " off") + '">' +
      '<input type="checkbox" data-group="' + group + '" value="' + esc(o.value) + '"' + (on ? " checked" : "") + ">" +
      (o.color ? '<i class="dd-swatch" style="background:' + o.color + '"></i>' : "") +
      '<span class="dd-label">' + esc(o.label) + (o.sub ? " <small>" + esc(o.sub) + "</small>" : "") + "</span>" +
      '<button type="button" class="dd-only" data-only="' + group + '" data-value="' + esc(o.value) + '" title="Show only this">only</button></label>';
  }
  function dropdown(group, label, opts) {
    const n = opts.filter((o) => prefs[group].has(o.value)).length;
    const summary = n === opts.length ? "All" : n === 0 ? "None" : n + " of " + opts.length;
    const dots = opts.filter((o) => o.color && prefs[group].has(o.value)).slice(0, 8)
      .map((o) => '<i class="dd-dot" style="background:' + o.color + '"></i>').join("");
    const open = openDD === group;
    let menu = "", section = null;
    opts.forEach((o) => {
      if (o.section && o.section !== section) { section = o.section; menu += '<div class="dd-section">' + esc(section) + "</div>"; }
      menu += ddOption(group, o);
    });
    return '<div class="dd' + (open ? " open" : "") + (n < opts.length ? " filtered" : "") + '" data-dd="' + group + '">' +
      '<button type="button" class="dd-btn" aria-haspopup="true" aria-expanded="' + open + '">' +
      '<span class="dd-name">' + esc(label) + '</span><span class="dd-sum">' + summary + "</span>" +
      (dots ? '<span class="dd-dots">' + dots + "</span>" : "") + '<span class="dd-caret">▾</span></button>' +
      '<div class="dd-menu"' + (open ? "" : " hidden") + '><div class="dd-quick"><button type="button" data-all="' + group + '">Select all</button>' +
      '<button type="button" data-none="' + group + '">Clear</button></div>' + menu + "</div></div>";
  }
  const groupOptions = {
    kinds: () => Object.entries(KINDS).map(([k, v]) => ({ value: k, label: v.label })),
    courses: () => {
      const withSyllabus = coursesWithItems.filter((id) => courseById[id]);
      const scheduleOnly = coursesWithItems.filter((id) => !courseById[id] && id !== "PROGRAM");
      return withSyllabus.map((id) => ({ value: id, label: courseNum(id) + " " + courseInfo(id).name, color: courseInfo(id).color, section: "Current courses" }))
        .concat(scheduleOnly.map((id) => ({ value: id, label: courseNum(id) + " " + courseInfo(id).name, color: courseInfo(id).color, section: "Class schedule only (syllabus not loaded)" })))
        .concat(coursesWithItems.includes("PROGRAM") ? [{ value: "PROGRAM", label: "Program events", color: courseInfo("PROGRAM").color, section: "Program" }] : []);
    },
    req: () => [{ value: "required", label: "Required" }, { value: "optional", label: "Optional" }],
    mode: () => [{ value: "individual", label: "Individual" }, { value: "group", label: "Group" }, { value: "unspecified", label: "Not yet specified" }]
  };
  const RANGES = [
    { value: "cycle", label: "Through next class weekend", short: cycle ? fmtDate(cycle.start) + " – " + fmtDate(cycle.end) : "Next weekend", sub: cycleLabel },
    { value: "upcoming", label: "All upcoming", short: "All upcoming", sub: "Today onward" },
    { value: "all", label: "Full year", short: "Full year", sub: "Including past items" }
  ];
  function rangeMenu() {
    const cur = RANGES.find((r) => r.value === prefs.range) || RANGES[0];
    const open = openDD === "range";
    return '<div class="dd dd-range' + (open ? " open" : "") + '" data-dd="range">' +
      '<button type="button" class="dd-btn" aria-haspopup="true" aria-expanded="' + open + '">' +
      '<span class="dd-name">Dates</span><span class="dd-sum dd-sum-strong">' + esc(cur.short) + '</span><span class="dd-caret">▾</span></button>' +
      '<div class="dd-menu"' + (open ? "" : " hidden") + ">" +
      RANGES.map((r) => '<label class="dd-opt dd-radio"><input type="radio" name="range" data-group="range" value="' + r.value + '"' +
        (r.value === prefs.range ? " checked" : "") + '><span class="dd-label">' + esc(r.label) +
        (r.sub ? "<small>" + esc(r.sub) + "</small>" : "") + "</span></label>").join("") + "</div></div>";
  }
  function renderFilters() {
    $("#filters").innerHTML = '<div class="fbar">' +
      dropdown("courses", "Courses", groupOptions.courses()) +
      dropdown("kinds", "Show", groupOptions.kinds()) +
      dropdown("req", "Required / optional", groupOptions.req()) +
      dropdown("mode", "Group / individual", groupOptions.mode()) +
      '<span class="fbar-sep"></span>' +
      rangeMenu() +
      '<label class="fopt"><input type="checkbox" data-group="opt" value="hideDone"' + (prefs.hideDone ? " checked" : "") + "> Hide completed</label></div>";
  }
  $("#filters").addEventListener("change", (e) => {
    const t = e.target;
    if (!t.dataset.group) return;
    if (t.dataset.group === "opt") prefs[t.value] = t.checked;
    else if (t.dataset.group === "range") { prefs.range = t.value; openDD = null; }
    else if (t.checked) prefs[t.dataset.group].add(t.value); else prefs[t.dataset.group].delete(t.value);
    renderFilters(); render();
  });
  $("#filters").addEventListener("click", (e) => {
    const t = e.target;
    const btn = t.closest(".dd-btn");
    if (btn) { const g = btn.parentElement.dataset.dd; openDD = openDD === g ? null : g; renderFilters(); return; }
    const all = t.closest("[data-all]"), none = t.closest("[data-none]"), only = t.closest("[data-only]");
    if (all) prefs[all.dataset.all] = new Set(groupOptions[all.dataset.all]().map((o) => o.value));
    else if (none) prefs[none.dataset.none] = new Set();
    else if (only) { e.preventDefault(); prefs[only.dataset.only] = new Set([only.dataset.value]); }
    else return;
    renderFilters(); render();
  });
  // Close an open menu on outside click or Escape.
  document.addEventListener("click", (e) => {
    if (openDD && !e.target.closest(".dd")) { openDD = null; renderFilters(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openDD) { openDD = null; renderFilters(); }
  });
  $("#showAll").addEventListener("click", () => {
    prefs.kinds = new Set(defaults.kinds); prefs.req = new Set(defaults.req); prefs.mode = new Set(defaults.mode);
    prefs.courses = new Set(defaults.courses); prefs.hideDone = false; prefs.range = "all";
    query = ""; $("#search").value = "";
    renderFilters(); render();
  });
  $("#clearAll").addEventListener("click", () => {
    prefs.kinds.clear(); query = ""; $("#search").value = "";
    renderFilters(); render();
  });
  $("#search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });
  document.querySelectorAll(".views button").forEach((b) => b.addEventListener("click", () => { prefs.view = b.dataset.view; render(); }));

  // ---------- small render helpers ----------
  function typeTag(it) { return '<span class="tag t-' + it.kind + '">' + KINDS[it.kind].tag + "</span>"; }
  function reqTag(it) {
    if (!HAS_REQ.has(it.kind)) return "";
    return it.required === false ? '<span class="tag opt">Optional</span>' : '<span class="tag req">Required</span>';
  }
  function modeTag(it) {
    if (!HAS_MODE.has(it.kind)) return "";
    if (it.mode === "group") return '<span class="tag grp">Group</span>';
    if (it.mode === "individual") return '<span class="tag ind">Individual</span>';
    return '<span class="tag unk" title="Not yet specified in a loaded syllabus">TBD</span>';
  }
  function coursePill(id) { const c = courseInfo(id); return '<span class="pill" style="--c:' + c.color + '">' + esc(c.code) + "</span>"; }
  function linksHtml(it) {
    return (it.links || []).map((l) => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + " ↗</a>").join("");
  }
  function subline(it) {
    if (it.topics && it.topics.length) return it.topics.join(" · ");
    if (it.speaker && it.speaker.title) return it.speaker.title;
    const bits = [];
    if (it.endTime && it.time) bits.push(fmtRange(it.time, it.endTime));
    if (it.endDate) bits.push("through " + fmtDate(it.endDate));
    if (it.instructor) bits.push(it.instructor);
    if (it.location) bits.push(it.location);
    return bits.join(" · ");
  }

  // ---------- LIST VIEW ----------
  function periods() {
    // Each period runs from the day after one class weekend to the end of the next one.
    const wk = D.program.classWeekends;
    return wk.map((w, i) => ({ start: i ? iso(new Date(parseDate(wk[i - 1][1]).getTime() + 864e5)) : "0000-00-00", end: w[1], weekend: w }));
  }
  function renderList(list) {
    if (!list.length) return emptyMsg();
    const ps = periods();
    const groups = new Map();
    list.forEach((it) => {
      let key;
      if (!it.date) key = "tba";
      else {
        const p = ps.find((p) => it.date <= p.end);
        key = p ? p.end : "after";
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });
    let h = "";
    groups.forEach((arr, key) => {
      let title, sub = "", cur = false;
      if (key === "tba") { title = "Date to be announced"; sub = "Check Canvas for these due dates"; }
      else if (key === "after") { title = "After the last class weekend"; }
      else {
        const p = ps.find((x) => x.end === key);
        const startShown = p.start === "0000-00-00" ? arr[0].date : p.start;
        title = fmtDate(startShown) + " – " + fmtDate(p.end);
        sub = "Class weekend " + fmtDow(p.weekend[0]) + " " + fmtDate(p.weekend[0]) + " – " + fmtDow(p.weekend[1]) + " " + fmtDate(p.weekend[1]);
        cur = todayIso >= p.start && todayIso <= p.end;
        const dueCount = arr.filter((i) => KINDS[i.kind].due && !done.has(i.id)).length;
        if (dueCount) sub += " · " + dueCount + " deliverable" + (dueCount > 1 ? "s" : "") + " open";
      }
      h += '<section class="period' + (cur ? " current" : "") + '"><div class="period-head"><h2>' + esc(title) + "</h2><small>" + esc(sub) + "</small></div>";
      let todayDrawn = !cur;
      arr.forEach((it) => {
        if (!todayDrawn && it.date >= todayIso) { h += '<div class="today-line">Today · ' + fmtDate(todayIso) + "</div>"; todayDrawn = true; }
        h += rowHtml(it);
      });
      if (!todayDrawn) h += '<div class="today-line">Today · ' + fmtDate(todayIso) + "</div>";
      h += "</section>";
    });
    return h;
  }
  function rowHtml(it) {
    const k = KINDS[it.kind];
    const isDone = done.has(it.id);
    const chk = k.checkable ? '<input type="checkbox" class="chk" data-done="' + esc(it.id) + '"' + (isDone ? " checked" : "") + ' aria-label="Mark complete">' : "";
    const when = it.date
      ? "<b>" + fmtDow(it.date) + " " + fmtDate(it.date) + "</b><span>" + (fmtTime(it.time) || (it.endDate ? "→ " + fmtDate(it.endDate) : "")) + "</span>"
      : "<b>TBA</b>";
    const pts = k.due ? (it.points != null ? fmtPts(it.points) : "?") : "";
    return '<div class="row k-' + it.kind + (isDone ? " is-done" : "") + '" data-open="' + esc(it.id) + '">' +
      '<div class="chkcell">' + chk + "</div>" +
      '<div class="when">' + when + "</div>" +
      '<div class="coursecell">' + coursePill(it.course) + '<span class="metaflat">' + typeTag(it) + modeTag(it) + reqTag(it) + "</span></div>" +
      '<div class="typecell">' + typeTag(it) + "</div>" +
      '<div class="title"><div class="t">' + esc(it.title) + (it.verify ? ' <span class="verify" title="' + esc(it.verify) + '">⚠ verify</span>' : "") + "</div>" +
      (subline(it) ? '<div class="sub">' + esc(subline(it)) + "</div>" : "") +
      (it.links && it.links.length ? '<div class="links">' + linksHtml(it) + "</div>" : "") + "</div>" +
      '<div class="pts" title="Share of the course grade">' + pts + "</div>" +
      '<div class="modecell">' + modeTag(it) + "</div>" +
      '<div class="reqcell">' + reqTag(it) + "</div></div>";
  }
  function emptyMsg() {
    if (!prefs.kinds.size) return '<div class="empty"><b>Output cleared.</b><br>Turn on a category above, or press <b>Show all</b>.</div>';
    const where = { cycle: " between now and the end of the next class weekend", upcoming: " in the upcoming schedule" }[prefs.range] || "";
    return '<div class="empty">Nothing matches these filters' + where + "." +
      (prefs.range !== "all" ? " Choose a wider range under <b>Dates</b>." : "") + "</div>";
  }

  // ---------- CALENDAR VIEW ----------
  const weekendDays = new Set();
  D.program.classWeekends.forEach(([a, b]) => {
    for (let d = parseDate(a); iso(d) <= b; d = new Date(d.getTime() + 864e5)) weekendDays.add(iso(d));
  });
  // Entries per day; a course's readings + cases for one day collapse into one chip.
  function calendarEntries(list) {
    const byDay = new Map();
    const add = (day, e) => { if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push(e); };
    list.forEach((it) => {
      if (!it.date) return;
      if (it.kind === "reading" || it.kind === "case") {
        const key = "b|" + it.date + "|" + it.course;
        const day = byDay.get(it.date) || [];
        let b = day.find((e) => e.key === key);
        if (!b) { b = { key, bundle: true, course: it.course, date: it.date, time: it.time, items: [] }; add(it.date, b); }
        b.items.push(it);
        return;
      }
      if (it.endDate) {
        for (let d = parseDate(it.date); iso(d) <= it.endDate; d = new Date(d.getTime() + 864e5)) add(iso(d), { key: it.id, item: it });
      } else add(it.date, { key: it.id, item: it });
    });
    byDay.forEach((arr) => arr.sort((a, b) => {
      const ra = a.item && KINDS[a.item.kind].due ? 0 : 1, rb = b.item && KINDS[b.item.kind].due ? 0 : 1;
      return ra - rb || String((a.item || a).time || "99").localeCompare(String((b.item || b).time || "99"));
    }));
    return byDay;
  }
  function chipLabel(e) {
    if (e.bundle) {
      const n = e.items.length;
      if (n === 1) return e.items[0].kind === "case" ? e.items[0].title.replace(/^(SOM )?Case:\s*/, "") : "Reading";
      return n + " readings";
    }
    const it = e.item;
    if (it.kind === "colloquium") return "Colloquium";
    if (it.kind === "session") return (it.time ? shortTime(it.time) + " " : "") + it.title;
    return it.title.replace(/^Case write-up:\s*/, "").replace(/\s*\(.*\)$/, "");
  }
  function entryDone(e) { return e.bundle ? e.items.every((i) => done.has(i.id)) : done.has(e.item.id); }
  function renderCalendar(list) {
    const [y, m] = prefs.month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const start = new Date(y, m - 1, 1 - first.getDay());
    const byDay = calendarEntries(list);
    calIndex = new Map();
    let h = '<div class="cal-head"><h2>' + MONTH_LONG[m - 1] + " " + y + "</h2>" +
      '<button class="btn btn-ghost" data-month="-1" aria-label="Previous month">‹ Prev</button>' +
      '<button class="btn btn-ghost" data-month="0">Today</button>' +
      '<button class="btn btn-ghost" data-month="1" aria-label="Next month">Next ›</button>' +
      '<div class="cal-legend"><span><i style="background:var(--weekend);border:1px solid #c6d9ea"></i>Class weekend</span>' +
      '<span><i style="background:var(--yale-blue)"></i>Deliverable due</span>' +
      '<span><i style="background:#e6edf5;border-left:3px solid var(--yale-blue)"></i>Class / reading</span>' +
      "<span>Hover for a preview · click for details</span></div></div>";
    h += '<div class="cal">' + DOW.map((d) => '<div class="cal-dow">' + d + "</div>").join("");
    const MAX = 5;
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i === 35 && d.getMonth() !== m - 1) break;
      const di = iso(d);
      const cls = ["day"];
      if (d.getMonth() !== m - 1) cls.push("out");
      if (weekendDays.has(di)) cls.push("wknd");
      if (di === todayIso) cls.push("today");
      const entries = byDay.get(di) || [];
      h += '<div class="' + cls.join(" ") + '"><div class="dnum"><b>' + d.getDate() + "</b></div>";
      const shown = entries.length > MAX ? entries.slice(0, MAX - 1) : entries;
      shown.forEach((e) => {
        const ref = "c" + calIndex.size;
        calIndex.set(ref, e);
        const c = courseInfo(e.course || e.item.course);
        const isDue = !e.bundle && KINDS[e.item.kind].due;
        const label = chipLabel(e);
        h += '<button class="chip' + (isDue ? " due" : "") + (entryDone(e) ? " done" : "") + '" style="--c:' + c.color + '" data-chip="' + ref + '"' +
          ' aria-label="' + esc(c.code + " " + label) + '"><span class="cc">' + esc(courseNum(e.course || e.item.course)) + '</span><span class="ct">' + esc(label) + "</span></button>";
      });
      if (entries.length > MAX) {
        const ref = "d" + di;
        calIndex.set(ref, { day: di, entries });
        h += '<button class="chip more" data-chip="' + ref + '">+' + (entries.length - MAX + 1) + " more</button>";
      }
      h += "</div>";
    }
    return h + "</div>";
  }
  let calIndex = new Map();

  // ---------- BY-COURSE VIEW ----------
  function renderByCourse(list) {
    let h = "";
    // Courses with a loaded syllabus first; schedule-only courses after.
    const order = coursesWithItems.filter((id) => prefs.courses.has(id))
      .sort((a, b) => (courseById[a] ? 0 : 1) - (courseById[b] ? 0 : 1) || a.localeCompare(b));
    order.forEach((id) => {
      const c = courseById[id];
      const info = courseInfo(id);
      const mine = list.filter((i) => i.course === id);
      if (!mine.length && !c) return;
      const deliverables = items.filter((i) => i.course === id && KINDS[i.kind].checkable);
      const doneN = deliverables.filter((i) => done.has(i.id)).length;
      h += '<section class="course-card" style="--c:' + info.color + '"><div class="course-head"><div>' +
        "<h2><small>" + esc(info.code) + "</small>" + esc(info.name) + "</h2>" +
        (facultyFor(id).length && id !== "PROGRAM" ? '<div class="meta faculty">' + facultyHtml(facultyFor(id)) + "</div>" : "") +
        '<div class="meta">' + esc(c && c.term || "") +
        (c && c.canvas ? ' · <a href="' + esc(c.canvas) + '" target="_blank" rel="noopener">Canvas ↗</a>' : "") +
        (c && c.resources ? c.resources.map((r) => ' · <a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.label) + " ↗</a>").join("") : "") + "</div>" +
        (c && c.grading && c.grading.length ? '<div class="grading">' + c.grading.map((g) => "<span><b>" + g.weight + "%</b> " + esc(g.label) + "</span>").join("") + "</div>" : "") +
        (c && c.notes ? '<div class="meta" style="margin-top:6px">' + esc(c.notes) + "</div>" : "") +
        "</div>" +
        (deliverables.length ? '<div class="course-progress">' + doneN + " of " + deliverables.length + ' items complete<div class="bar"><i style="width:' + (100 * doneN / deliverables.length) + '%"></i></div></div>' : "") +
        "</div>";
      h += mine.length ? mine.map(rowHtml).join("") : '<div class="row" style="cursor:default"><div></div><div style="grid-column:2/-1;color:var(--ink-3)">No items match the current filters.</div></div>';
      h += "</section>";
    });
    return h || emptyMsg();
  }

  // ---------- details modal ----------
  function detailHtml(it) {
    const c = courseInfo(it.course);
    const k = KINDS[it.kind];
    const rows = [];
    rows.push(["Course", coursePill(it.course) + " " + esc(c.name)]);
    rows.push(["Type", typeTag(it)]);
    if (it.date) rows.push([k.due ? "Due" : "When", esc(fmtLongDate(it.date)) + (it.endDate ? " – " + esc(fmtLongDate(it.endDate)) : "") +
      (it.time ? "<br>" + esc(it.endTime ? fmtRange(it.time, it.endTime) : fmtTime(it.time)) + " ET" : "")]);
    else rows.push(["Due", "To be announced"]);
    if (k.due) rows.push(["Points", it.points != null ? "<b>" + fmtPts(it.points) + "</b> of the course grade" : "Not specified"]);
    if (HAS_MODE.has(it.kind)) rows.push(["Work", modeTag(it)]);
    if (HAS_REQ.has(it.kind)) rows.push(["Requirement", reqTag(it)]);
    if (it.kind === "reading" || it.kind === "case") rows.push(["Prepare by", "Start of class" + (it.time ? ", " + esc(fmtTime(it.time)) : "")]);
    const fac = it.faculty || facultyFor(it.course);
    if (fac.length && it.course !== "PROGRAM") rows.push([fac.length > 1 ? "Faculty" : "Professor", facultyHtml(fac)]);
    if (it.location) rows.push(["Location", esc(it.location)]);
    if (it.topics && it.topics.length) rows.push(["Topics", it.topics.map(esc).join("<br>")]);
    if (it.speaker) rows.push(["Speaker", esc(it.speaker.speaker) + (it.speaker.title ? '<br><span style="color:var(--ink-2)">' + esc(it.speaker.title) + "</span>" : "") +
      (it.speaker.url ? '<br><a href="' + esc(it.speaker.url) + '" target="_blank" rel="noopener">Speaker bio ↗</a>' : "")]);
    let h = '<div style="--c:' + c.color + '"><h3 id="modal-title">' + esc(it.title) + "</h3>";
    h += '<dl class="dl">' + rows.map((r) => "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>").join("") + "</dl>";
    if (it.notes) h += '<div class="note">' + esc(it.notes) + "</div>";
    if (it.verify) h += '<div class="note warn">⚠ ' + esc(it.verify) + "</div>";
    if (it.kind === "colloquium") h += '<div class="note">Attendance quiz is open 12:45–1:05 PM. Scan the QR code in the room or on Zoom.</div>';
    const cc = courseById[it.course];
    const links = (it.links || []).slice();
    if (cc && cc.canvas && !links.some((l) => l.url.startsWith(cc.canvas))) links.push({ label: "Course Canvas", url: cc.canvas });
    if (links.length) h += '<div class="links" style="margin-bottom:12px">' + linksHtml({ links }) + "</div>";
    if (k.checkable) {
      const on = done.has(it.id);
      h += '<label class="done-toggle' + (on ? " on" : "") + '"><input type="checkbox" class="chk" data-done="' + esc(it.id) + '"' + (on ? " checked" : "") + "> " +
        (on ? "Completed. Uncheck to mark it not done." : "Mark as complete") + "</label>";
    }
    return h + "</div>";
  }
  function bundleHtml(e) {
    const c = courseInfo(e.course);
    let h = '<div style="--c:' + c.color + '"><h3 id="modal-title">' + esc(c.code + " " + c.name) + ": prepare for " + esc(fmtDow(e.date) + " " + fmtDate(e.date)) + "</h3>";
    h += '<ul class="mini-list">' + e.items.map((it) => {
      const on = done.has(it.id);
      return '<li class="' + (on ? "is-done" : "") + '"><input type="checkbox" class="chk" data-done="' + esc(it.id) + '"' + (on ? " checked" : "") + ' aria-label="Mark complete">' +
        '<div><button class="linkish mt" data-open="' + esc(it.id) + '">' + esc(it.title) + "</button><div>" + typeTag(it) + " " + reqTag(it) +
        (it.time ? ' <span style="color:var(--ink-3);font-size:12px">before ' + esc(fmtTime(it.time)) + "</span>" : "") + "</div>" +
        (it.links ? '<div class="links">' + linksHtml(it) + "</div>" : "") + "</div></li>";
    }).join("") + "</ul></div>";
    return h;
  }
  function dayHtml(d) {
    let h = '<h3 id="modal-title">' + esc(fmtLongDate(d.day)) + '</h3><ul class="mini-list">';
    d.entries.forEach((e) => {
      const label = e.bundle ? e.items.length + (e.items.length > 1 ? " readings / cases" : " reading / case") : e.item.title;
      const ref = "m" + calIndex.size; calIndex.set(ref, e);
      h += '<li>' + coursePill(e.course || e.item.course) + '<div><button class="linkish mt" data-chip="' + ref + '">' + esc(label) + "</button>" +
        '<div style="color:var(--ink-3);font-size:12px">' + esc(e.bundle ? "" : fmtRange(e.item.time, e.item.endTime)) + "</div></div></li>";
    });
    return h + "</ul>";
  }
  let modalCtx = null;
  function openModal(ctx) {
    modalCtx = ctx;
    hideTip();
    let html, color;
    if (ctx.item) { html = detailHtml(ctx.item); color = courseInfo(ctx.item.course).color; }
    else if (ctx.bundle) { html = bundleHtml(ctx); color = courseInfo(ctx.course).color; }
    else { html = dayHtml(ctx); color = null; }
    $("#modal-body").innerHTML = html;
    $(".modal-card").style.setProperty("--c", color || "var(--yale-blue)");
    $("#modal").hidden = false;
    $(".modal-x").focus();
  }
  function closeModal() { $("#modal").hidden = true; modalCtx = null; }
  $("#modal").addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

  // ---------- hover tooltip (calendar) ----------
  const tip = $("#tooltip");
  function tipHtml(e) {
    if (e.day) return "<b>" + esc(fmtLongDate(e.day)) + '</b><div class="tl">' + e.entries.length + ' entries</div><div class="hint">Click to see all</div>';
    if (e.bundle) {
      const c = courseInfo(e.course);
      return "<b>" + esc(c.code) + " · prepare for class</b>" + e.items.map((i) => '<div class="tl">' + (done.has(i.id) ? "✓ " : "• ") + esc(i.title) + (i.required === false ? " (optional)" : "") + "</div>").join("") +
        '<div class="hint">Click for links and checkboxes</div>';
    }
    const it = e.item, c = courseInfo(it.course), k = KINDS[it.kind];
    const meta = [];
    if (it.time) meta.push(it.endTime ? fmtRange(it.time, it.endTime) : (k.due ? "Due " : "") + fmtTime(it.time));
    if (k.due && it.points != null) meta.push(fmtPts(it.points));
    if (HAS_MODE.has(it.kind)) meta.push(it.mode ? it.mode[0].toUpperCase() + it.mode.slice(1) : "Group/individual TBD");
    if (HAS_REQ.has(it.kind) && it.required === false) meta.push("Optional");
    if (done.has(it.id)) meta.push("✓ Done");
    return "<b>" + esc(it.title) + '</b><div class="tl">' + esc(c.code + " " + c.name) + "</div>" +
      (meta.length ? '<div class="tl">' + esc(meta.join(" · ")) + "</div>" : "") +
      (it.topics && it.topics.length ? '<div class="tl">' + esc(it.topics.join(" · ")) + "</div>" : "") +
      '<div class="hint">Click for full details</div>';
  }
  function showTip(el, e) {
    tip.innerHTML = tipHtml(e);
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = Math.min(r.left, window.innerWidth - tw - 8);
    let y = r.bottom + 6;
    if (y + th > window.innerHeight - 8) y = r.top - th - 6;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { tip.hidden = true; }
  const hoverCapable = window.matchMedia("(hover: hover)").matches;
  $("#view").addEventListener("mouseover", (ev) => {
    if (!hoverCapable) return;
    const el = ev.target.closest("[data-chip]");
    if (el && calIndex.has(el.dataset.chip)) showTip(el, calIndex.get(el.dataset.chip));
  });
  $("#view").addEventListener("mouseout", (ev) => { if (ev.target.closest("[data-chip]")) hideTip(); });
  $("#view").addEventListener("focusin", (ev) => {
    const el = ev.target.closest("[data-chip]");
    if (el && calIndex.has(el.dataset.chip)) showTip(el, calIndex.get(el.dataset.chip));
  });
  $("#view").addEventListener("focusout", hideTip);

  // ---------- clicks (shared) ----------
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t.matches("input[data-done]")) { setDone(t.dataset.done, t.checked); return; }
    if (t.closest("a, .dd, .fopt, input")) return;
    const m = t.closest("[data-month]");
    if (m) {
      const n = Number(m.dataset.month);
      if (!n) prefs.month = todayIso.slice(0, 7);
      else { const [y, mo] = prefs.month.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); prefs.month = iso(d).slice(0, 7); }
      render(); return;
    }
    const chip = t.closest("[data-chip]");
    if (chip && calIndex.has(chip.dataset.chip)) { openModal(calIndex.get(chip.dataset.chip)); return; }
    const op = t.closest("[data-open]");
    if (op && itemById[op.dataset.open]) openModal({ item: itemById[op.dataset.open] });
  });

  // ---------- ICS export ----------
  function icsEscape(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c); }
  function exportIcs() {
    const list = items.filter((it) => matches(it) && it.date);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EMBA C28 Planner//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:EMBA Planner"];
    list.forEach((it) => {
      const c = courseInfo(it.course);
      const d = it.date.replace(/-/g, "");
      lines.push("BEGIN:VEVENT", "UID:" + it.id + "@emba28-planner", "DTSTAMP:" + stamp);
      if (it.time) {
        const st = it.time.replace(":", "") + "00";
        const en = (it.endTime || it.time).replace(":", "") + "00";
        lines.push("DTSTART;TZID=America/New_York:" + d + "T" + st, "DTEND;TZID=America/New_York:" + d + "T" + en);
      } else {
        const end = iso(new Date(parseDate(it.endDate || it.date).getTime() + 864e5)).replace(/-/g, "");
        lines.push("DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + end);
      }
      const prefix = KINDS[it.kind].due ? "DUE: " : (it.kind === "reading" || it.kind === "case") ? "Read: " : "";
      lines.push("SUMMARY:" + icsEscape(courseNum(it.course) + " " + prefix + it.title));
      const desc = [c.code + " " + c.name, KINDS[it.kind].due && it.points != null ? "Points: " + fmtPts(it.points) : "",
        it.mode ? "Work: " + it.mode : "", it.notes || "", (it.links || []).map((l) => l.label + ": " + l.url).join("\n")].filter(Boolean).join("\n");
      lines.push("DESCRIPTION:" + icsEscape(desc));
      if (it.location) lines.push("LOCATION:" + icsEscape(it.location));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "emba-planner.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $("#exportIcs").addEventListener("click", exportIcs);

  // ---------- summary ----------
  function renderSummary() {
    const in14 = iso(new Date(Date.now() + 14 * 864e5));
    const dueSoon = items.filter((i) => KINDS[i.kind].due && i.date && i.date >= todayIso && i.date <= in14 && !done.has(i.id) && prefs.courses.has(i.course));
    const readSoon = items.filter((i) => (i.kind === "reading" || i.kind === "case") && i.required !== false && i.date && i.date >= todayIso && i.date <= in14 && !done.has(i.id) && prefs.courses.has(i.course));
    const next = items.find((i) => KINDS[i.kind].due && i.date && i.date >= todayIso && !done.has(i.id) && prefs.courses.has(i.course));
    const nextWk = D.program.classWeekends.find((w) => w[1] >= todayIso);
    $("#summary").innerHTML =
      '<div class="stat"><b>' + dueSoon.length + "</b><span>deliverables due in the next 14 days</span></div>" +
      '<div class="stat"><b>' + readSoon.length + "</b><span>required readings and cases in the next 14 days</span></div>" +
      '<div class="stat"><b>' + (next ? esc(fmtDow(next.date) + " " + fmtDate(next.date)) : "—") + "</b><span>" + (next ? "Next due: " + esc(courseNum(next.course) + " " + next.title) : "Nothing due") + "</span></div>" +
      '<div class="stat"><b>' + (nextWk ? esc(fmtDate(nextWk[0]) + " – " + fmtDate(nextWk[1])) : "—") + "</b><span>Next class weekend</span></div>";
  }

  // ---------- main render ----------
  function render() {
    persist();
    hideTip();
    document.querySelectorAll(".views button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === prefs.view)));
    renderSummary();
    let html;
    if (prefs.view === "calendar") {
      // The calendar always shows the full month; "Upcoming only" applies to the list views.
      html = renderCalendar(items.filter((it) => matches(it, { ignoreRange: true })));
    } else {
      const list = items.filter((it) => matches(it));
      html = prefs.view === "course" ? renderByCourse(list) : renderList(list);
    }
    $("#view").innerHTML = html;
    if (modalCtx && !$("#modal").hidden) {
      // Keep an open modal in sync after a checkbox toggle.
      const ctx = modalCtx.item ? { item: itemById[modalCtx.item.id] } : modalCtx;
      openModal(ctx);
    }
  }

  // Shared with assets/assistant.js (the chat panel).
  window.EMBA_APP = {
    items, itemById, courseById, courseInfo, courseNum, KINDS, todayIso, done, facultyFor, REG,
    fmtDate, fmtDow, fmtTime, fmtPts, parseDate, iso,
    openItem: (id) => { if (itemById[id]) openModal({ item: itemById[id] }); }
  };

  $("#updated").textContent = "Schedule data last updated " + fmtDate(D.program.updated) + ", " + D.program.updated.slice(0, 4) + ".";
  renderFilters();
  render();
})();
