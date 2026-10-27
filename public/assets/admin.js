// Manage courses: admins only (signed-in account with the admin role). Accounts and teams are on admin-people.html. Changes save to
// the planner's database and show up for everyone immediately; every change can be undone.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

import { $, esc, fmtDate, fmtWhen, msg, call, adminGate } from "./admin-common.js?v=2026-10-27m";

const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
const E = await adminGate();
const REG = E.program.courseRegistry;
call("admin/status").then((r) => r.json()).then((r) => {
  if (r.claude !== "ok") msg($("#extractMsg"), "Setup incomplete: Claude key " + r.claude + ".", "err");
}).catch(() => {});

// ---------------------------------------------------------------- iPhone share-sheet inbox + keys
async function loadInbox() {
  const id = new URLSearchParams(location.search).get("inbox");
  $("#shortcutUrl").textContent = location.origin + "/api/inbox";
  if (!id) return;
  try {
    const res = await call("admin/inbox/" + id);
    const name = decodeURIComponent(res.headers.get("x-filename") || "syllabus.pdf");
    setFile(new File([await res.blob()], name, { type: "application/pdf" }));
    msg($("#extractMsg"), "📥 Loaded " + name + " (from your phone or the Canvas check). Pick the course if you like, then tap Read with Claude.", "ok");
    history.replaceState(null, "", location.pathname);
  } catch (e) {
    msg($("#extractMsg"), e.message, "err");
  }
}
async function loadTokens() {
  const { tokens } = await (await call("admin/tokens")).json();
  $("#tokens").innerHTML = tokens.length ? tokens.map((t) => `<div class="hrow"><div class="hmsg">${esc(t.label)}<span>made ${esc(fmtWhen(t.created_at))}</span></div>
    <button class="btn btn-danger btn-sm" data-token-del="${esc(t.ref)}">Delete</button></div>`).join("") : '<p class="muted">No shortcut keys yet.</p>';
}
$("#newToken").addEventListener("click", async () => {
  const label = prompt("Name this key (e.g. Brian's iPhone)", "iPhone shortcut");
  if (!label) return;
  const { token } = await (await call("admin/tokens", { label })).json();
  $("#tokens").insertAdjacentHTML("afterbegin", `<div class="warn-box"><b>Copy this key now. It won't be shown again.</b>
    <div class="cal-copy" style="margin-top:6px"><input readonly value="${esc(token)}" aria-label="Shortcut key"><button class="btn btn-ghost btn-sm" data-copy-key="${esc(token)}">Copy</button></div>
    In the Shortcut's Authorization header, enter: <code>Bearer ${esc(token.slice(0, 10))}…</code> (the whole key after "Bearer ").</div>`);
  setTimeout(loadTokens, 60000);
});
$("#tokens").addEventListener("click", async (e) => {
  const c = e.target.closest("[data-copy-key]");
  if (c) { navigator.clipboard.writeText(c.dataset.copyKey).catch(() => {}); c.textContent = "Copied ✓"; return; }
  const d = e.target.closest("[data-token-del]");
  if (d && confirm("Delete this key? A Shortcut using it stops working.")) { await call("admin/tokens/delete", { ref: d.dataset.tokenDel }); loadTokens(); }
});

// ---------------------------------------------------------------- current courses
let current = {}; // id -> course JSON as stored in the database
async function loadCourses() {
  const data = await (await call("data")).json();
  current = Object.fromEntries(data.courses.map((c) => [c.id, c]));
  renderOpenQuestions();
  const sel = $("#courseHint");
  const keep = sel.value;
  sel.innerHTML = '<option value="">Detect automatically</option>' + Object.entries(REG).filter(([id]) => id !== "PROGRAM")
    .map(([id, r]) => `<option value="${id}">${esc(r.code + " " + r.name)}${current[id] ? "" : " (no syllabus yet)"}</option>`).join("");
  sel.value = keep;
  const ids = Object.keys(current).sort();
  $("#courseList").innerHTML = ids.length ? `<div class="clist">${ids.map((id) => {
    const c = current[id], r = REG[id] || {};
    const src = c.source ? (c.source.url ? "web page" : c.source.file || "syllabus") + " · " + (c.source.updated || "") : "";
    return `<div class="crow" style="--c:${r.color || "#00356b"}"><i class="sw"></i>
      <div class="cname"><b>${esc(c.code + " " + c.name)}</b><span>${c.items.length} items · ${esc(src)}</span></div>
      <button class="btn btn-danger btn-sm" data-remove="${id}">Remove</button></div>`;
  }).join("")}</div>` : '<p class="muted">No course data yet.</p>';
}
$("#refreshBtn").addEventListener("click", () => { loadCourses(); loadHistory(); });
$("#courseList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-remove]");
  if (!b) return;
  const id = b.dataset.remove, c = current[id];
  if (!confirm(`Remove all syllabus data for ${c.code} ${c.name}?\n\nIts ${c.items.length} assignments and readings disappear from the planner (class times from the master schedule stay). You can undo this under Recent changes.`)) return;
  b.disabled = true;
  try {
    await call("admin/remove", { id });
    flash(`Removed ${c.code}.`);
    loadCourses(); loadHistory();
  } catch (err) { b.disabled = false; alert("Couldn't remove: " + err.message); }
});

