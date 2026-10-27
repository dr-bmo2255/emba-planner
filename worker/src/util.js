// Small helpers shared by the API modules.
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const nowIso = () => new Date().toISOString();
export const addDays = (days) => new Date(Date.now() + days * 864e5).toISOString();

export function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store", ...(headers || {}) } });
}

export async function body(request) {
  try { return await request.json(); } catch (e) { throw new HttpError(400, "Request body must be JSON."); }
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes || 32));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(String(s)))));
  return crypto.subtle.timingSafeEqual(x, y);
}

export function cookies(request) {
  const out = {};
  (request.headers.get("Cookie") || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Input checks: keep user-entered text short and plain.
export function text(v, max, field) {
  const s = String(v == null ? "" : v).trim();
  if (!s) throw new HttpError(400, (field || "Text") + " is required.");
  if (s.length > max) throw new HttpError(400, (field || "Text") + " is too long (max " + max + " characters).");
  return s;
}
export function optText(v, max, field) {
  if (v == null || String(v).trim() === "") return null;
  return text(v, max, field);
}
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s + "T12:00:00Z"));
export const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || "");

/**
 * Adds a line to an admin change log ("user", "admin", or "team"). Never fails the request it describes:
 * a logging error is printed and ignored.
 */
export async function logEvent(env, kind, actorId, message) {
  try {
    await env.DB.prepare("INSERT INTO audit_log (kind, message, actor_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(kind, String(message).slice(0, 500), actorId || null, nowIso()).run();
  } catch (e) { console.error("[log]", e); }
}

/** A person's display name for log lines: their name, else their email. */
export const who = (u) => (u && (u.name || u.email)) || "someone";
