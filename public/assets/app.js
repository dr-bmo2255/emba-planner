(async function () {
  "use strict";

  // A team invite link (?join=CODE) survives the sign-in screen.
  const joinParam = new URLSearchParams(location.search).get("join");
  try { if (joinParam) sessionStorage.setItem("emba28.join", joinParam); } catch (e) { /* storage blocked */ }
  let joinCode = joinParam;
  try { joinCode = joinCode || sessionStorage.getItem("emba28.join"); } catch (e) { /* storage blocked */ }

  // Checkmarks forwarded from the old GitHub Pages planner (#import=[...]) also survive sign-in.
  const importMatch = location.hash.match(/^#import=(.+)$/);
  if (importMatch) {
    try { sessionStorage.setItem("emba28.import", decodeURIComponent(importMatch[1])); } catch (e) { /* storage blocked */ }
    history.replaceState(null, "", location.pathname + location.search);
  }

  // Everything comes from the API for the signed-in student (see assets/data.js).
  let D;
  try {
    D = await window.loadPlannerData();
  } catch (e) {
    if (e.needsLogin) { window.showSignIn({ join: joinCode }); return; }
    console.error("[planner] couldn't load data", e);
    document.getElementById("view").innerHTML = '<div class="empty">Couldn\'t load the schedule. Check your connection and reload.</div>';
    return;
  }
  if (joinParam) history.replaceState(null, "", location.pathname);
  const ME = D.me.user;
  const REG = D.program.courseRegistry;
  const STORE_DONE = "emba28.done";               // checkmarks saved in this browser before accounts
  const STORE_PREFS = "emba28.prefs." + ME.id;

  const KINDS = {
    assignment: { label: "Assignments", tag: "Assignment", checkable: true, due: true },
    exam: { label: "Exams", tag: "Exam", checkable: true, due: true },
    case: { label: "Cases", tag: "Case", checkable: true },
    reading: { label: "Readings", tag: "Reading", checkable: true },
    session: { label: "Class sessions", tag: "Class" },
    colloquium: { label: "Colloquium", tag: "Colloquium" },
    office: { label: "Office hrs & reviews", tag: "Office hrs" },
    event: { label: "Program events", tag: "Event" },
    team: { label: "Team meetings", tag: "Team" }
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
  const courseNum = (id) => id === "PROGRAM" ? "EMBA" : id.startsWith("TEAM-") ? "👥" : id.replace("MGT", "");
  const fmtPts = (p) => p == null ? "" : (Math.round(p * 100) / 100) + "%";

  // ---------- build the unified item list ----------
  const courses = D.courses.slice().sort((a, b) => a.id.localeCompare(b.id));
  courses.forEach((c) => { REG[c.id] = Object.assign({}, REG[c.id] || {}, { code: c.code, name: c.name, color: (REG[c.id] || {}).color || "#00356b" }); });
  const courseById = Object.fromEntries(courses.map((c) => [c.id, c]));

  // The master schedule lists last names ("Baron/Adler/Kim"); expand them from courseRegistry.faculty.
  function facultyFor(courseId, lastNames) {
    const fac = (courseById[courseId] && courseById[courseId].faculty) || (REG[courseId] && REG[courseId].faculty) || [];
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
  let teams = D.teams || [];
  const itemById = {};
  const coursesWithItems = [];
  // (Re)builds team meeting items, the item index, and the course/team list. Called again after
  // any team change so the planner updates without a reload.
  function indexItems() {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === "team") items.splice(i, 1);
    Object.keys(REG).filter((k) => k.startsWith("TEAM-")).forEach((k) => delete REG[k]);
    teams.forEach((t) => { REG[PlannerTeams.teamKey(t)] = { code: t.name, name: "Team meetings", color: t.color, team: true }; });
    PlannerTeams.items(teams).forEach((it) => items.push(it));
    items.forEach((it) => { it.sortKey = (it.date || "9999-99-99") + " " + (it.time || "99:99") + " " + (KINDS[it.kind].due ? "0" : "1"); });
    items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    Object.keys(itemById).forEach((k) => delete itemById[k]);
    items.forEach((i) => { itemById[i.id] = i; });
    coursesWithItems.length = 0;
    Object.keys(REG).filter((id) => REG[id].team || items.some((i) => i.course === id)).forEach((id) => coursesWithItems.push(id));
  }
  indexItems();

  // ---------- state ----------
  const done = new Set(D.me.done);
  const notes = Object.assign({}, D.me.notes || {});   // itemId -> this student's private note
  let forwarded = [];
  try { forwarded = JSON.parse(sessionStorage.getItem("emba28.import") || "[]"); } catch (e) { forwarded = []; }
  const legacy = [...new Set(load(STORE_DONE, []).concat(Array.isArray(forwarded) ? forwarded.filter((x) => typeof x === "string") : []))];
  if (legacy.length) {
    // Checkmarks made in this browser before accounts existed: move them into the account once.
    api("POST", "/api/me/done/import", { ids: legacy }).then(() => {
      legacy.forEach((id) => done.add(id));
      try { localStorage.removeItem(STORE_DONE); sessionStorage.removeItem("emba28.import"); } catch (e) { /* storage blocked */ }
      render();
      if (forwarded.length) toast("Brought over " + forwarded.length + " checkmark" + (forwarded.length === 1 ? "" : "s") + " from the old planner.");
    }).catch(() => {});
  }
  let myCourses = D.me.myCourses;   // null = all courses
  const defaultCourses = () => coursesWithItems.filter((id) => !myCourses || id === "PROGRAM" || id.startsWith("TEAM-") || myCourses.includes(id));
  const defaults = {
    view: "list",
    kinds: Object.keys(KINDS),
    req: ["required", "optional"],
    mode: ["individual", "group", "unspecified"],
    courses: defaultCourses(),
    range: "cycle",
    hideDone: false,
    month: todayIso.slice(0, 7)
  };
  const prefs = Object.assign({}, defaults, load(STORE_PREFS, {}));
  ["kinds", "req", "mode", "courses"].forEach((k) => { prefs[k] = new Set(prefs[k]); });
  // A course added after the user last visited should show up, not stay hidden.
  const seen = new Set(load(STORE_PREFS, {}).knownCourses || []);
  coursesWithItems.forEach((id) => { if (!seen.has(id) && defaultCourses().includes(id)) prefs.courses.add(id); });
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
      compact: prefs.compact, knownCourses: coursesWithItems
    });
  }
  function setDone(id, on) {
    if (on) done.add(id); else done.delete(id);
    render();
    api("PUT", "/api/me/done", { itemId: id, done: on }).catch((e) => {
      // Couldn't save (offline?): put it back and say so.
      if (on) done.delete(id); else done.add(id);
      render();
      toast(e.needsLogin ? "You've been signed out. Reload to sign in again." : "Couldn't save that checkmark. Check your connection.");
    });
  }
  function toast(text) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 4000);
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
  // One line saying what the collapsed bar is hiding, e.g. "5 of 7 courses · Through Nov 8 · Hide completed".
  function filterSummary() {
    const parts = [];
    const n = (g) => groupOptions[g]().filter((o) => prefs[g].has(o.value)).length, tot = (g) => groupOptions[g]().length;
    parts.push(n("courses") === tot("courses") ? "All courses" : n("courses") + " of " + tot("courses") + " courses");
    if (n("kinds") < tot("kinds")) parts.push(n("kinds") + " of " + tot("kinds") + " types");
    if (n("req") < tot("req")) parts.push(prefs.req.has("required") ? "Required only" : prefs.req.has("optional") ? "Optional only" : "No required/optional");
    if (n("mode") < tot("mode")) parts.push([...prefs.mode].map((m) => m === "unspecified" ? "unspecified" : m).join(" + ") || "No group/individual");
    parts.push((RANGES.find((r) => r.value === prefs.range) || RANGES[0]).short);
    if (prefs.hideDone) parts.push("Hide completed");
    return parts.join(" · ");
  }
  function renderFilters() {
    document.body.classList.toggle("compact", !!prefs.compact);
    if (prefs.compact) {
      $("#filters").innerHTML = '<button type="button" class="fbar-thin" data-compact="0" aria-expanded="false" title="Show the filters and tools">' +
        '<span class="fbar-thin-label">Filters</span><span class="fbar-thin-sum">' + esc(filterSummary()) + '</span><span class="fbar-thin-caret">▾ Show</span></button>';
      return;
    }
    $("#filters").innerHTML = '<div class="fbar">' +
      dropdown("courses", "Courses", groupOptions.courses()) +
      dropdown("kinds", "Show", groupOptions.kinds()) +
      dropdown("req", "Required / optional", groupOptions.req()) +
      dropdown("mode", "Group / individual", groupOptions.mode()) +
      '<span class="fbar-sep"></span>' +
      rangeMenu() +
      '<label class="fopt"><input type="checkbox" data-group="opt" value="hideDone"' + (prefs.hideDone ? " checked" : "") + "> Hide completed</label>" +
      '<button type="button" class="fbar-collapse" data-compact="1" aria-expanded="true" title="Fold the filters and tools into a thin bar">▴ Collapse</button></div>';
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
    const fold = t.closest("[data-compact]");
    if (fold) { prefs.compact = fold.dataset.compact === "1"; openDD = null; persist(); renderFilters(); return; }
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
    return '<span class="tag unk" title="Group or individual not decided yet">TBD</span>';
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
      '<div class="title"><div class="t">' + esc(it.title) + (it.verify ? ' <span class="verify" title="' + esc(it.verify) + '">⚠ verify</span>' : "") +
      (notes[it.id] ? ' <span class="has-note" title="You have a note on this">📝</span>' : "") + "</div>" +
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
    if (it.kind === "session" || it.kind === "team") return (it.time ? shortTime(it.time) + " " : "") + it.title;
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
      (phone ? "" : "<span>Hover for a preview · click for details</span>") + "</div></div>";
    h += '<div class="cal' + (phone ? " cal-phone" : "") + '">' + DOW.map((d) => '<div class="cal-dow">' + (phone ? d[0] : d) + "</div>").join("");
    const MAX = 5;
    // Phones: each day shows colored dots; tapping a day lists its entries under the grid.
    const inMonth = (di) => di.slice(0, 7) === prefs.month;
    if (phone && (!calDay || !inMonth(calDay))) {
      calDay = inMonth(todayIso) ? todayIso : ([...byDay.keys()].filter(inMonth).sort()[0] || prefs.month + "-01");
    }
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i === 35 && d.getMonth() !== m - 1) break;
      const di = iso(d);
      const cls = ["day"];
      if (d.getMonth() !== m - 1) cls.push("out");
      if (weekendDays.has(di)) cls.push("wknd");
      if (di === todayIso) cls.push("today");
      const entries = byDay.get(di) || [];
      if (phone) {
        if (di === calDay) cls.push("sel");
        const dots = entries.slice(0, 4).map((e) => {
          const c = courseInfo(e.course || e.item.course);
          const due = !e.bundle && KINDS[e.item.kind].due;
          return '<i class="pdot' + (due ? " due" : "") + (entryDone(e) ? " done" : "") + '" style="--c:' + c.color + '"></i>';
        }).join("");
        h += '<button class="' + cls.join(" ") + '" data-calday="' + di + '" aria-label="' + esc(fmtLongDate(di) + ", " + entries.length + " entries") + '">' +
          '<span class="dnum"><b>' + d.getDate() + '</b></span><span class="pdots">' + dots + (entries.length > 4 ? '<i class="pmore">+</i>' : "") + "</span></button>";
        continue;
      }
      h += '<div class="' + cls.join(" ") + '"><div class="dnum"><b>' + d.getDate() + "</b></div>";
      const shown = entries.length > MAX ? entries.slice(0, MAX - 1) : entries;
      shown.forEach((e) => {
        const ref = "c" + calIndex.size;
        calIndex.set(ref, e);
        const c = courseInfo(e.course || e.item.course);
        const isDue = !e.bundle && KINDS[e.item.kind].due;
        const label = chipLabel(e);
        h += '<button class="chip' + (isDue ? " due" : "") + (entryDone(e) ? " done" : "") + '" style="--c:' + c.color + '" data-chip="' + ref + '"' +
          ' aria-label="' + esc(c.code + " " + label) + '"><span class="cc">' + esc(courseNum(e.course || e.item.course)) + '</span><span class="ct">' + esc(label) + "</span>" +
          ((e.bundle ? e.items.some((i) => notes[i.id]) : notes[e.item.id]) ? '<span class="cn" title="You have a note">📝</span>' : "") + "</button>";
      });
      if (entries.length > MAX) {
        const ref = "d" + di;
        calIndex.set(ref, { day: di, entries });
        h += '<button class="chip more" data-chip="' + ref + '">+' + (entries.length - MAX + 1) + " more</button>";
      }
      h += "</div>";
    }
    h += "</div>";
    if (phone) {
      const entries = byDay.get(calDay) || [];
      h += '<section class="agenda"><h3>' + esc(fmtLongDate(calDay)) + (weekendDays.has(calDay) ? ' <span class="tag">Class weekend</span>' : "") + "</h3>";
      h += entries.length ? entries.map((e) => {
        const ref = "c" + calIndex.size;
        calIndex.set(ref, e);
        const c = courseInfo(e.course || e.item.course);
        const isDue = !e.bundle && KINDS[e.item.kind].due;
        const when = e.bundle ? (e.time ? "before " + fmtTime(e.time) : "") : (e.item.time ? (e.item.endTime ? fmtTime(e.item.time) + "–" + fmtTime(e.item.endTime) : fmtTime(e.item.time)) : "");
        const sub = e.bundle ? e.items.map((i) => i.title).join(" · ") : [isDue && e.item.points != null ? fmtPts(e.item.points) : "", isDue && e.item.mode ? e.item.mode : ""].filter(Boolean).join(" · ");
        return '<button class="agenda-item' + (isDue ? " due" : "") + (entryDone(e) ? " done" : "") + '" style="--c:' + c.color + '" data-chip="' + ref + '">' +
          '<span class="ag-time">' + esc(when) + '</span><span class="ag-main"><b>' + esc(courseNum(e.course || e.item.course) + " · " + (e.bundle ? (e.items.length > 1 ? e.items.length + " readings / cases" : e.items[0].title) : e.item.title)) + "</b>" +
          (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></button>";
      }).join("") : '<p class="muted-p">Nothing scheduled.</p>';
      h += "</section>";
    }
    return h;
  }
  let calIndex = new Map();
  let calDay = null;
  const phoneQuery = window.matchMedia("(max-width: 600px)");
  let phone = phoneQuery.matches;
  phoneQuery.addEventListener("change", (e) => { phone = e.matches; if (prefs.view === "calendar") render(); });

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
  // Private per-student notes on any entry (autosaved; see the "input" listener below).
  function myNotesHtml(it) {
    return '<div class="my-notes"><label for="myNote">📝 My notes <small>only you can see these</small></label>' +
      '<textarea id="myNote" data-note="' + esc(it.id) + '" maxlength="2000" rows="3" placeholder="Jot anything: who\'s doing which part, questions for the TA, page numbers…">' + esc(notes[it.id] || "") + "</textarea>" +
      '<span class="note-status" aria-live="polite"></span></div>';
  }

  // Maintainer: edit an imported item in place (saved for everyone, undoable in Manage courses).
  const unresolved = (it) => (HAS_MODE.has(it.kind) && !it.mode) || (KINDS[it.kind].due && it.points == null) || !!it.verify || !it.date;
  function adminEditHtml(it) {
    if (ME.role !== "admin" || !courseById[it.course] || !it.type) return "";
    const k = KINDS[it.kind];
    const opt = (v, label, cur) => '<option value="' + v + '"' + (cur === v ? " selected" : "") + ">" + label + "</option>";
    let f = '<details class="admin-edit"' + (unresolved(it) ? " open" : "") + '><summary>✏️ Edit for everyone <small>(admin)</small>' +
      (unresolved(it) ? ' <span class="tag unk">needs a decision</span>' : "") + "</summary>" +
      '<form class="meet-form" data-item-edit="' + esc(it.id) + '">' +
      '<label>Title<input name="title" maxlength="200" value="' + esc(it.title) + '" required></label>';
    if (HAS_MODE.has(it.kind)) f += '<label>Group or individual<select name="mode">' + opt("", "Not yet specified", it.mode || "") + opt("individual", "Individual", it.mode || "") + opt("group", "Group", it.mode || "") + "</select></label>";
    if (k.due) f += '<label>Points <small>(% of the course grade; blank = not specified)</small><input name="points" type="number" min="0" max="100" step="0.01" value="' + (it.points != null ? it.points : "") + '"></label>';
    if (HAS_REQ.has(it.kind)) f += '<label>Requirement<select name="required">' + opt("true", "Required", String(it.required !== false)) + opt("false", "Optional", String(it.required !== false)) + "</select></label>";
    f += '<div class="grid2f"><label>Date <small>(blank = TBA)</small><input type="date" name="date" value="' + esc(it.date || "") + '"></label>' +
      '<label>Time <small>(ET)</small><input type="time" name="time" value="' + esc(it.time || "") + '"></label></div>' +
      '<label>Note for everyone<textarea name="notes" rows="2" maxlength="1000">' + esc(it.notes || "") + "</textarea></label>";
    if (it.verify) f += '<label class="confirm-row"><input type="checkbox" name="confirmed"> Confirmed: remove the ⚠ "' + esc(it.verify) + '" flag</label>';
    else f += '<label>⚠ Flag for checking later <small>(optional)</small><input name="verify" maxlength="500" placeholder="e.g. Waiting for the professor to say group or individual"></label>';
    f += '<div class="pv-actions"><button class="btn" type="submit">Save for everyone</button><span class="form-msg"></span></div></form></details>';
    return f;
  }
  function readItemEdit(f, it) {
    const changes = {};
    const val = (n) => f.elements[n] ? f.elements[n].value : undefined;
    const put = (k, v) => { if (v !== undefined && v !== (it[k] == null ? null : it[k])) changes[k] = v; };
    put("title", val("title").trim());
    if (f.elements.mode) put("mode", val("mode") || null);
    if (f.elements.points) put("points", val("points") === "" ? null : Number(val("points")));
    if (f.elements.required) put("required", val("required") === "true");
    put("date", val("date") || null);
    put("time", val("time") || null);
    put("notes", val("notes").trim() || null);
    if (f.elements.confirmed && f.elements.confirmed.checked) changes.verify = null;
    if (f.elements.verify && val("verify").trim()) changes.verify = val("verify").trim();
    return changes;
  }

  function teamDetailHtml(it) {
    const t = teams.find((x) => x.id === it.teamId) || {};
    const m = (t.meetings || []).find((x) => x.id === it.meetingId) || {};
    const rows = [["Team", '<span class="pill" style="--c:' + esc(t.color) + '">' + esc(t.name) + "</span>"],
      ["When", esc(fmtLongDate(it.date)) + "<br>" + esc(fmtRange(it.time, it.endTime)) + " ET"]];
    if (it.location) rows.push(["Where", PlannerTeams.locationHtml(it.location)]);
    if (it.weekly) rows.push(["Repeats", esc(PlannerTeams.seriesText(m, TA))]);
    let h = '<div style="--c:' + esc(t.color) + '"><h3 id="modal-title">' + esc(it.title) + "</h3>";
    h += '<dl class="dl">' + rows.map((r) => "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>").join("") + "</dl>";
    if (it.notes) h += '<div class="note">' + esc(it.notes) + "</div>";
    h += myNotesHtml(it);
    h += '<div class="pv-actions">' + (it.weekly ? '<button class="btn btn-ghost" data-skip="' + it.meetingId + ":" + it.date + '">Skip just this date</button>' : "") +
      '<button class="btn btn-ghost" data-meet-edit="' + it.meetingId + '">Edit meeting</button>' +
      '<button class="btn btn-ghost" data-goto-teams>Open Teams</button></div>';
    return h + "</div>";
  }
  function detailHtml(it) {
    if (it.kind === "team") return teamDetailHtml(it);
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
    h += myNotesHtml(it);
    h += adminEditHtml(it);
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
    if (ctx.html) { html = ctx.html; color = ctx.color; }
    else if (ctx.item) { html = detailHtml(ctx.item); color = courseInfo(ctx.item.course).color; }
    else if (ctx.bundle) { html = bundleHtml(ctx); color = courseInfo(ctx.course).color; }
    else { html = dayHtml(ctx); color = null; }
    $("#modal-body").innerHTML = html;
    $(".modal-card").style.setProperty("--c", color || "var(--yale-blue)");
    $("#modal").hidden = false;
    $(".modal-x").focus();
  }
  let returnTo = null; // item id when the maintainer came from the admin checklist
  const backToAdmin = () => { location.href = "admin.html?back=" + encodeURIComponent(returnTo) + "#openQsCard"; };
  function closeModal() {
    if (returnTo && !$("#modal").hidden) return backToAdmin();
    const wasOpen = !$("#modal").hidden; $("#modal").hidden = true; modalCtx = null; if (wasOpen) render();
  }
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
    const dayBtn = t.closest("[data-calday]");
    if (dayBtn) { calDay = dayBtn.dataset.calday; render(); return; }
    const chip = t.closest("[data-chip]");
    if (chip && calIndex.has(chip.dataset.chip)) { openModal(calIndex.get(chip.dataset.chip)); return; }
    const op = t.closest("[data-open]");
    if (op && itemById[op.dataset.open]) openModal({ item: itemById[op.dataset.open] });
  });

  // ---------- Add to calendar: private per-student feed links (/cal/<token>/...) ----------
  const feedBase = () => location.origin + "/cal/" + ME.calToken;
  const FEED = { get courses() { return feedBase() + "/courses.ics"; } };
  function feedQuery(scope) {
    if (scope !== "mine") return "";
    const q = new URLSearchParams();
    const courseIds = coursesWithItems.filter((id) => !id.startsWith("TEAM-"));
    const shown = [...prefs.courses].filter((id) => !id.startsWith("TEAM-"));
    if (shown.length !== courseIds.length) q.set("courses", shown.join(","));
    const kinds = [...prefs.kinds].filter((k) => k !== "team");
    if (kinds.length !== Object.keys(KINDS).length - 1) q.set("types", kinds.join(","));
    if (prefs.req.size < 2) q.set("req", [...prefs.req].join(","));
    if (prefs.mode.size < 3) q.set("mode", [...prefs.mode].join(","));
    const qs = q.toString();
    return qs ? "?" + qs : "";
  }
  function subLinks(url, label) {
    const webcal = url.replace(/^https?:/, "webcal:");
    const name = encodeURIComponent(label);
    return '<a class="sub-btn" href="' + esc(webcal) + '" title="Apple Calendar (iPhone, iPad, Mac)">Apple</a>' +
      '<a class="sub-btn" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcal) + '" title="Google Calendar">Google</a>' +
      '<a class="sub-btn" target="_blank" rel="noopener" href="https://outlook.office.com/calendar/0/addfromweb?url=' + encodeURIComponent(url) + "&name=" + name + '" title="Outlook (Microsoft 365)">Outlook</a>' +
      '<button class="sub-btn" data-copy="' + esc(url) + '" title="Copy the feed address">Copy link</button>';
  }
  function subRow(id, label, sub, url) {
    return '<div class="sub-row" style="--c:' + courseInfo(id).color + '"><i class="dd-swatch"></i>' +
      '<div class="sub-name"><b>' + esc(label) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>" +
      '<div class="sub-btns">' + subLinks(url, label) + "</div></div>";
  }
  function calendarHtml(scope) {
    const all = coursesWithItems.filter((id) => id !== "PROGRAM" && !id.startsWith("TEAM-"))
      .sort((a, b) => (courseById[a] ? 0 : 1) - (courseById[b] ? 0 : 1) || a.localeCompare(b));
    const mine = all.filter((id) => myCourses ? myCourses.includes(id) : !!courseById[id]);
    const others = all.filter((id) => !mine.includes(id));
    const courseRow = (id) => subRow(id, courseNum(id) + " " + courseInfo(id).name,
      courseById[id] ? "Classes, deadlines, readings" : "Class times only (syllabus not loaded yet)", FEED.courses + "?courses=" + id);
    const filtered = feedQuery("mine") !== "";
    const combined = FEED.courses + feedQuery(scope);
    return '<div class="cal-modal"><h3 id="modal-title">Add to your calendar</h3>' +
      '<p class="muted-p">Subscribe to each course and team separately. Each shows up as its own calendar you can color, hide, or remove, and it updates automatically. These links are personal; don\'t share them.</p>' +
      "<h4>" + (myCourses ? "My courses" : "Courses") + ' <button class="linkish" data-acct="courses">Choose my courses</button></h4>' +
      '<div class="sub-list">' + mine.map(courseRow).join("") +
      subRow("PROGRAM", "Class weekends & program events", "Every class weekend, residence weeks, Global Network Week, Commencement", FEED.courses + "?courses=PROGRAM") + "</div>" +
      (others.length ? '<details class="combined"><summary>Other courses (' + others.length + ")</summary><div class=\"sub-list\">" + others.map(courseRow).join("") + "</div></details>" : "") +
      '<h4 id="calTeams">My teams</h4>' +
      (teams.length ? '<div class="sub-list">' + teams.map((t) => subRow(PlannerTeams.teamKey(t), t.name, "Team meetings (members only)", feedBase() + "/team/" + t.id + ".ics")).join("") + "</div>"
        : '<p class="muted-p">Join or create a team under <b>Teams</b> to subscribe to its meetings.</p>') +
      '<details class="combined"><summary>Prefer one combined course calendar?</summary>' +
      '<div class="seg" role="radiogroup" aria-label="What to include">' +
      '<label><input type="radio" name="calscope" value="all"' + (scope !== "mine" ? " checked" : "") + "> Everything</label>" +
      '<label><input type="radio" name="calscope" value="mine"' + (scope === "mine" ? " checked" : "") + (filtered ? "" : " disabled") + "> Only what I'm showing" + (filtered ? "" : " (no filters set)") + "</label></div>" +
      '<div class="sub-btns">' + subLinks(combined, "EMBA C28 Planner") + "</div>" +
      '<p class="muted-p"><a href="' + esc(combined + (combined.includes("?") ? "&" : "?") + "download=1") + '">Download a one-time .ics file</a> (won\'t update).</p></details>' +
      '<p class="muted-p">Calendar apps check for changes on their own schedule: Apple every few hours, Google about once a day. Your checkmarks stay in the planner. If a link ever leaks, reset your links from the account menu.</p></div>';
  }
  $("#addToCal").addEventListener("click", () => openModal({ html: calendarHtml("all"), color: "var(--yale-blue)" }));
  $("#modal").addEventListener("change", (e) => {
    if (e.target.name === "calscope") {
      openModal({ html: calendarHtml(e.target.value), color: "var(--yale-blue)" });
      document.querySelectorAll("#modal details.combined").forEach((d) => { if (d.querySelector("[name=calscope]")) d.open = true; });
    }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const v = b.dataset.copy;
    const fallback = () => { const t = document.createElement("textarea"); t.value = v; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); };
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).catch(fallback);
    b.textContent = "Copied ✓";
  });

  // ---------- Install as an app ----------
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; $("#installApp").hidden = standalone; });
  if (isIOS && !standalone) $("#installApp").hidden = false;
  $("#installApp").addEventListener("click", async () => {
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("#installApp").hidden = true; return; }
    openModal({ color: "var(--yale-blue)", html: '<h3 id="modal-title">Put the planner on your home screen</h3>' +
      '<ol class="install-steps"><li>Open this page in <b>Safari</b> (not inside another app).</li>' +
      '<li>Tap the <b>Share</b> button <span class="ios-share" aria-hidden="true">⬆︎</span> at the bottom (or top right on iPad).</li>' +
      '<li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>' +
      '<p class="muted-p">It opens full-screen like an app, keeps your checkmarks, and still works with a weak connection.</p>' });
  });


  function renderSummary() {
    // Counts cover the current class cycle: from the Sunday after the last class weekend through
    // the end of the next one, so overdue items in this cycle still count as "left".
    const inCycle = (i) => i.date && cycle && i.date >= cycle.start && i.date <= cycle.end && prefs.courses.has(i.course);
    const dueAll = items.filter((i) => KINDS[i.kind].due && i.required !== false && inCycle(i));
    const dueLeft = dueAll.filter((i) => !done.has(i.id));
    const readAll = items.filter((i) => (i.kind === "reading" || i.kind === "case") && i.required !== false && inCycle(i));
    const readLeft = readAll.filter((i) => !done.has(i.id));
    const next = items.find((i) => KINDS[i.kind].due && i.date && i.date >= todayIso && !done.has(i.id) && prefs.courses.has(i.course));
    const wk = cycle ? fmtDate(cycle.weekend[0]) + " – " + fmtDate(cycle.weekend[1]) : "";
    const bar = (left, all) => all ? '<i class="stat-bar"><i style="width:' + Math.round(100 * (all - left) / all) + '%"></i></i>' : "";
    $("#summary").innerHTML =
      '<div class="stat"><b>' + dueLeft.length + ' <small>left</small></b><span>of ' + dueAll.length + " deliverable" + (dueAll.length === 1 ? "" : "s") + " due before the " + esc(wk) + " class weekend</span>" + bar(dueLeft.length, dueAll.length) + "</div>" +
      '<div class="stat"><b>' + readLeft.length + ' <small>left</small></b><span>of ' + readAll.length + " required reading" + (readAll.length === 1 ? "" : "s") + " and cases before that weekend</span>" + bar(readLeft.length, readAll.length) + "</div>" +
      '<div class="stat"><b>' + (next ? esc(fmtDow(next.date) + " " + fmtDate(next.date)) : "—") + "</b><span>" + (next ? "Next due: " + esc(courseNum(next.course) + " " + next.title) : "Nothing due") + "</span></div>" +
      '<div class="stat"><b>' + (wk || "—") + "</b><span>Next class weekend</span></div>";
  }


  // ---------- Teams ----------
  let pendingJoin = null;
  const TA = {
    teams: () => teams, todayIso, fmtDate, fmtDow, fmtTime,
    cycleEnd: () => cycle && cycle.end, pendingJoin: () => pendingJoin
  };
  async function reloadTeams() {
    const before = new Set(coursesWithItems);
    teams = (await api("GET", "/api/teams")).teams;
    indexItems();
    coursesWithItems.forEach((id) => { if (!before.has(id)) prefs.courses.add(id); }); // show new teams
    renderFilters();
    render();
  }
  const findTeam = (id) => teams.find((t) => t.id === id);
  const findMeeting = (id) => { for (const t of teams) { const m = t.meetings.find((x) => x.id === id); if (m) return { t, m }; } return {}; };
  function clearJoin() {
    pendingJoin = null; joinCode = null;
    try { sessionStorage.removeItem("emba28.join"); } catch (e) { /* storage blocked */ }
  }
  if (joinCode) {
    api("GET", "/api/join/" + encodeURIComponent(joinCode)).then((r) => {
      pendingJoin = r; prefs.view = "teams"; render();
    }).catch((e) => { clearJoin(); toast(e.message); });
  }
  async function act(fn, okMsg) {
    try { await fn(); await reloadTeams(); if (okMsg) toast(okMsg); return true; } catch (e) { toast(e.message); return false; }
  }

  document.addEventListener("click", async (e) => {
    const t = e.target;
    const d = (sel) => { const el = t.closest("[" + sel + "]"); return el && el.getAttribute(sel); };
    let v;
    if (t.closest("[data-goto-teams]")) { closeModal(); prefs.view = "teams"; render(); return; }
    if (t.closest("[data-team-new]")) {
      openModal({ color: "var(--yale-blue)", html: '<h3 id="modal-title">Create a team</h3><form data-team-create class="meet-form">' +
        '<label>Team name<input name="name" maxlength="60" placeholder="e.g. Learning Team 7A" required></label>' +
        '<div class="swatches">' + PlannerTeams.COLORS.map((c, i) => '<label><input type="radio" name="color" value="' + c + '"' + (i === 0 ? " checked" : "") + '><i style="background:' + c + '"></i></label>').join("") + "</div>" +
        '<div class="pv-actions"><button class="btn" type="submit">Create team</button><span class="form-msg"></span></div></form>' });
      return;
    }
    if (t.closest("[data-join-accept]")) {
      const name = pendingJoin.team.name;
      if (await act(() => api("POST", "/api/join/" + encodeURIComponent(joinCode)), "You joined " + name + ".")) clearJoin();
      render();
      return;
    }
    if (t.closest("[data-join-dismiss]")) { clearJoin(); render(); return; }
    if ((v = d("data-meet-new"))) { openModal({ color: findTeam(v).color, html: PlannerTeams.meetingForm(TA, findTeam(v)) }); return; }
    if ((v = d("data-meet-edit"))) { const f = findMeeting(v); if (f.m) openModal({ color: f.t.color, html: PlannerTeams.meetingForm(TA, f.t, f.m) }); return; }
    if ((v = d("data-meet-del"))) {
      if (confirm("Delete this meeting" + (findMeeting(v).m && findMeeting(v).m.kind === "weekly" ? " and all its repeats" : "") + "?")) await act(() => api("DELETE", "/api/meetings/" + v), "Meeting deleted.");
      return;
    }
    if ((v = d("data-skip"))) {
      const [mid, date] = v.split(":");
      closeModal();
      await act(() => api("POST", "/api/meetings/" + mid + "/skip", { date, skip: true }), "Skipped " + fmtDate(date) + ". You can restore it on the Teams tab.");
      return;
    }
    if ((v = d("data-unskip"))) {
      const [mid, date] = v.split(":");
      await act(() => api("POST", "/api/meetings/" + mid + "/skip", { date, skip: false }), "Restored " + fmtDate(date) + ".");
      closeModal();
      return;
    }
    if ((v = d("data-member-del"))) {
      const [tid, uid] = v.split(":");
      const who = findTeam(tid).members.find((m) => String(m.id) === uid);
      if (confirm("Remove " + who.name + " from " + findTeam(tid).name + "?\n\nThe team gets a new invite link so the old one can't be used to rejoin. Current members aren't affected.")) {
        await act(() => api("DELETE", "/api/teams/" + tid + "/members/" + uid), "Removed " + who.name + ". The team has a new invite link.");
      }
      return;
    }
    if ((v = d("data-team-leave"))) {
      if (confirm("Leave " + findTeam(v).name + "? You'll need a new invite link to rejoin.")) await act(() => api("DELETE", "/api/teams/" + v + "/members/" + ME.id), "You left the team.");
      return;
    }
    if ((v = d("data-team-del"))) {
      if (confirm("Delete " + findTeam(v).name + " and all its meetings for everyone? This can't be undone.")) await act(() => api("DELETE", "/api/teams/" + v), "Team deleted.");
      return;
    }
    if ((v = d("data-invite"))) {
      const [tid, what] = v.split(":");
      if (what === "off" && !confirm("Turn off the invite link? Nobody new can join until you make a new one.")) return;
      await act(() => api("PATCH", "/api/teams/" + tid, { invite: what }), what === "off" ? "Invite link turned off." : "New invite link ready. The old one no longer works.");
      return;
    }
    if ((v = d("data-team-rename"))) {
      const name = prompt("New team name", findTeam(v).name);
      if (name && name.trim()) await act(() => api("PATCH", "/api/teams/" + v, { name }), "Renamed.");
      return;
    }
    if ((v = d("data-team-cal"))) {
      openModal({ html: calendarHtml("all"), color: "var(--yale-blue)" });
      const h = document.getElementById("calTeams");
      if (h) h.scrollIntoView({ block: "start" });
      return;
    }
    if ((v = d("data-acct"))) { acctAction(v); return; }
  });

  document.addEventListener("change", (e) => {
    const f = e.target.closest("[data-meet-form]");
    if (f && e.target.name === "kind") {
      f.querySelector(".when-weekly").hidden = e.target.value !== "weekly";
      f.querySelector(".when-once").hidden = e.target.value !== "once";
    }
  });

  let noteTimer = null;
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.matches("textarea[data-note]")) return;
    const id = t.dataset.note, v = t.value;
    if (v.trim()) notes[id] = v; else delete notes[id];
    const st = t.parentElement.querySelector(".note-status");
    st.textContent = "Saving…";
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      api("PUT", "/api/me/notes", { itemId: id, note: v })
        .then(() => { st.textContent = "Saved"; })
        .catch((x) => { st.textContent = x.needsLogin ? "Signed out. Reload to sign in." : "Couldn't save. Check your connection."; });
    }, 700);
  });

  document.addEventListener("submit", async (e) => {
    const f = e.target;
    const msgEl = f.querySelector(".form-msg");
    if (f.matches("[data-item-edit]")) {
      e.preventDefault();
      const it = itemById[f.dataset.itemEdit];
      const changes = readItemEdit(f, it);
      if (!Object.keys(changes).length) { if (msgEl) { msgEl.textContent = "Nothing changed."; msgEl.className = "form-msg"; } return; }
      try {
        const r = await api("POST", "/api/admin/items/edit", { courseId: it.course, itemId: it.id, changes });
        // Update both the course record and the planner item, then re-sort and redraw.
        const src = courseById[it.course].items.find((x) => x.id === it.id);
        ["title", "date", "time", "points", "mode", "required", "notes", "verify"].forEach((k) => {
          if (r.item[k] == null) { delete src[k]; delete it[k]; } else { src[k] = r.item[k]; it[k] = r.item[k]; }
        });
        indexItems();
        if (returnTo === it.id) { toast("Saved for everyone. Back to the open questions…"); setTimeout(backToAdmin, 600); return; }
        render();
        toast("Saved for everyone. You can undo it in Manage courses.");
      } catch (x) { if (msgEl) { msgEl.textContent = x.message; msgEl.className = "form-msg err"; } }
      return;
    }
    const fail = (x) => { if (msgEl) { msgEl.textContent = x.message; msgEl.className = "form-msg err"; } };
    if (f.matches("[data-team-create]")) {
      e.preventDefault();
      try {
        await api("POST", "/api/teams", { name: f.name.value, color: f.color.value });
        await reloadTeams(); closeModal(); prefs.view = "teams"; render(); toast("Team created. Share its invite link with your teammates.");
      } catch (x) { fail(x); }
    }
    if (f.matches("[data-meet-form]")) {
      e.preventDefault();
      const data = PlannerTeams.readForm(f);
      const mid = f.dataset.meeting;
      try {
        await api(mid ? "PUT" : "POST", mid ? "/api/meetings/" + mid : "/api/teams/" + f.dataset.meetForm + "/meetings", data);
        await reloadTeams(); closeModal(); toast(mid ? "Meeting updated." : "Meeting added.");
      } catch (x) { fail(x); }
    }
    if (f.matches("[data-courses-form]")) {
      e.preventDefault();
      const picked = [...f.querySelectorAll("input[name=c]:checked")].map((x) => x.value);
      const allIds = [...f.querySelectorAll("input[name=c]")].map((x) => x.value);
      const next = picked.length === allIds.length ? null : picked;
      try {
        await api("PUT", "/api/me/courses", { courses: next });
        myCourses = next;
        prefs.courses = new Set(defaultCourses());
        renderFilters(); render(); closeModal(); toast("My courses saved.");
      } catch (x) { fail(x); }
    }
  });

  // ---------- Account menu ----------
  const initials = (ME.name || ME.email).split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  function renderAccount() {
    const el = document.getElementById("acct");
    if (!el) return;
    el.innerHTML = '<button class="acct-btn" aria-haspopup="true" aria-expanded="false"><span class="acct-av">' + esc(initials) + '</span><span class="acct-name">' + esc(ME.name || ME.email) + "</span> ▾</button>" +
      '<div class="acct-menu" hidden><div class="acct-who"><b>' + esc(ME.name || "") + "</b><span>" + esc(ME.email) + "</span></div>" +
      '<button data-acct="courses">📚 My courses…</button><button data-acct="teams">👥 Teams</button><button data-acct="cal">📅 Add to calendar</button>' +
      (ME.role === "admin" ? '<a href="admin.html">🛠 Manage courses</a><a href="admin-people.html">👥 People &amp; teams</a>' : "") +
      '<button data-acct="caltoken">🔄 Reset my calendar links</button><button data-acct="logout">↩︎ Sign out</button></div>';
    const btn = el.querySelector(".acct-btn"), menu = el.querySelector(".acct-menu");
    btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); });
    document.addEventListener("click", (e) => { if (!el.contains(e.target)) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
  }
  async function acctAction(a) {
    const menu = document.querySelector(".acct-menu");
    if (menu) menu.hidden = true;
    if (a === "teams") { closeModal(); prefs.view = "teams"; render(); }
    if (a === "cal") openModal({ html: calendarHtml("all"), color: "var(--yale-blue)" });
    if (a === "courses") {
      const ids = Object.keys(REG).filter((id) => /^MGT\d{3}$/.test(id)).sort((x, y) => (courseById[x] ? 0 : 1) - (courseById[y] ? 0 : 1) || x.localeCompare(y));
      const box = (id) => '<label class="dd-opt"><input type="checkbox" name="c" value="' + id + '"' + (!myCourses || myCourses.includes(id) ? " checked" : "") + '><i class="dd-swatch" style="background:' + courseInfo(id).color + '"></i><span class="dd-label">' + esc(courseNum(id) + " " + courseInfo(id).name) + "</span></label>";
      openModal({ color: "var(--yale-blue)", html: '<h3 id="modal-title">My courses</h3><p class="muted-p">Pick the courses you\'re taking. The planner, the cards, and your calendar choices start from these. In the second year, when not everyone takes the same electives, this keeps your view clean.</p>' +
        '<form data-courses-form><div class="dd-quick"><button type="button" onclick="this.form.querySelectorAll(\'input[name=c]\').forEach(x=>x.checked=true)">Select all</button><button type="button" onclick="this.form.querySelectorAll(\'input[name=c]\').forEach(x=>x.checked=false)">Clear</button></div>' +
        '<div class="courses-pick">' + ids.map(box).join("") + "</div>" +
        '<div class="pv-actions"><button class="btn" type="submit">Save</button><span class="form-msg"></span></div></form>' });
    }
    if (a === "caltoken") {
      if (!confirm("Make new calendar links? Your current subscriptions stop updating, and you'll subscribe again with the new links.")) return;
      try { ME.calToken = (await api("POST", "/api/me/cal-token")).calToken; toast("New calendar links are ready under Add to calendar."); } catch (e) { toast(e.message); }
    }
    if (a === "logout") {
      try { await api("POST", "/api/auth/logout"); } catch (e) { /* signed out anyway */ }
      try { await caches.delete("api"); } catch (e) { /* no cache API */ }
      location.href = "/";
    }
  }
  renderAccount();

  // ---------- main render ----------
  function render() {
    persist();
    hideTip();
    document.querySelectorAll(".views button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === prefs.view)));
    renderSummary();
    $("#filters").hidden = prefs.view === "teams"; // course filters don't apply to Teams
    let html;
    if (prefs.view === "calendar") {
      // The calendar always shows the full month; "Upcoming only" applies to the list views.
      html = renderCalendar(items.filter((it) => matches(it, { ignoreRange: true })));
    } else if (prefs.view === "teams") {
      html = PlannerTeams.view(TA);
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
    openItem: (id) => { if (itemById[id]) openModal({ item: itemById[id] }); },
    notes,
    /** Save this student's note on an item ("append" adds a line; "replace" overwrites). */
    saveNote: async (id, text, mode) => {
      if (!itemById[id]) throw new Error("No planner item with id " + id);
      const before = notes[id] || "";
      const next = mode === "replace" || !before ? text.trim() : before.replace(/\s+$/, "") + "\n" + text.trim();
      if (next.length > 2000) throw new Error("That would make the note longer than 2,000 characters.");
      await api("PUT", "/api/me/notes", { itemId: id, note: next });
      if (next) notes[id] = next; else delete notes[id];
      if ($("#modal").hidden) render();
      return next;
    }
  };

  const lastUpdate = [D.program.updated, D.coursesUpdated].filter(Boolean).sort().pop();
  $("#updated").textContent = "Schedule data last updated " + fmtDate(lastUpdate) + ", " + lastUpdate.slice(0, 4) + ".";
  renderFilters();
  render();
  const params = new URLSearchParams(location.search);
  const itemParam = params.get("item");
  if (itemParam && itemById[itemParam]) {
    history.replaceState(null, "", location.pathname);
    // Opened from Manage courses → Open questions: saving or closing goes back to that checklist.
    if (params.get("from") === "admin" && ME.role === "admin") returnTo = itemParam;
    openModal({ item: itemById[itemParam] });
  }
  window.dispatchEvent(new Event("emba:ready"));
})();