// ---------------------------------------------------------------- open questions
function renderOpenQuestions() {
  const rows = [];
  Object.values(current).sort((a, b) => a.id.localeCompare(b.id)).forEach((c) => c.items.forEach((it) => {
    const due = it.type === "assignment" || it.type === "exam";
    const why = [];
    if (due && !it.mode) why.push("group or individual?");
    if (due && it.points == null) why.push("no points");
    if (!it.date && it.type !== "office") why.push("no date");
    if (it.verify) why.push("⚠ " + it.verify);
    if (why.length) rows.push({ c, it, why });
  }));
  $("#openQs").innerHTML = rows.length ? rows.map(({ c, it, why }) => `<div class="crow" data-qid="${esc(it.id)}" style="--c:${(REG[c.id] || {}).color || "#00356b"}"><i class="sw"></i>
    <div class="cname"><b>${esc(c.code.replace(/^MGT /, "") + " · " + it.title)}</b><span>${esc(why.join(" · "))}</span></div>
    <a class="btn btn-ghost btn-sm" href="./?item=${encodeURIComponent(it.id)}&from=admin">Open</a></div>`).join("")
    : '<p class="muted">Nothing open. Every item has its details settled.</p>';
  returnedFrom();
}

// Back from editing an item in the planner (planner sends ?back=<item id>#openQsCard): scroll to the list
// and highlight that row (or say it's settled now).
let backFrom = new URLSearchParams(location.search).get("back");
function returnedFrom() {
  if (!backFrom) return;
  const id = backFrom;
  backFrom = null;
  history.replaceState(null, "", location.pathname);
  const row = [...document.querySelectorAll("#openQs [data-qid]")].find((r) => r.dataset.qid === id);
  $("#openQsCard").scrollIntoView({ block: "start" });
  if (row) { row.classList.add("flash"); row.scrollIntoView({ block: "center" }); }
  else $("#openQs").insertAdjacentHTML("afterbegin", '<p class="msg ok">✓ That item is settled and off the list.</p>');
}

