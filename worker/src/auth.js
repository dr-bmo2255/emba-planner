// Sign-in with a 6-digit code emailed to a @yale.edu address; 90-day HttpOnly session cookie.
import { HttpError, json, body, nowIso, addDays, sha256, randomToken, safeEqual, cookies } from "./util.js";
import { sendLoginCode } from "./email.js";

const SESSION_DAYS = 90;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const YALE = /^[a-z0-9._%+-]+@yale\.edu$/;

/** Fixed-window limiter: at most `max` hits per `minutes` for `key`. */
async function rateLimit(env, key, max, minutes) {
  const row = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first();
  const now = Date.now();
  if (!row || now - Date.parse(row.window_start) > minutes * 60e3) {
    await env.DB.prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start")
      .bind(key, new Date(now).toISOString()).run();
    return;
  }
  if (row.count >= max) throw new HttpError(429, "Too many attempts. Please wait a while and try again.");
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
}

export async function startLogin(request, env) {
  const { email: raw } = await body(request);
  const email = String(raw || "").trim().toLowerCase();
  if (!YALE.test(email)) throw new HttpError(400, "Use your @yale.edu email address.");
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  await rateLimit(env, "code:" + email, 5, 60);
  await rateLimit(env, "ip:" + ip, 30, 60);

  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(n).padStart(6, "0");
  await env.DB.prepare(
    "INSERT INTO login_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0) " +
    "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0"
  ).bind(email, await sha256(email + ":" + code), new Date(Date.now() + CODE_MINUTES * 60e3).toISOString()).run();

  await sendLoginCode(env, email, code);
  // Local development only: show the code on screen instead of emailing it.
  return json({ ok: true, ...(env.DEV_SHOW_CODES === "1" ? { devCode: code } : {}) });
}

export async function verifyLogin(request, env) {
  const { email: raw, code: rawCode } = await body(request);
  const email = String(raw || "").trim().toLowerCase();
  const code = String(rawCode || "").replace(/\D/g, "");
  const row = await env.DB.prepare("SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?").bind(email).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new HttpError(400, "That code has expired. Request a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "Too many wrong codes. Request a new one.");
  if (!(await safeEqual(row.code_hash, await sha256(email + ":" + code)))) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    throw new HttpError(400, "That code isn't right. Check the email and try again.");
  }
  await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();

  let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const admins = (env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim());
  if (!user) {
    await env.DB.prepare("INSERT INTO users (email, role, cal_token, created_at) VALUES (?, ?, ?, ?)")
      .bind(email, admins.includes(email) ? "admin" : "student", randomToken(24), nowIso()).run();
    user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  } else if (user.role !== "admin" && admins.includes(email)) {
    // Owners (ADMIN_EMAILS) are always admins, even if the role was changed in the database.
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.id).run();
    user.role = "admin";
  }
  const token = randomToken(32);
  await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), user.id, nowIso(), addDays(SESSION_DAYS)).run();
  return json({ ok: true, user: publicUser(user) }, 200, { "Set-Cookie": sessionCookie(token, SESSION_DAYS * 86400) });
}

export async function logout(request, env) {
  const sid = cookies(request).sid;
  if (sid) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(sid)).run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

function sessionCookie(token, maxAge) {
  return "sid=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}

/** The signed-in user (session cookie, or a personal API token as a Bearer header), or null. */
export async function currentUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    return await env.DB.prepare("SELECT u.* FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.id = ?")
      .bind(await sha256(auth.slice(7).trim())).first();
  }
  const sid = cookies(request).sid;
  if (!sid) return null;
  return await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?")
    .bind(await sha256(sid), nowIso()).first();
}

export function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, calToken: u.cal_token };
}

export function requireAdmin(user) {
  if (!user || user.role !== "admin") throw new HttpError(403, "Only the planner's maintainer can do that.");
}
