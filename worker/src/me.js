// The signed-in student's own state: name, checkmarks (synced across devices), my courses, notes.
import { HttpError, json, body, nowIso, randomToken, text } from "./util.js";
import { publicUser } from "./auth.js";

const NOTE_MAX = 2000;

export async function me(env, user) {
  const [done, settings, notes] = await Promise.all([
    env.DB.prepare("SELECT item_id FROM completions WHERE user_id = ?").bind(user.id).all(),
    env.DB.prepare("SELECT my_courses FROM user_settings WHERE user_id = ?").bind(user.id).first(),
    env.DB.prepare("SELECT item_id, note FROM item_notes WHERE user_id = ?").bind(user.id).all()
  ]);
  return json({
    user: publicUser(user),
    done: done.results.map((r) => r.item_id),
    myCourses: settings && settings.my_courses ? JSON.parse(settings.my_courses) : null,
    notes: Object.fromEntries(notes.results.map((r) => [r.item_id, r.note]))
  });
}

export async function setName(request, env, user) {
  const { name } = await body(request);
  await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(text(name, 60, "Name"), user.id).run();
  return json({ ok: true });
}

export async function setDone(request, env, user) {
  const { itemId, done } = await body(request);
  const id = text(itemId, 80, "Item");
  if (done) await env.DB.prepare("INSERT OR IGNORE INTO completions (user_id, item_id, done_at) VALUES (?, ?, ?)").bind(user.id, id, nowIso()).run();
  else await env.DB.prepare("DELETE FROM completions WHERE user_id = ? AND item_id = ?").bind(user.id, id).run();
  return json({ ok: true });
}

/** A student's private note on one item; an empty note deletes it. */
export async function setNote(request, env, user) {
  const { itemId, note } = await body(request);
  const id = text(itemId, 80, "Item");
  const n = String(note == null ? "" : note);
  if (n.length > NOTE_MAX) throw new HttpError(400, "Notes can be up to " + NOTE_MAX + " characters.");
  if (!n.trim()) await env.DB.prepare("DELETE FROM item_notes WHERE user_id = ? AND item_id = ?").bind(user.id, id).run();
  else await env.DB.prepare("INSERT INTO item_notes (user_id, item_id, note, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, item_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at")
    .bind(user.id, id, n, nowIso()).run();
  return json({ ok: true });
}

/** One-time merge of checkmarks a student made before accounts existed (saved in their browser). */
export async function importDone(request, env, user) {
  const { ids } = await body(request);
  if (!Array.isArray(ids)) throw new HttpError(400, "ids must be a list.");
  const now = nowIso();
  const stmts = ids.slice(0, 2000).filter((x) => typeof x === "string" && x.length <= 80)
    .map((id) => env.DB.prepare("INSERT OR IGNORE INTO completions (user_id, item_id, done_at) VALUES (?, ?, ?)").bind(user.id, id, now));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, imported: stmts.length });
}

export async function setMyCourses(request, env, user) {
  const { courses } = await body(request);
  if (courses !== null && (!Array.isArray(courses) || courses.some((c) => !/^MGT\d{3}$/.test(c)))) throw new HttpError(400, "Invalid course list.");
  await env.DB.prepare("INSERT INTO user_settings (user_id, my_courses) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET my_courses = excluded.my_courses")
    .bind(user.id, courses === null ? null : JSON.stringify(courses)).run();
  return json({ ok: true });
}

/** New secret for this student's calendar links; old subscriptions stop working. */
export async function resetCalToken(env, user) {
  const t = randomToken(24);
  await env.DB.prepare("UPDATE users SET cal_token = ? WHERE id = ?").bind(t, user.id).run();
  return json({ calToken: t });
}