// ---------------------------------------------------------------- weekly Canvas check
async function loadCanvas() {
  let data;
  try { data = await (await call("admin/canvas")).json(); } catch (e) { return; }
  const r = data.report;
  if (!r) return;
  const seen = new Set(data.seen);
  const syl = r.syllabi.filter((x) => !seen.has(x.key));
  // A date row goes away by itself once the planner item matches Canvas ("YYYY-MM-DD HH:MM").
  const plannerWhen = (id) => { for (const c of Object.values(current)) { const it = c.items.find((i) => i.id === id); if (it) return [it.date, it.time].filter(Boolean).join(" "); } return null; };
  const dates = r.dates.filter((x) => !seen.has(x.key) && !(x.itemId && x.canvas && plannerWhen(x.itemId) === x.canvas));
  const fresh = r.newItems.filter((x) => !seen.has(x.key));
  const age = Math.round((Date.now() - Date.parse(r.checkedAt)) / 864e5);
  $("#canvasWhen").textContent = "Checked " + fmtWhen(r.checkedAt) + (age > 8 ? " · overdue, the weekly check may not be running" : "");
  const color = (c) => (REG[c] || {}).color || "#00356b";
  const row = (x, label, sub, btns) => `<div class="crow" style="--c:${color(x.course)}"><i class="sw"></i>
    <div class="cname"><b>${esc(label)}</b><span>${sub}</span></div>${btns}</div>`;
  const dismiss = (x) => `<button class="btn btn-ghost btn-sm" data-seen="${esc(x.key)}">Dismiss</button>`;
  const canvasLink = (x) => x.canvasUrl ? ` · <a href="${esc(x.canvasUrl)}" target="_blank" rel="noopener">in Canvas</a>` : "";
  let h = "";
  if (syl.length) h += "<h3>Syllabi to read</h3>" + syl.map((x) => row(x, (x.course || "") + " · " + x.title,
    esc(x.status === "changed" ? "Changed since it was last read" : "New") + (x.updated ? " · updated in Canvas " + esc(fmtWhen(x.updated)) : "") +
      canvasLink(x) + (x.note ? " · " + esc(x.note) : ""),
    (x.inboxId ? `<a class="btn btn-sm" href="admin.html?inbox=${esc(x.inboxId)}" data-seen-go="${esc(x.key)}">Read with Claude</a>` : "") + dismiss(x))).join("");
  if (dates.length) h += "<h3>Dates that differ from Canvas</h3>" + dates.map((x) => row(x, (x.course || "") + " · " + x.title,
    `Planner: ${esc(x.planner || "TBA")} · Canvas: <b>${esc(x.canvas || "none")}</b>` + canvasLink(x),
    (x.itemId ? `<a class="btn btn-ghost btn-sm" href="./?item=${encodeURIComponent(x.itemId)}&from=admin">Open</a>` : "") + dismiss(x))).join("");
  if (fresh.length) h += "<h3>In Canvas, not in the planner</h3>" + fresh.map((x) => row(x, (x.course || "") + " · " + x.title,
    "Due " + esc(x.due || "date not set") + canvasLink(x), dismiss(x))).join("");
  if (r.notes.length) h += `<div class="warn-box">${r.notes.map((n) => esc(n)).join("<br>")}</div>`;
  $("#canvasBody").innerHTML = h || '<p class="muted">✓ Everything in Canvas matches the planner.</p>';
  $("#canvasCard").hidden = false;
}
$("#canvasCard").addEventListener("click", async (e) => {
  const d = e.target.closest("[data-seen]"), go = e.target.closest("[data-seen-go]");
  if (go) { e.preventDefault(); await call("admin/canvas/seen", { key: go.dataset.seenGo }).catch(() => {}); location.href = go.href; return; }
  if (!d) return;
  d.disabled = true;
  try { await call("admin/canvas/seen", { key: d.dataset.seen }); loadCanvas(); } catch (err) { d.disabled = false; alert(err.message); }
});

// ---------------------------------------------------------------- weekly report archive (loads when opened)
function reportHtml(r) {
  const li = (arr, f) => arr.length ? "<ul>" + arr.map((x) => "<li>" + f(x) + "</li>").join("") + "</ul>" : '<p class="muted">None.</p>';
  return `<div class="report-view">
    <h4>Syllabi (${r.syllabi.length})</h4>${li(r.syllabi, (x) => esc((x.course || "") + " · " + x.title + " · " + x.status) + (x.updated ? " · updated in Canvas " + esc(fmtWhen(x.updated)) : ""))}
    <h4>Dates that differed (${r.dates.length})</h4>${li(r.dates, (x) => esc(`${x.course || ""} · ${x.title}: planner ${x.planner || "TBA"}, Canvas ${x.canvas || "none"}`))}
    <h4>In Canvas, not in the planner (${r.newItems.length})</h4>${li(r.newItems, (x) => esc(`${x.course || ""} · ${x.title}` + (x.due ? " · due " + x.due : "")))}
    ${r.notes.length ? "<h4>Notes</h4>" + li(r.notes, esc) : ""}</div>`;
}
async function loadArchive() {
  try {
    const { reports } = await (await call("admin/canvas/archive")).json();
    $("#archive").innerHTML = reports.length ? reports.map((x) => `<details class="logbox" data-report="${x.id}"><summary>${esc(fmtWhen(x.checked_at))} <span class="muted">${esc(x.summary)}</span></summary><div class="log-body"></div></details>`).join("")
      : '<p class="muted">No weekly reports yet. They\'re saved here from now on.</p>';
  } catch (e) { $("#archive").innerHTML = `<p class="msg err">${esc(e.message)}</p>`; }
}
$("#archiveBox").addEventListener("toggle", () => { if ($("#archiveBox").open && !$("#archiveBox").dataset.loaded) { $("#archiveBox").dataset.loaded = "1"; $("#archive").innerHTML = '<p class="muted">Loading…</p>'; loadArchive(); } });
$("#archive").addEventListener("toggle", async (e) => {
  const d = e.target;
  if (!d.dataset || !d.dataset.report || !d.open || d.dataset.loaded) return;
  d.dataset.loaded = "1";
  try { d.querySelector(".log-body").innerHTML = reportHtml((await (await call("admin/canvas/archive/" + d.dataset.report)).json()).report); }
  catch (err) { d.querySelector(".log-body").innerHTML = `<p class="msg err">${esc(err.message)}</p>`; }
}, true); // toggle doesn't bubble; capture it

