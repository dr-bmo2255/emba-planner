// "Ask the Planner" chat panel.
// Two answer engines:
//   1. Built-in: pattern-matches common questions against the planner data. No key, no network.
//   2. Claude: free-form Q&A with the whole planner as context. Uses the shared proxy in
//      EMBA.program.assistant.endpoint (worker/anthropic-proxy.js) if set, otherwise the
//      viewer's own Anthropic API key saved in this browser.
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm";
const KEY_STORE = "emba28.anthropicKey";
const MODE_STORE = "emba28.chatMode";

const A = window.EMBA_APP;
const CFG = Object.assign({ endpoint: "", model: "claude-opus-5-5" }, (window.EMBA.program || {}).assistant);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY = 864e5;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function load(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } }
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
const addDays = (isoStr, n) => A.iso(new Date(A.parseDate(isoStr).getTime() + n * DAY));
const today = A.todayIso;

// ---------------------------------------------------------------- UI shell
document.body.insertAdjacentHTML("beforeend", `
<button class="ask-fab" id="askFab" aria-controls="askPanel" aria-expanded="false">
  <span aria-hidden="true">💬</span> Ask the Planner
</button>
<aside class="ask-panel" id="askPanel" hidden aria-label="Ask the Planner">
  <header class="ask-head">
    <div><b>Ask the Planner</b><span class="ask-mode" id="askMode"></span></div>
    <div class="ask-head-btns">
      <button class="ask-icon" id="askSettingsBtn" aria-label="Settings" title="Settings">⚙</button>
      <button class="ask-icon" id="askReset" aria-label="New conversation" title="New conversation">↺</button>
      <button class="ask-icon" id="askClose" aria-label="Close">×</button>
    </div>
  </header>
  <section class="ask-settings" id="askSettings" hidden></section>
  <div class="ask-log" id="askLog" aria-live="polite"></div>
  <div class="ask-suggest" id="askSuggest"></div>
  <form class="ask-form" id="askForm">
    <textarea id="askInput" rows="1" placeholder="e.g. What's due before the Nov 6 weekend?" aria-label="Your question"></textarea>
    <button class="btn" type="submit" id="askSend">Send</button>
  </form>
</aside>`);

const $ = (s) => document.querySelector(s);
const log = $("#askLog");
const SUGGESTIONS = [
  "What's due this week?",
  "What do I need to read for the next class weekend?",
  "Who teaches Operations?",
  "How is Competitor graded?",
  "What group assignments are left?",
  "Who's the colloquium speaker on Nov 6?"
];

let history = [];   // Claude conversation (messages array, assistant content kept verbatim)
let busy = false;

function claudeAvailable() { return !!(CFG.endpoint || load(KEY_STORE, "")); }
function mode() {
  const m = load(MODE_STORE, "auto");
  if (m === "local" || !claudeAvailable()) return "local";
  return "claude";
}
function renderMode() {
  $("#askMode").textContent = mode() === "claude" ? "Claude" : "Built-in answers";
  $("#askMode").className = "ask-mode " + (mode() === "claude" ? "is-claude" : "");
}

function openPanel(open) {
  $("#askPanel").hidden = !open;
  $("#askFab").setAttribute("aria-expanded", String(open));
  $("#askFab").hidden = open;
  if (open) {
    if (!log.children.length) greet();
    $("#askInput").focus();
  }
}
$("#askFab").addEventListener("click", () => openPanel(true));
$("#askClose").addEventListener("click", () => openPanel(false));
$("#askReset").addEventListener("click", () => { history = []; log.innerHTML = ""; greet(); });

