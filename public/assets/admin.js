// Manage courses: maintainer-only page (signed-in account with the admin role). Changes save to
// the planner's database and show up for everyone immediately; every change can be undone.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
const fmtDate = (d) => d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "TBA";
const fmtWhen = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function msg(el, text, kind) { el.textContent = text || ""; el.className = "msg" + (kind ? " " + kind : ""); }

/** Raw fetch to an admin endpoint (some return streams or PDFs, so callers read the body). */
async function call(path, body) {
  const res = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin"
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "HTTP " + res.status); }
  return res;
}

// ---------------------------------------------------------------- access
let E, REG;
try {
  E = await window.loadPlannerData();
  REG = E.program.courseRegistry;
} catch (e) {
  $("#lockMsg").innerHTML = e.needsLogin ? 'Please <a href="./">sign in to the planner</a> first, then come back here.' : esc(e.message);
  throw e;
}
if (E.me.user.role !== "admin") {
  $("#lockMsg").innerHTML = "Only the planner's admins can manage courses. <a href=\"./\">Back to the planner</a>";
  throw new Error("not admin");
}
$("#lockCard").hidden = true;
$("#adminBody").hidden = false;
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
    msg($("#extractMsg"), "📱 Received from your phone: " + name + ". Pick the course if you like, then tap Read with Claude.", "ok");
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
$("#refreshBtn").addEventListener("click", () => { loadCourses(); loadHistory(); loadTeams(); loadUsers(); });
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

// ---------------------------------------------------------------- accounts + admins
let users = [];
async function loadUsers() {
  try {
    ({ users } = await (await call("admin/users")).json());
    renderUsers();
  } catch (e) { $("#userList").innerHTML = `<p class="msg err">${esc(e.message)}</p>`; }
}
function renderUsers() {
  const show = (document.querySelector("input[name=ushow]:checked") || {}).value || "all";
  const signedUp = users.filter((u) => !u.pending);
  $("#userCounts").textContent = `${signedUp.length} account${signedUp.length === 1 ? "" : "s"} · ${users.filter((u) => u.active).length} active · ${users.filter((u) => u.role === "admin").length} admin${users.filter((u) => u.role === "admin").length === 1 ? "" : "s"}`;
  const list = users.filter((u) => show === "all" || (show === "active" ? u.active : u.role === "admin"));
  const me = E.me.user.id;
  $("#userList").innerHTML = list.length ? list.map((u) => {
    const badges = (u.role === "admin" ? `<span class="ubadge admin">${u.owner ? "Owner" : "Admin"}</span>` : "") +
      (u.active ? '<span class="ubadge active">Active</span>' : "") + (u.pending ? '<span class="ubadge pending">Hasn\'t signed in yet</span>' : "");
    const facts = u.pending ? "Admin access waiting for their first sign-in" :
      `joined ${fmtDate(u.created_at.slice(0, 10))} · last sign-in ${u.last_sign_in ? fmtWhen(u.last_sign_in) : "never"} · ${u.done} item${u.done === 1 ? "" : "s"} checked off`;
    let btn = "";
    if (u.role === "admin" && !u.owner && u.id !== me) btn = `<button class="btn btn-danger btn-sm" data-role="student" data-uid="${u.id}" data-who="${esc(u.name || u.email)}">Remove admin</button>`;
    else if (u.role !== "admin") btn = `<button class="btn btn-ghost btn-sm" data-role="admin" data-uid="${u.id}" data-who="${esc(u.name || u.email)}">Make admin</button>`;
    return `<div class="crow urow" style="--c:${u.role === "admin" ? "#00356b" : "#c9d3df"}"><i class="sw"></i>
      <div class="cname"><b>${esc(u.name || u.email)}</b>${badges}<span style="display:block">${u.name ? esc(u.email) + " · " : ""}${esc(facts)}</span></div>${btn}</div>`;
  }).join("") : '<p class="muted">No accounts match.</p>';
}
document.querySelectorAll("input[name=ushow]").forEach((r) => r.addEventListener("change", renderUsers));
$("#userList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-role]");
  if (!b) return;
  const making = b.dataset.role === "admin";
  if (!confirm(making ? `Make ${b.dataset.who} an admin?\n\nThey'll be able to add, edit, and remove course data for everyone, see all accounts, and add or remove other admins.`
    : `Remove admin access from ${b.dataset.who}? They keep their student account.`)) return;
  b.disabled = true;
  try { await call("admin/users/role", { userId: Number(b.dataset.uid), role: b.dataset.role }); loadUsers(); }
  catch (err) { b.disabled = false; alert(err.message); }
});
$("#addAdmin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase();
  if (!confirm(`Make ${email} an admin?\n\nThey'll be able to add, edit, and remove course data for everyone, see all accounts, and add or remove other admins.`)) return;
  try {
    const r = await (await call("admin/users/role", { email, role: "admin" })).json();
    msg($("#addAdminMsg"), r.created ? `Done. ${email} becomes an admin the first time they sign in.` : `Done. ${email} is now an admin.`, "ok");
    e.target.reset();
    loadUsers();
  } catch (err) { msg($("#addAdminMsg"), err.message, "err"); }
});

// ---------------------------------------------------------------- teams overview
async function loadTeams() {
  const { teams } = await (await call("admin/teams")).json();
  $("#teamList").innerHTML = teams.length ? teams.map((t) => `<div class="crow" style="--c:${esc(t.color)}"><i class="sw"></i>
    <div class="cname"><b>${esc(t.name)}</b><span>${t.members} member${t.members === 1 ? "" : "s"} · made by ${esc(t.owner_name || t.owner_email || "?")} · ${esc(fmtWhen(t.created_at))}</span></div>
    <button class="btn btn-danger btn-sm" data-team-del="${esc(t.id)}" data-name="${esc(t.name)}">Remove</button></div>`).join("") : '<p class="muted">No teams yet.</p>';
}
$("#teamList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-team-del]");
  if (!b || !confirm(`Remove the team "${b.dataset.name}" and all its meetings for everyone? This can't be undone.`)) return;
  const res = await fetch("/api/teams/" + b.dataset.teamDel, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) alert("Couldn't remove it."); else loadTeams();
});

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

function renderPreview() {
  const c = draft.course;
  const prev = current[c.id];
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

loadCourses(); loadHistory(); loadTeams(); loadUsers(); loadTokens(); loadInbox();