// ---------------------------------------------------------------- history / undo
async function loadHistory() {
  try {
    const { changes } = await (await call("admin/history")).json();
    $("#history").innerHTML = changes.map((c, i) => `<div class="hrow"><div class="hmsg">${esc(c.message)}<span>${esc(fmtWhen(c.created_at))} · ${esc(c.name || c.email || "")}${i === 0 ? " · latest" : ""}</span></div>
      <button class="btn btn-ghost btn-sm" data-undo="${c.id}" data-msg="${esc(c.message)}">Undo</button></div>`).join("") || '<p class="muted">No changes yet.</p>';
  } catch (e) { $("#history").innerHTML = `<p class="msg err">${esc(e.message)}</p>`; }
}
$("#history").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-undo]");
  if (!b) return;
  if (!confirm(`Undo "${b.dataset.msg}"?\n\nThat course goes back to how it was right before this change. Any later edits to the same course are replaced too.`)) return;
  b.disabled = true;
  try {
    await call("admin/undo", { changeId: Number(b.dataset.undo) });
    flash("Undone. Everyone sees the change right away.");
    loadCourses(); loadHistory();
  } catch (err) { b.disabled = false; alert("Couldn't undo: " + err.message); }
});
function flash(text) { msg($("#extractMsg"), text, "ok"); window.scrollTo({ top: 0, behavior: "smooth" }); }

// ---------------------------------------------------------------- choose a source
let pdfFile = null;
const drop = $("#drop");
drop.addEventListener("click", () => $("#file").click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });
$("#file").addEventListener("change", (e) => setFile(e.target.files[0]));
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));
function setFile(f) {
  if (!f) return;
  if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { msg($("#extractMsg"), "Please drop a PDF. For a web page, paste its address instead.", "err"); return; }
  if (f.size > 25 * 1024 * 1024) { msg($("#extractMsg"), "That PDF is over 25 MB.", "err"); return; }
  pdfFile = f;
  $("#url").value = "";
  drop.classList.add("has-file");
  $("#fileName").textContent = f.name + " · " + Math.round(f.size / 1024) + " KB";
  msg($("#extractMsg"), "");
}
$("#url").addEventListener("input", () => { if ($("#url").value.trim()) { pdfFile = null; drop.classList.remove("has-file"); $("#fileName").textContent = ""; } });

// PDF hyperlinks (Canvas reading links hide under titles) with the words they sit on.
async function pdfLinks(buf) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out = [], seen = new Set();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const [annots, text] = await Promise.all([page.getAnnotations(), page.getTextContent()]);
    for (const a of annots) {
      if (a.subtype !== "Link" || !a.url || a.url.startsWith("mailto:")) continue;
      const [x1, y1, x2, y2] = a.rect;
      const words = text.items.filter((t) => {
        const x = t.transform[4], y = t.transform[5];
        return x >= x1 - 2 && x <= x2 + 2 && y >= y1 - 4 && y <= y2 + 2;
      }).map((t) => t.str).join(" ").replace(/\s+/g, " ").trim();
      const key = a.url + "|" + words;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ page: p, text: words.slice(0, 160), url: a.url });
    }
  }
  return out;
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function extractionContext() {
  const registry = Object.entries(REG).filter(([id]) => id !== "PROGRAM").map(([id, r]) => ({
    id, code: r.code, name: r.name,
    faculty: ((current[id] && current[id].faculty) || r.faculty || []).map((f) => f.name).join(", ")
  }));
  const sessions = (E.sessions || []).map((s) => `${s.date} ${s.start || ""}-${s.end || ""} ${s.course || "PROGRAM"} ${s.name || s.title}${s.instructor ? " (" + s.instructor + ")" : ""}`);
  const existing = [];
  Object.values(current).forEach((c) => c.items.forEach((it) =>
    existing.push(`${c.id} | ${it.id} | ${it.type} | ${it.title} | ${it.date || "TBA"} ${it.time || ""}${it.points != null ? " | " + it.points + "%" : ""}`)));
  return { today, registry, classWeekends: E.program.classWeekends, sessions, existing };
}