function greet() {
  const claude = mode() === "claude";
  addMsg("bot", `<p>Hi! Ask me about assignments, readings, class times, professors, or grading.</p>
    <p class="ask-hint">${claude ? "Answering with Claude, using everything in the planner." :
    "Using built-in answers (fast, offline). " + (claudeAvailable() ? "" : "For free-form questions, add Claude in ⚙ Settings.")}</p>`);
  $("#askSuggest").innerHTML = SUGGESTIONS.map((s) => `<button type="button">${esc(s)}</button>`).join("");
}
$("#askSuggest").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") ask(e.target.textContent);
});

function addMsg(who, html) {
  const el = document.createElement("div");
  el.className = "ask-msg " + who;
  el.innerHTML = html;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

// Clicking an item reference opens the planner's own details panel.
log.addEventListener("click", (e) => {
  const ref = e.target.closest("[data-item]");
  if (ref) A.openItem(ref.dataset.item);
});

const input = $("#askInput");
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#askForm").requestSubmit(); }
});
$("#askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (q && !busy) ask(q);
});

async function ask(q) {
  input.value = ""; input.style.height = "auto";
  $("#askSuggest").innerHTML = "";
  addMsg("me", esc(q));
  if (mode() === "claude") await askClaude(q);
  else addMsg("bot", localAnswer(q));
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  const key = load(KEY_STORE, "");
  const m = load(MODE_STORE, "auto");
  $("#askSettings").innerHTML = `
    <h4>Answer with</h4>
    <label><input type="radio" name="askm" value="auto" ${m !== "local" ? "checked" : ""} ${claudeAvailable() ? "" : "disabled"}> Claude <small>(free-form questions)</small></label>
    <label><input type="radio" name="askm" value="local" ${m === "local" || !claudeAvailable() ? "checked" : ""}> Built-in answers <small>(no key, works offline)</small></label>
    ${CFG.endpoint ? `<p class="ask-note ok">Claude is provided for the cohort by the planner maintainer. No key needed.</p>` : `
    <h4>Your Anthropic API key <small>(optional)</small></h4>
    <p class="ask-note">The key is stored only in this browser and sent only to Anthropic's API. Usage is billed to your Anthropic account. Don't use this on a shared computer.</p>
    <div class="ask-keyrow">
      <input type="password" id="askKey" placeholder="${key ? "Saved: ••••" + esc(key.slice(-4)) : "sk-ant-…"}" autocomplete="off">
      <button class="btn" id="askKeySave" type="button">Save</button>
      ${key ? `<button class="btn btn-ghost" id="askKeyForget" type="button">Forget</button>` : ""}
    </div>
    <p class="ask-note"><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Get a key ↗</a></p>`}`;
}
$("#askSettingsBtn").addEventListener("click", () => {
  const s = $("#askSettings");
  s.hidden = !s.hidden;
  if (!s.hidden) renderSettings();
});
$("#askSettings").addEventListener("change", (e) => {
  if (e.target.name === "askm") { store(MODE_STORE, e.target.value); renderMode(); }
});
$("#askSettings").addEventListener("click", (e) => {
  if (e.target.id === "askKeySave") {
    const v = $("#askKey").value.trim();
    if (!v) return;
    store(KEY_STORE, v); store(MODE_STORE, "auto"); client = null;
    renderSettings(); renderMode();
  }
  if (e.target.id === "askKeyForget") { store(KEY_STORE, null); client = null; renderSettings(); renderMode(); }
});

// ---------------------------------------------------------------- shared formatting
function itemLine(it) {
  const info = A.courseInfo(it.course);
  const k = A.KINDS[it.kind];
  const when = it.date ? A.fmtDow(it.date) + " " + A.fmtDate(it.date) + (it.time ? " " + A.fmtTime(it.time) : "") : "Date TBA";
  const meta = [];
  if (k.due && it.points != null) meta.push(A.fmtPts(it.points));
  if (k.due && it.mode) meta.push(it.mode);
  if (it.required === false) meta.push("optional");
  if (A.done.has(it.id)) meta.push("✓ done");
  return `<button class="ask-item${A.done.has(it.id) ? " done" : ""}" data-item="${esc(it.id)}" style="--c:${info.color}">
    <span class="ai-c">${esc(A.courseNum(it.course))}</span>
    <span class="ai-t">${esc(it.title)}<small>${esc(when)}${meta.length ? " · " + esc(meta.join(" · ")) : ""}</small></span></button>`;
}
function itemList(list, max) {
  max = max || 12;
  const shown = list.slice(0, max);
  return `<div class="ask-items">${shown.map(itemLine).join("")}</div>` +
    (list.length > max ? `<p class="ask-hint">…and ${list.length - max} more. Narrow it down (add a course or a date).</p>` : "");
}

