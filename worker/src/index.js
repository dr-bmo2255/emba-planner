// EMBA Planner Worker: serves the site (public/ static assets) and its API on one origin, so
// sign-in uses a first-party HttpOnly cookie.
//
//   /api/auth/*        sign in with an emailed code, sign out
//   /api/*             everything else requires a signed-in Yale user
//   /api/admin/*       maintainer only (users.role = 'admin': ADMIN_EMAILS owners, plus admins they add)
//   /v1/messages       "Ask the Planner" chat → Anthropic (signed-in users)
//   /cal/<token>/...   calendar feeds (secret per-user link; calendar apps can't sign in)
import { HttpError, json } from "./util.js";
import { startLogin, verifyLogin, logout, currentUser, requireAdmin } from "./auth.js";
import * as docs from "./docs.js";
import * as me from "./me.js";
import * as teams from "./teams.js";
import * as users from "./users.js";
import { handleProxy } from "./proxy.js";
import { handleCalendar } from "./calendar.js";
import { extractCourse, fetchSource } from "./extract.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/cal/")) return await handleCalendar(request, env);
      if (!path.startsWith("/api/") && path !== "/v1/messages") return env.ASSETS.fetch(request);

      // Refuse cross-site writes (cookies are SameSite=Lax too; this is belt and braces).
      const origin = request.headers.get("Origin");
      if (request.method !== "GET" && origin && origin !== url.origin) throw new HttpError(403, "Cross-site request refused.");

      if (path === "/api/auth/start" && request.method === "POST") return await startLogin(request, env);
      if (path === "/api/auth/verify" && request.method === "POST") return await verifyLogin(request, env);
      if (path === "/api/auth/logout" && request.method === "POST") return await logout(request, env);

      const user = await currentUser(request, env);
      if (!user) throw new HttpError(401, "Please sign in.");
      return await route(request, env, ctx, user, path);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  }
};

async function route(request, env, ctx, user, path) {
  const M = request.method;
  let m;
  if (path === "/v1/messages" && M === "POST") return await handleProxy(request, env, {}, user);

  if (path === "/api/data" && M === "GET") return await docs.getData(env);
  if (path === "/api/me" && M === "GET") return await me.me(env, user);
  if (path === "/api/me/name" && M === "PUT") return await me.setName(request, env, user);
  if (path === "/api/me/done" && M === "PUT") return await me.setDone(request, env, user);
  if (path === "/api/me/done/import" && M === "POST") return await me.importDone(request, env, user);
  if (path === "/api/me/courses" && M === "PUT") return await me.setMyCourses(request, env, user);
  if (path === "/api/me/notes" && M === "PUT") return await me.setNote(request, env, user);
  if (path === "/api/me/cal-token" && M === "POST") return await me.resetCalToken(env, user);

  if (path === "/api/teams" && M === "GET") return await teams.myTeams(env, user);
  if (path === "/api/teams" && M === "POST") return await teams.createTeam(request, env, user);
  if ((m = path.match(/^\/api\/teams\/([\w-]+)$/))) {
    if (M === "PATCH") return await teams.updateTeam(request, env, user, m[1]);
    if (M === "DELETE") return await teams.deleteTeam(env, user, m[1]);
  }
  if ((m = path.match(/^\/api\/teams\/([\w-]+)\/members\/(\d+)$/)) && M === "DELETE") return await teams.removeMember(env, user, m[1], m[2]);
  if ((m = path.match(/^\/api\/teams\/([\w-]+)\/meetings$/)) && M === "POST") return await teams.addMeeting(request, env, user, m[1]);
  if ((m = path.match(/^\/api\/meetings\/([\w-]+)$/))) {
    if (M === "PUT") return await teams.updateMeeting(request, env, user, m[1]);
    if (M === "DELETE") return await teams.deleteMeeting(env, user, m[1]);
  }
  if ((m = path.match(/^\/api\/meetings\/([\w-]+)\/skip$/)) && M === "POST") return await teams.skipMeeting(request, env, user, m[1]);
  if ((m = path.match(/^\/api\/join\/([\w-]+)$/))) {
    if (M === "GET") return await teams.previewInvite(env, user, m[1]);
    if (M === "POST") return await teams.joinTeam(env, user, m[1]);
  }

  if (path.startsWith("/api/admin/") || path === "/api/inbox") {
    requireAdmin(user);
    if (path === "/api/inbox" && M === "POST") return await docs.inboxUpload(request, env, user);
    if ((m = path.match(/^\/api\/admin\/inbox\/([a-z0-9-]+)$/)) && M === "GET") return await docs.inboxGet(m[1], env, user);
    if (path === "/api/admin/publish" && M === "POST") return await docs.publishCourse(request, env, user);
    if (path === "/api/admin/remove" && M === "POST") return await docs.removeCourse(request, env, user);
    if (path === "/api/admin/items/edit" && M === "POST") return await docs.editItem(request, env, user);
    if (path === "/api/admin/history" && M === "GET") return await docs.history(env, user);
    if (path === "/api/admin/undo" && M === "POST") return await docs.undo(request, env, user);
    if (path === "/api/admin/tokens" && M === "GET") return await docs.listTokens(env, user);
    if (path === "/api/admin/tokens" && M === "POST") return await docs.createToken(request, env, user);
    if (path === "/api/admin/tokens/delete" && M === "POST") return await docs.deleteToken(request, env, user);
    if (path === "/api/admin/teams" && M === "GET") return await teams.allTeams(env);
    if (path === "/api/admin/users" && M === "GET") return await users.listUsers(env);
    if (path === "/api/admin/users/role" && M === "POST") return await users.setRole(request, env, user);
    if (path === "/api/admin/status" && M === "GET") return json({ claude: env.ANTHROPIC_API_KEY ? "ok" : "not configured", email: env.EMAIL_MODE || "log" });
    if (path === "/api/admin/extract" && M === "POST") return extract(request, env, ctx);
  }
  throw new HttpError(404, "Not found.");
}

/** Streams newline-delimited JSON: progress heartbeats while Claude reads, then the result. */
async function extract(request, env, ctx) {
  const b = await request.json();
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const send = (o) => w.write(enc.encode(JSON.stringify(o) + "\n")).catch(() => {});
  const started = Date.now();
  let chars = 0;
  const beat = setInterval(() => send({ type: "progress", chars, seconds: Math.round((Date.now() - started) / 1000) }), 3000);
  const today = new Date().toISOString().slice(0, 10);
  ctx.waitUntil((async () => {
    try {
      const input = { pdf: b.pdf, pdfLinks: b.pdfLinks, sourceLabel: b.sourceLabel, courseHint: b.courseHint, notes: b.notes, context: b.context };
      if (b.url) {
        send({ type: "status", message: "Fetching the page…" });
        const src = await fetchSource(b.url);
        if (src.kind === "pdf") input.pdf = src.data; else input.pageText = src.text;
        input.sourceLabel = b.url;
      }
      send({ type: "status", message: "Claude is reading the syllabus…" });
      const result = await extractCourse(env, input, (p) => { chars = p.chars; });
      result.course.source = b.url ? { type: "web", url: b.url, updated: today } : { type: "syllabus", file: b.sourceLabel, updated: today };
      send({ type: "result", ...result });
    } catch (e) {
      send({ type: "error", message: e.message || String(e) });
    } finally {
      clearInterval(beat);
      w.close().catch(() => {});
    }
  })());
  return new Response(readable, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