// ---------------------------------------------------------------- extract
let draft = null;
$("#extractBtn").addEventListener("click", async () => {
  const url = $("#url").value.trim();
  if (!pdfFile && !url) { msg($("#extractMsg"), "Drop a PDF or paste a web address first.", "err"); return; }
  const btn = $("#extractBtn");
  btn.disabled = true;
  msg($("#extractMsg"), "");
  $("#previewCard").hidden = true;
  $("#progress").hidden = false;
  const setP = (t) => { $("#progressText").textContent = t; };
  try {
    const body = { courseHint: $("#courseHint").value || null, notes: $("#notes").value.trim() || null, context: extractionContext() };
    if (pdfFile) {
      setP("Reading the PDF…");
      const buf = await pdfFile.arrayBuffer();
      body.pdf = toBase64(buf);
      try { body.pdfLinks = await pdfLinks(buf.slice(0)); } catch (e) { console.warn("[admin] link extraction failed", e); body.pdfLinks = []; }
      body.sourceLabel = pdfFile.name;
    } else {
      body.url = url;
      body.sourceLabel = url;
    }
    setP("Sending to Claude…");
    const res = await call("admin/extract", body);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", result = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "status") setP(ev.message);
        if (ev.type === "progress") setP(`Claude is reading the syllabus… ${ev.seconds}s` + (ev.chars ? ` · ${Math.round(ev.chars / 1000)}K characters written` : " · thinking"));
        if (ev.type === "error") throw new Error(ev.message);
        if (ev.type === "result") result = ev;
      }
    }
    if (!result) throw new Error("The connection closed before Claude finished. Try again.");
    draft = result;
    renderPreview();
  } catch (e) {
    msg($("#extractMsg"), e.message, "err");
  } finally {
    btn.disabled = false;
    $("#progress").hidden = true;
  }
});

// ---------------------------------------------------------------- preview + publish
function diff(next, prev) {
  const before = Object.fromEntries(((prev && prev.items) || []).map((i) => [i.id, i]));
  const after = Object.fromEntries(next.items.map((i) => [i.id, i]));
  const added = next.items.filter((i) => !before[i.id]);
  const changed = next.items.filter((i) => before[i.id] && JSON.stringify(strip(before[i.id])) !== JSON.stringify(strip(i)));
  const removed = ((prev && prev.items) || []).filter((i) => !after[i.id]);
  return { added, changed, removed };
}
const strip = (i) => ({ t: i.title, d: i.date, tm: i.time, p: i.points, m: i.mode, r: i.required, l: (i.links || []).map((x) => x.url) });