// ---------------------------------------------------------------- built-in answers
const GENERIC = new Set(["managing", "managers", "management", "foundations", "context", "global", "state", "society", "groups", "teams", "funds", "modeling"]);
const COURSE_WORDS = {};
Object.entries(A.REG).forEach(([id, r]) => {
  if (id === "PROGRAM") return;
  const words = new Set([id.replace("MGT", ""), norm(r.name)]);
  norm(r.name).split(/[^a-z]+/).filter((w) => w.length > 4 && !GENERIC.has(w)).forEach((w) => words.add(w));
  (r.faculty || []).forEach((f) => words.add(norm(f.name.split(/\s+/).pop())));
  COURSE_WORDS[id] = words;
});
const EXTRA = { MGT407: ["stats"], MGT409: ["ai", "a.i."], MGT422: ["ops", "operations"], MGT404: ["econ"], MGT699: ["colloquium", "speaker", "speakers"], MGT592: ["legal", "law"], MGT425: ["macro"], MGT408: ["negotiation"] };
Object.entries(EXTRA).forEach(([id, ws]) => ws.forEach((w) => COURSE_WORDS[id] && COURSE_WORDS[id].add(w)));

function findCourses(q) {
  const n = " " + norm(q).replace(/[^a-z0-9.]+/g, " ") + " ";
  return Object.keys(COURSE_WORDS).filter((id) => [...COURSE_WORDS[id]].some((w) => n.includes(" " + w + " ") || (w.length > 5 && n.includes(w))));
}

function findWindow(q) {
  const n = norm(q);
  const dow = A.parseDate(today).getDay();
  if (/\btoday\b|\btonight\b/.test(n)) return { from: today, to: today, label: "today" };
  if (/\btomorrow\b/.test(n)) return { from: addDays(today, 1), to: addDays(today, 1), label: "tomorrow" };
  if (/\bnext week\b/.test(n)) { const s = addDays(today, 7 - dow); return { from: s, to: addDays(s, 6), label: "next week" }; }
  if (/\bthis week\b|\bweek\b/.test(n)) return { from: today, to: addDays(today, 6 - dow), label: "this week" };
  const m = n.match(/next (\d+) days/);
  if (m) return { from: today, to: addDays(today, +m[1]), label: "the next " + m[1] + " days" };
  if (/overdue|past due|missed|late\b/.test(n)) return { from: "0000-00-00", to: addDays(today, -1), label: "overdue", overdue: true };
  if (/(next|this|upcoming|coming) (class )?weekend|next class/.test(n)) {
    const w = window.EMBA.program.classWeekends.find((x) => x[1] >= today);
    if (w) return { from: today, to: w[1], label: "before and during the " + A.fmtDate(w[0]) + "–" + A.fmtDate(w[1]) + " weekend", weekend: w };
  }
  // "nov 7", "november 7th", "11/7"
  let md = n.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})(st|nd|rd|th)?\b/);
  let mo, d;
  if (md) { mo = MONTHS.indexOf(md[1]) + 1; d = +md[2]; }
  else if ((md = n.match(/\b(\d{1,2})\/(\d{1,2})\b/))) { mo = +md[1]; d = +md[2]; }
  if (mo && d) {
    let y = +today.slice(0, 4);
    if (mo < +today.slice(5, 7) - 3) y++;
    const ds = y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    return { from: ds, to: ds, label: A.fmtDow(ds) + " " + A.fmtDate(ds) };
  }
  const mOnly = n.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  if (mOnly) {
    const mi = MONTHS.indexOf(mOnly[1].slice(0, 3)) + 1;
    let y = +today.slice(0, 4);
    if (mi < +today.slice(5, 7) - 3) y++;
    const from = y + "-" + String(mi).padStart(2, "0") + "-01";
    const to = A.iso(new Date(y, mi, 0));
    return { from, to, label: "in " + mOnly[1][0].toUpperCase() + mOnly[1].slice(1) };
  }
  return null;
}

