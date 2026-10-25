// Course data in D1. Documents: 'program', 'sessions', 'course:<ID>'. Every change is logged
// in doc_changes (before + after) so the maintainer can undo any of them.
import { HttpError, json, body, nowIso, sha256, randomToken, isDate, isTime } from "./util.js";
import { requireAdmin } from "./auth.js";

export async function loadAll(env) {
  const { results } = await env.DB.prepare("SELECT key, json, updated_at FROM docs").all();
  const out = { program: null, sessions: [], courses: [], updated: null };
  for (const r of results) {
    if (!out.updated || r.updated_at > out.updated) out.updated = r.updated_at;
    const v = JSON.parse(r.json);
    if (r.key === "program") out.program = v;
    else if (r.key === "sessions") out.sessions = v.sessions || v;
    else if (r.key.startsWith("course:")) out.courses.push(v);
  }
  out.courses.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export async function getData(env) {
  return json(await loadAll(env));
}

async function writeDoc(env, user, key, after, message) {
  const prev = await env.DB.prepare("SELECT json FROM docs WHERE key = ?").bind(key).first();
  const stmts = [];
  if (after == null) stmts.push(env.DB.prepare("DELETE FROM docs WHERE key = ?").bind(key));
  else stmts.push(env.DB.prepare("INSERT INTO docs (key, json, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(key, after, nowIso(), user.id));
  stmts.push(env.DB.prepare("INSERT INTO doc_changes (key, before_json, after_json, message, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(key, prev ? prev.json : null, after, message, user.id, nowIso()));
  await env.DB.batch(stmts);
}

export async function publishCourse(request, env, user) {
  requireAdmin(user);
  const { course: c } = await body(request);
  if (!c || !/^MGT\d{3}$/.test(c.id || "") || !Array.isArray(c.items)) throw new HttpError(400, "Missing or invalid course data.");
  const existing = await env.DB.prepare("SELECT 1 FROM docs WHERE key = ?").bind("course:" + c.id).first();
  const src = c.source && (c.source.url || c.source.file) ? ", from " + (c.source.url || c.source.file) : "";
  await writeDoc(env, user, "course:" + c.id, JSON.stringify(c), (existing ? "Update " : "Add ") + c.code + " " + c.name + src);
  return json({ ok: true });
}

/** Edit fields of one imported item, e.g. set "group" once the professor decides. Undoable. */
export async function editItem(request, env, user) {
  requireAdmin(user);
  const { courseId, itemId, changes } = await body(request);
  const key = "course:" + courseId;
  const row = await env.DB.prepare("SELECT json FROM docs WHERE key = ?").bind(key).first();
  if (!row) throw new HttpError(404, "Course not found.");
  const c = JSON.parse(row.json);
  const it = (c.items || []).find((x) => x.id === itemId);
  if (!it) throw new HttpError(404, "Item not found.");
  const ch = changes || {};
  const said = [];
  const set = (k, v, label) => {
    const before = it[k] == null ? null : it[k];
    if (v === before) return;
    if (v == null) delete it[k]; else it[k] = v;
    said.push(label);
  };
  if ("title" in ch) {
    const t = String(ch.title || "").trim();
    if (!t || t.length > 200) throw new HttpError(400, "Title is required (max 200 characters).");
    set("title", t, "title");
  }
  if ("date" in ch) {
    if (ch.date !== null && !isDate(ch.date)) throw new HttpError(400, "Invalid date.");
    set("date", ch.date, "date");
  }
  if ("time" in ch) {
    if (ch.time !== null && !isTime(ch.time)) throw new HttpError(400, "Invalid time.");
    set("time", ch.time, "time");
  }
  if ("points" in ch) {
    const p = ch.points === null || ch.points === "" ? null : Number(ch.points);
    if (p !== null && (!isFinite(p) || p < 0 || p > 100)) throw new HttpError(400, "Points must be a percent from 0 to 100.");
    set("points", p, "points " + (p == null ? "unset" : p + "%"));
  }
  if ("mode" in ch) {
    if (![null, "individual", "group"].includes(ch.mode)) throw new HttpError(400, "Work must be individual, group, or not yet specified.");
    set("mode", ch.mode, ch.mode ? ch.mode : "work not yet specified");
  }
  if ("required" in ch) {
    if (![null, true, false].includes(ch.required)) throw new HttpError(400, "Invalid requirement.");
    set("required", ch.required, ch.required === false ? "optional" : "required");
  }
  for (const [k, max] of [["notes", 1000], ["verify", 500]]) {
    if (!(k in ch)) continue;
    const v = ch[k] == null || String(ch[k]).trim() === "" ? null : String(ch[k]).trim();
    if (v && v.length > max) throw new HttpError(400, k + " is too long (max " + max + ").");
    set(k, v, k === "verify" ? (v ? "verify note" : "confirmed") : "notes");
  }
  if (!said.length) return json({ ok: true, item: it, unchanged: true });
  await writeDoc(env, user, key, JSON.stringify(c), "Edit " + c.code + ": " + it.title + " (" + said.join(", ") + ")");
  return json({ ok: true, item: it });
}

export async function removeCourse(request, env, user) {
  requireAdmin(user);
  const { id } = await body(request);
  const row = await env.DB.prepare("SELECT json FROM docs WHERE key = ?").bind("course:" + id).first();
  if (!row) throw new HttpError(404, "That course has no data.");
  const c = JSON.parse(row.json);
  await writeDoc(env, user, "course:" + id, null, "Remove " + c.code + " " + c.name);
  return json({ ok: true });
}

export async function history(env, user) {
  requireAdmin(user);
  const { results } = await env.DB.prepare(
    "SELECT c.id, c.key, c.message, c.created_at, u.name, u.email FROM doc_changes c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.id DESC LIMIT 30"
  ).all();
  return json({ changes: results });
}

export async function undo(request, env, user) {
  requireAdmin(user);
  const { changeId } = await body(request);
  const ch = await env.DB.prepare("SELECT * FROM doc_changes WHERE id = ?").bind(changeId).first();
  if (!ch) throw new HttpError(404, "Change not found.");
  await writeDoc(env, user, ch.key, ch.before_json, "Undo: " + ch.message);
  return json({ ok: true });
}

// Personal API tokens (the iPhone shortcut sends one as "Authorization: Bearer ...").
export async function listTokens(env, user) {
  requireAdmin(user);
  const { results } = await env.DB.prepare("SELECT substr(id, 1, 8) AS ref, label, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
  return json({ tokens: results });
}
export async function createToken(request, env, user) {
  requireAdmin(user);
  const { label } = await body(request);
  const token = "emba_" + randomToken(32);
  await env.DB.prepare("INSERT INTO api_tokens (id, user_id, label, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), user.id, String(label || "iPhone shortcut").slice(0, 60), nowIso()).run();
  return json({ token }); // shown once; only the hash is stored
}
export async function deleteToken(request, env, user) {
  requireAdmin(user);
  const { ref } = await body(request);
  await env.DB.prepare("DELETE FROM api_tokens WHERE user_id = ? AND substr(id, 1, 8) = ?").bind(user.id, String(ref)).run();
  return json({ ok: true });
}

// iPhone share sheet → inbox (KV, 7 days). Upload replies with the Manage courses link.
export async function inboxUpload(request, env, user) {
  requireAdmin(user);
  const buf = await request.arrayBuffer();
  if (String.fromCharCode(...new Uint8Array(buf.slice(0, 5))) !== "%PDF-") return new Response("That isn't a PDF. Share the syllabus PDF itself.", { status: 400 });
  if (buf.byteLength > 24 * 1024 * 1024) return new Response("That PDF is over 24 MB.", { status: 413 });
  const id = crypto.randomUUID();
  const name = decodeURIComponent(request.headers.get("x-filename") || "syllabus.pdf").replace(/[^\w .()+-]/g, "_").slice(0, 120);
  await env.INBOX.put(id, buf, { expirationTtl: 7 * 24 * 3600, metadata: { name, size: buf.byteLength, at: nowIso() } });
  return new Response(new URL(request.url).origin + "/admin.html?inbox=" + id, { headers: { "content-type": "text/plain" } });
}
export async function inboxGet(id, env, user) {
  requireAdmin(user);
  const { value, metadata } = await env.INBOX.getWithMetadata(id, { type: "arrayBuffer" });
  if (!value) throw new HttpError(404, "That upload has expired (files are kept 7 days). Share it again.");
  return new Response(value, { headers: { "content-type": "application/pdf", "x-filename": encodeURIComponent((metadata && metadata.name) || "syllabus.pdf") } });
}
