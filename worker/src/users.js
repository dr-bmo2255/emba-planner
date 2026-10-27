// Maintainer view of accounts: who has signed up, who is active, and who else may manage the planner.
// Accounts listed in the ADMIN_EMAILS secret are "owners": always admin, can't be demoted here.
import { HttpError, json, body, nowIso, randomToken, logEvent, who } from "./util.js";

const YALE = /^[a-z0-9._%+-]+@yale\.edu$/;
const ACTIVE_DAYS = 30;

function owners(env) {
  return new Set((env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean));
}

export async function listUsers(env) {
  const since = new Date(Date.now() - ACTIVE_DAYS * 864e5).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.role, u.created_at, " +
    "(SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_sign_in, " +
    "(SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions, " +
    "(SELECT COUNT(*) FROM completions c WHERE c.user_id = u.id) AS done " +
    "FROM users u ORDER BY (u.role = 'admin') DESC, COALESCE(u.name, u.email)"
  ).bind(nowIso()).all();
  const own = owners(env);
  const users = results.map((u) => ({
    ...u,
    owner: own.has(u.email),
    active: u.sessions > 0 && !!u.last_sign_in && u.last_sign_in >= since,
    pending: !u.last_sign_in // added as an admin before they ever signed in
  }));
  return json({ users, activeDays: ACTIVE_DAYS });
}

/** GET /api/admin/log?kind=user|admin|team[&before=<id>]: newest 50 entries of one change log. */
export async function changeLog(env, url) {
  const kind = url.searchParams.get("kind");
  if (!["user", "admin", "team"].includes(kind)) throw new HttpError(400, "Unknown log.");
  const before = Number(url.searchParams.get("before")) || 2 ** 53;
  const { results } = await env.DB.prepare(
    "SELECT l.id, l.message, l.created_at, u.name AS actor_name, u.email AS actor_email FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id " +
    "WHERE l.kind = ? AND l.id < ? ORDER BY l.id DESC LIMIT 51"
  ).bind(kind, before).all();
  return json({ entries: results.slice(0, 50), more: results.length > 50 });
}

/** { userId | email, role: "admin" | "student" }. An email that hasn't signed in yet gets an account waiting for them. */
export async function setRole(request, env, actor) {
  const b = await body(request);
  const role = b.role;
  if (role !== "admin" && role !== "student") throw new HttpError(400, "Role must be admin or student.");
  let user;
  if (b.userId != null) {
    user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(Number(b.userId)).first();
  } else {
    const email = String(b.email || "").trim().toLowerCase();
    if (!YALE.test(email)) throw new HttpError(400, "Use a @yale.edu email address.");
    user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (!user) {
      if (role !== "admin") throw new HttpError(404, "No account with that email.");
      await env.DB.prepare("INSERT INTO users (email, role, cal_token, created_at) VALUES (?, 'admin', ?, ?)")
        .bind(email, randomToken(24), nowIso()).run();
      await logEvent(env, "admin", actor.id, `${who(actor)} added ${email} as an admin (takes effect at their first sign-in)`);
      return json({ ok: true, created: true });
    }
  }
  if (!user) throw new HttpError(404, "No such account.");
  if (role === "student") {
    if (owners(env).has(user.email)) throw new HttpError(400, "That account is the planner's owner and always stays an admin.");
    if (user.id === actor.id) throw new HttpError(400, "You can't remove your own admin access. Ask another admin.");
  }
  if (user.role === role) return json({ ok: true });
  await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, user.id).run();
  await logEvent(env, "admin", actor.id, role === "admin" ? `${who(actor)} made ${who(user)} an admin` : `${who(actor)} removed admin access from ${who(user)}`);
  return json({ ok: true });
}