const STOP = new Set("what whats when where which who whos how is are the a an of for to in on do does did i my me we our need have has any there this that next due with about class course read reading readings show tell list all please give".split(" "));

function localAnswer(q) {
  const n = norm(q);
  const courses = findCourses(q);
  const win = findWindow(q);
  const inCourses = (it) => !courses.length || courses.includes(it.course);
  const cname = (id) => A.courseInfo(id).code + " " + A.courseInfo(id).name;

  // Professors / faculty
  if (/\b(who|professor|prof|teach|teaches|teaching|instructor|faculty|lecturer|\bta\b|tas)\b/.test(n) && !/speaker|colloquium/.test(n)) {
    const ids = courses.length ? courses : Object.keys(A.REG).filter((id) => id !== "PROGRAM");
    const rows = ids.map((id) => {
      const fac = A.facultyFor(id);
      const c = A.courseById[id];
      const tas = c && c.contacts ? c.contacts.filter((x) => x.role === "TA").map((x) => x.name) : [];
      return `<li><b>${esc(cname(id))}</b>: ${fac.length ? fac.map((f) => (f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)) + (f.verify ? " (unconfirmed)" : "")).join(", ") : "not listed"}${tas.length ? `<br><small>TAs: ${esc(tas.join(", "))}</small>` : ""}</li>`;
    });
    return `<ul class="ask-list">${rows.join("")}</ul>`;
  }

  // Grading / weights
  if (/\b(graded|grading|grade|weights?|worth|breakdown|percent)\b/.test(n) && courses.length) {
    return courses.map((id) => {
      const c = A.courseById[id];
      if (!c || !c.grading || !c.grading.length) return `<p><b>${esc(cname(id))}</b>: no grading breakdown loaded yet (syllabus not added).</p>`;
      return `<p><b>${esc(cname(id))}</b></p><ul class="ask-list">${c.grading.map((g) => `<li><b>${g.weight}%</b> ${esc(g.label)}</li>`).join("")}</ul>`;
    }).join("");
  }

  // Colloquium speakers
  if (/speaker|colloquium/.test(n)) {
    let list = A.items.filter((i) => i.kind === "colloquium" && i.speaker);
    if (win) list = list.filter((i) => i.date >= win.from && i.date <= win.to);
    else list = list.filter((i) => i.date >= today).slice(0, 4);
    if (!list.length) return "<p>No colloquium speaker found for that date.</p>";
    return `<p>Colloquium is Fridays 1:00–2:00 PM (attendance quiz 12:45–1:05).</p>` + itemList(list);
  }

  // Which kinds?
  const kinds = new Set();
  if (/\b(due|deadline|deadlines|assignment|assignments|homework|hw\d*|problem sets?|paper|papers|exam|exams|final|finals|submit|deliverables?|write-?up)\b/.test(n)) ["assignment", "exam"].forEach((k) => kinds.add(k));
  if (/\b(read|reading|readings|case|cases|prepare|prep|article)\b/.test(n)) ["reading", "case"].forEach((k) => kinds.add(k));
  if (/\b(class|classes|session|sessions|meet|meeting|lecture|room|schedule)\b/.test(n) && !kinds.size) ["session", "colloquium", "event"].forEach((k) => kinds.add(k));
  if (/office hours?|review session/.test(n)) kinds.add("office");
  const wantGroup = /\bgroup\b|team/.test(n), wantInd = /\bindividual\b/.test(n);
  const wantOpen = /\b(left|remaining|outstanding|haven'?t|not done|unfinished|to-?do|still)\b/.test(n) || (win && win.overdue);
  const wantOptional = /\boptional\b/.test(n), wantRequired = /\brequired\b/.test(n);

  if (kinds.size || win) {
    if (!kinds.size) ["assignment", "exam", "reading", "case"].forEach((k) => kinds.add(k));
    let list = A.items.filter((i) => kinds.has(i.kind) && inCourses(i));
    if (wantGroup) list = list.filter((i) => i.mode === "group");
    if (wantInd) list = list.filter((i) => i.mode === "individual");
    if (wantOptional) list = list.filter((i) => i.required === false);
    if (wantRequired) list = list.filter((i) => i.required !== false);
    if (wantOpen) list = list.filter((i) => !A.done.has(i.id));
    let label;
    if (win) {
      list = list.filter((i) => i.date && i.date >= win.from && i.date <= win.to);
      label = win.label;
    } else {
      // No date given: upcoming only (plus TBA-dated deliverables at the end).
      list = list.filter((i) => !i.date || i.date >= today);
      label = "coming up";
    }
    const what = [...kinds].includes("assignment") && kinds.size === 2 ? "deliverables" :
      [...kinds].includes("reading") && kinds.size === 2 ? "readings and cases" : "items";
    const scope = courses.length ? " for " + courses.map(cname).join(", ") : "";
    if (!list.length) return `<p>No ${what}${esc(scope)} ${esc(label)}.</p>`;
    const pts = list.filter((i) => A.KINDS[i.kind].due && i.points != null && !A.done.has(i.id));
    const whatN = list.length === 1 ? { deliverables: "deliverable", "readings and cases": "reading or case", items: "item" }[what] : what;
    return `<p><b>${list.length}</b> ${whatN}${esc(scope)} ${esc(label)}${pts.length && what === "deliverables" ? " (" + pts.length + " still open)" : ""}:</p>` + itemList(list);
  }

  // Course overview
  if (courses.length === 1 && n.split(/\s+/).length <= 4) {
    const id = courses[0];
    const next = A.items.filter((i) => i.course === id && i.date && i.date >= today && i.kind !== "office");
    const fac = A.facultyFor(id);
    return `<p><b>${esc(cname(id))}</b>${fac.length ? " · " + esc(fac.map((f) => f.name).join(", ")) : ""}</p>` +
      (next.length ? `<p>Next up:</p>` + itemList(next, 6) : "<p>Nothing upcoming.</p>");
  }

  // Fallback: keyword search
  const words = n.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (words.length) {
    const scored = A.items.map((it) => {
      const hay = norm([it.title, it.notes, (it.topics || []).join(" "), it.speaker && (it.speaker.speaker + " " + it.speaker.title), A.courseInfo(it.course).name].join(" "));
      return { it, s: words.filter((w) => hay.includes(w)).length };
    }).filter((x) => x.s > 0 && inCourses(x.it)).sort((a, b) => b.s - a.s || a.it.sortKey.localeCompare(b.it.sortKey));
    if (scored.length) {
      const top = scored.filter((x) => x.s === scored[0].s).map((x) => x.it);
      return `<p>Here's what matches “${esc(words.join(" "))}”:</p>` + itemList(top, 10) +
        (claudeAvailable() ? "" : `<p class="ask-hint">For questions in your own words, turn on Claude in ⚙ Settings.</p>`);
    }
  }
  return `<p>I couldn't match that. Try asking about what's <b>due</b>, <b>readings</b>, <b>class times</b>, <b>professors</b>, or <b>grading</b>, plus a course or date (e.g. "Competitor readings for Nov 7").</p>` +
    (claudeAvailable() ? "" : `<p class="ask-hint">Turn on Claude in ⚙ Settings to ask anything in your own words.</p>`);
}

// ---------------------------------------------------------------- Claude
let client = null;
let systemPrompt = null;

async function getClient() {
  if (client) return client;
  const { default: Anthropic } = await import(SDK_URL);
  client = CFG.endpoint
    // The proxy swaps in the real key server-side; the SDK just needs a placeholder.
    ? new Anthropic({ baseURL: CFG.endpoint.replace(/\/$/, ""), apiKey: "via-proxy", dangerouslyAllowBrowser: true })
    : new Anthropic({ apiKey: load(KEY_STORE, ""), dangerouslyAllowBrowser: true });
  client.__Anthropic = Anthropic;
  return client;
}

function plannerContext() {
  const E = window.EMBA;
  const lines = [];
  lines.push("## Courses");
  Object.entries(A.REG).forEach(([id, r]) => {
    if (id === "PROGRAM") return;
    const c = A.courseById[id];
    lines.push(`### ${r.code} ${r.name} (course id ${id})${c ? "" : " [syllabus not loaded; only class times known]"}`);
    if (r.faculty) lines.push("Faculty: " + r.faculty.map((f) => f.name + (f.title ? " (" + f.title + ")" : "") + (f.verify ? " [VERIFY: " + f.verify + "]" : "")).join("; "));
    if (c) {
      if (c.term) lines.push("Term: " + c.term);
      if (c.contacts) lines.push("Contacts: " + c.contacts.map((x) => x.role + " " + x.name).join("; "));
      if (c.grading && c.grading.length) lines.push("Grading: " + c.grading.map((g) => g.weight + "% " + g.label).join("; "));
      if (c.notes) lines.push("Notes: " + c.notes);
      if (c.canvas) lines.push("Canvas: " + c.canvas);
      (c.resources || []).forEach((r2) => lines.push("Resource: " + r2.label + " " + r2.url));
    }
  });
  lines.push("", "## Class weekends", E.program.classWeekends.map((w) => w[0] + " to " + w[1]).join("; "));
  lines.push("", "## Items (one per line)",
    "Format: [id] date weekday time(ET) | course | type | title | points (% of course grade) | work mode | required/optional | details | links");
  A.items.forEach((it) => {
    const k = A.KINDS[it.kind];
    const f = [
      `[${it.id}] ${it.date || "date TBA"}${it.date ? " " + A.fmtDow(it.date) : ""}${it.time ? " " + it.time + (it.endTime ? "-" + it.endTime : "") : ""}${it.endDate ? " through " + it.endDate : ""}`,
      A.courseInfo(it.course).code,
      k.tag,
      it.title
    ];
    if (k.due) f.push(it.points != null ? it.points + "%" : "points not specified");
    if (k.due) f.push(it.mode || "group/individual not specified");
    if (it.required != null) f.push(it.required === false ? "optional" : "required");
    const det = [];
    if (it.instructor) det.push("faculty: " + it.instructor);
    if (it.location) det.push(it.location);
    if (it.topics && it.topics.length) det.push("topics: " + it.topics.join("; "));
    if (it.speaker) det.push("speaker: " + it.speaker.speaker + (it.speaker.title ? ", " + it.speaker.title : ""));
    if (it.notes) det.push(it.notes);
    if (it.verify) det.push("VERIFY: " + it.verify);
    if (det.length) f.push(det.join(" / "));
    if (it.links && it.links.length) f.push(it.links.map((l) => l.label + " " + l.url).join(" ; "));
    lines.push(f.join(" | "));
  });
  return lines.join("\n");
}

function getSystem() {
  if (systemPrompt) return systemPrompt;
  systemPrompt = `You are the assistant built into the EMBA Planner, a schedule tool for the Yale School of Management MBA for Executives Class of 2028. Students ask you about assignments, readings, cases, class sessions, professors, grading, and deadlines.

Answer from the planner data below; it was extracted from the course syllabi and the EMBA office's master schedule. All times are US Eastern. Readings and cases are due by the start of the class session listed. If the data doesn't answer the question, say so plainly and suggest checking Canvas or asking the professor or TA. Don't guess dates, points, or links. When an item carries a VERIFY note, mention that caveat. The user's message starts with today's date and the ids they've marked complete; use them for "upcoming", "left", or "overdue" questions.

Keep replies short and scannable: lead with the direct answer, then a compact bulleted list if there are several items. When you mention a specific planner item, put its id in double square brackets right after it, e.g. "HW2 [[410-hw2]]"; the app turns those into clickable links. You may use **bold**, bullet lists, and Markdown links to URLs that appear in the data. No tables or headings.

<planner_data>
${plannerContext()}
</planner_data>`;
  return systemPrompt;
}

function renderMarkdown(text) {
  const inline = (s) => esc(s)
    .replace(/\[\[([A-Za-z0-9_.-]+)\]\]/g, (m, id) => A.itemById[id] ? itemLine(A.itemById[id]).replace(/\n\s*/g, "") : "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const out = [];
  let list = null;
  text.split("\n").forEach((line) => {
    const li = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (li) { if (!list) { list = []; } list.push(`<li>${inline(li[1])}</li>`); return; }
    if (list) { out.push(`<ul class="ask-list">${list.join("")}</ul>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line.replace(/^#+\s*/, ""))}</p>`);
  });
  if (list) out.push(`<ul class="ask-list">${list.join("")}</ul>`);
  return out.join("");
}

async function askClaude(q) {
  busy = true;
  $("#askSend").disabled = true;
  const bubble = addMsg("bot", `<p class="ask-typing"><span></span><span></span><span></span></p>`);
  const prefix = `Today is ${A.fmtDow(today)}, ${today}. Items I've marked complete: ${[...A.done].join(", ") || "none"}.\n\n`;
  history.push({ role: "user", content: prefix + q });
  let text = "";
  try {
    const c = await getClient();
    const stream = c.beta.messages.stream({
      model: CFG.model,
      max_tokens: 16000,
      system: [{ type: "text", text: getSystem(), cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low" },
      // On a safety-classifier decline, the API reruns the request on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: history
    });
    stream.on("text", (delta) => {
      text += delta;
      bubble.innerHTML = renderMarkdown(text);
      log.scrollTop = log.scrollHeight;
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      history.pop();
      bubble.innerHTML = "<p>Claude couldn't answer that one. Try rephrasing, or switch to built-in answers in ⚙ Settings.</p>";
    } else {
      history.push({ role: "assistant", content: final.content });
      if (!text) bubble.innerHTML = "<p>(No answer returned.)</p>";
      if (final.stop_reason === "max_tokens") bubble.insertAdjacentHTML("beforeend", `<p class="ask-hint">(Answer was cut off.)</p>`);
    }
  } catch (err) {
    history.pop();
    const An = client && client.__Anthropic;
    let msg = "Couldn't reach Claude. Showing built-in answers instead.";
    if (An && err instanceof An.AuthenticationError) msg = CFG.endpoint ? "The cohort's Claude proxy rejected the request (check its API key)." : "Your API key was rejected. Check it in ⚙ Settings.";
    else if (An && err instanceof An.RateLimitError) msg = "Claude is rate-limited right now. Showing built-in answers instead.";
    else if (An && err instanceof An.APIError && err.status) msg = `Claude returned an error (${err.status}). Showing built-in answers instead.`;
    console.error("[assistant]", err);
    bubble.innerHTML = `<p class="ask-hint">${esc(msg)}</p>` + localAnswer(q);
  } finally {
    busy = false;
    $("#askSend").disabled = false;
  }
}

renderMode();