// Re-imports sometimes give an existing item a new id. If a "new" item has the same type and title as one
// that would be removed, keep the old id: no duplicate in the planner, and students' checkmarks stay.
const titleKey = (i) => i.type + "|" + String(i.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function keepIds(c, prev) {
  if (!prev) return 0;
  const ids = new Set(c.items.map((i) => i.id));
  const orphans = new Map();
  prev.items.filter((i) => !ids.has(i.id)).forEach((i) => { if (!orphans.has(titleKey(i))) orphans.set(titleKey(i), i.id); });
  const before = new Set(prev.items.map((i) => i.id));
  let n = 0;
  c.items.forEach((i) => {
    if (before.has(i.id)) return;
    const old = orphans.get(titleKey(i));
    if (old) { i.id = old; orphans.delete(titleKey(i)); n++; }
  });
  return n;
}

function renderPreview() {
  const c = draft.course;
  const prev = current[c.id];
  const kept = keepIds(c, prev);
  const r = REG[c.id] || {};
  const d = diff(c, prev);
  const counts = {};
  c.items.forEach((i) => { counts[i.type] = (counts[i.type] || 0) + 1; });
  const newIds = new Set(d.added.map((i) => i.id)), chgIds = new Set(d.changed.map((i) => i.id));
  const warnings = draft.warnings.concat(c.items.filter((i) => i.verify).map((i) => `${i.title}: ${i.verify}`));
  const items = c.items.slice().sort((a, b) => ((a.date || "9") + (a.time || "")).localeCompare((b.date || "9") + (b.time || "")));
  $("#previewCard").innerHTML = `
    <div class="pv-head" style="--c:${r.color || "#00356b"}">
      <div><h2><small>${esc(c.code)}</small>${esc(c.name)}</h2>
      <div class="muted">${esc(c.term || "")} · ${esc((c.faculty || []).map((f) => f.name).join(", ") || "faculty not listed")}</div></div>
      <div class="muted">${prev ? "Updates the existing course" : "New course"}</div>
    </div>
    <p>${esc(draft.summary)}</p>
    ${kept ? `<p class="muted">✓ Matched ${kept} item${kept === 1 ? "" : "s"} to ${kept === 1 ? "its" : "their"} existing planner entr${kept === 1 ? "y" : "ies"} by title, so nothing is duplicated and checkmarks stay.</p>` : ""}
    <div class="chips">${Object.entries(counts).map(([k, n]) => `<span class="chipx">${n} ${k}${n > 1 ? "s" : ""}</span>`).join("")}
      ${prev ? `<span class="chipx add">+${d.added.length} new</span><span class="chipx chg">${d.changed.length} changed</span><span class="chipx del">${d.removed.length} removed</span>` : ""}</div>
    ${c.grading && c.grading.length ? `<div class="muted"><b>Grading:</b> ${c.grading.map((g) => esc(g.weight + "% " + g.label)).join(" · ")}</div>` : ""}
    ${warnings.length ? `<div class="warn-box"><b>⚠ Check before publishing (${warnings.length})</b><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
    ${d.removed.length ? `<div class="warn-box"><b>Will be removed from the planner:</b><ul>${d.removed.map((i) => `<li>${esc(i.title)} (${esc(fmtDate(i.date))})</li>`).join("")}</ul></div>` : ""}
    <h3>Items</h3>
    <div class="table-scroll"><table class="pv-table"><thead><tr><th>Date</th><th>Type</th><th>Title</th><th class="num">Points</th><th>Work</th><th>Req.</th><th>Links</th></tr></thead><tbody>
    ${items.map((i) => `<tr class="${newIds.has(i.id) ? "is-new" : chgIds.has(i.id) ? "is-chg" : ""}">
      <td>${esc(fmtDate(i.date))}${i.time ? "<br><span class='muted'>" + esc(i.time) + "</span>" : ""}</td>
      <td>${esc(i.type)}</td><td>${esc(i.title)}${i.verify ? " ⚠" : ""}</td>
      <td class="num">${i.points != null ? esc(i.points) + "%" : ""}</td><td>${esc(i.mode || "")}</td>
      <td>${i.required === false ? "optional" : i.required ? "required" : ""}</td>
      <td>${(i.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(" ")}</td></tr>`).join("")}
    </tbody></table></div>
    <details class="json"><summary>Edit the raw data (advanced)</summary><textarea id="draftJson" spellcheck="false">${esc(JSON.stringify(c, null, 2))}</textarea></details>
    <div class="pv-actions">
      <button class="btn btn-lg" id="publishBtn">Publish to planner</button>
      <button class="btn btn-ghost" id="discardBtn">Discard</button>
      <span class="msg" id="publishMsg"></span>
    </div>`;
  $("#previewCard").hidden = false;
  $("#previewCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#previewCard").addEventListener("click", async (e) => {
  if (e.target.id === "discardBtn") { draft = null; $("#previewCard").hidden = true; return; }
  if (e.target.id !== "publishBtn") return;
  let course;
  try { course = JSON.parse($("#draftJson").value); } catch (err) { msg($("#publishMsg"), "The raw data isn't valid JSON: " + err.message, "err"); return; }
  const btn = e.target;
  btn.disabled = true;
  msg($("#publishMsg"), "Publishing…");
  try {
    await call("admin/publish", { course });
    current[course.id] = course;
    draft = null;
    $("#previewCard").hidden = true;
    pdfFile = null; drop.classList.remove("has-file"); $("#fileName").textContent = ""; $("#url").value = ""; $("#notes").value = "";
    flash(`Published ${course.code} ${course.name}. It's live for everyone now.`);
    loadCourses(); loadHistory();
  } catch (err) {
    btn.disabled = false;
    msg($("#publishMsg"), "Couldn't publish: " + err.message, "err");
  }
});

loadCourses().then(loadCanvas); loadHistory(); loadTokens(); loadInbox();
