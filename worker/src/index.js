// EMBA Planner Worker.
//   GET  /calendar.ics       live calendar feed (public, read-only, anyone can subscribe)
//   POST /v1/messages        chat proxy for "Ask the Planner" (anyone on the planner site)
//   /admin/*                 course management, maintainer only (x-admin-passcode header)
//
// Secrets: ANTHROPIC_API_KEY, GITHUB_TOKEN (fine-grained, Contents read/write on GITHUB_REPO),
//          ADMIN_PASSCODE. Vars in wrangler.toml.
import { handleProxy, json } from "./proxy.js";
import { gh } from "./github.js";
import { extractCourse, fetchSource } from "./extract.js";
import { handleCalendar } from "./calendar.js";

const COURSES_DIR = "data/courses/";

export default {
  async fetch(request, env, ctx) {
    // The calendar feed is public: calendar apps send no Origin header.
    if (new URL(request.url).pathname === "/calendar.ics" && request.method === "GET") {
      try { return await handleCalendar(request, env, ctx); } catch (e) { return new Response("Calendar unavailable: " + e.message, { status: 502 }); }
    }
    // iPhone Shortcut upload: no browser, so no Origin header; the passcode is the gate.
    if (new URL(request.url).pathname === "/admin/inbox" && request.method === "POST" && !request.headers.get("Origin")) {
      if (!(await passcodeOk(request, env))) return new Response("Wrong passcode.", { status: 401 });
      return await inboxUpload(request, env);
    }
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      // The Anthropic SDK sends several x-stainless-* headers; echo what the preflight asks for.
      "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json({ error: { type: "forbidden", message: "Origin not allowed" } }, 403, cors);

    const path = new URL(request.url).pathname;
    try {
      if (path === "/v1/messages" && request.method === "POST") return await handleProxy(request, env, cors);
      if (path.startsWith("/admin/")) {
        if (!(await passcodeOk(request, env))) return json({ error: "Wrong passcode." }, 401, cors);
        return await handleAdmin(path, request, env, ctx, cors);
      }
    } catch (e) {
      return json({ error: e.message || String(e) }, 500, cors);
    }
    return json({ error: { type: "not_found", message: "Not found" } }, 404, cors);
  }
};

// Stores a PDF from the iPhone share sheet and replies with the Manage courses link to open.
async function inboxUpload(request, env) {
  const buf = await request.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 5));
  if (String.fromCharCode(...head) !== "%PDF-") return new Response("That isn't a PDF. Share the syllabus PDF itself.", { status: 400 });
  if (buf.byteLength > 24 * 1024 * 1024) return new Response("That PDF is over 24 MB.", { status: 413 });
  const id = crypto.randomUUID();
  const name = decodeURIComponent(request.headers.get("x-filename") || "syllabus.pdf").replace(/[^\w .()+-]/g, "_").slice(0, 120);
  await env.INBOX.put(id, buf, { expirationTtl: 7 * 24 * 3600, metadata: { name, size: buf.byteLength, at: new Date().toISOString() } });
  return new Response(env.SITE_URL + "admin.html?inbox=" + id, { headers: { "content-type": "text/plain" } });
}

// Compare SHA-256 digests in constant time so the passcode can't be guessed by timing.
async function passcodeOk(request, env) {
  const given = request.headers.get("x-admin-passcode") || "";
  if (!env.ADMIN_PASSCODE || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, env.ADMIN_PASSCODE].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function handleAdmin(path, request, env, ctx, cors) {
  const repo = gh(env);
  // Read a file the phone sent: GET /admin/inbox/<id> (the Manage courses page opens it).
  const inboxMatch = path.match(/^\/admin\/inbox\/([a-z0-9-]+)$/);
  if (inboxMatch && request.method === "GET") {
    const { value, metadata } = await env.INBOX.getWithMetadata(inboxMatch[1], { type: "arrayBuffer" });
    if (!value) return json({ error: "That upload has expired (files are kept 7 days). Share it again." }, 404, cors);
    return new Response(value, { headers: { ...cors, "content-type": "application/pdf", "x-filename": encodeURIComponent((metadata && metadata.name) || "syllabus.pdf"), "access-control-expose-headers": "x-filename" } });
  }
  const body = request.method === "POST" ? await request.json() : {};
  const today = new Date().toISOString().slice(0, 10);

  if (path === "/admin/ping") {
    let github = "not configured";
    if (env.GITHUB_TOKEN) {
      try { await repo.readFile(COURSES_DIR + "index.json"); github = "ok"; } catch (e) { github = "error: " + e.message; }
    }
    return json({ ok: true, claude: env.ANTHROPIC_API_KEY ? "ok" : "not configured", github, repo: env.GITHUB_REPO }, 200, cors);
  }

  if (path === "/admin/extract") {
    // Stream newline-delimited JSON: progress heartbeats while Claude reads, then the result.
    const { readable, writable } = new TransformStream();
    const w = writable.getWriter();
    const enc = new TextEncoder();
    const send = (o) => w.write(enc.encode(JSON.stringify(o) + "\n")).catch(() => {});
    const started = Date.now();
    let chars = 0;
    const beat = setInterval(() => send({ type: "progress", chars, seconds: Math.round((Date.now() - started) / 1000) }), 3000);
    ctx.waitUntil((async () => {
      try {
        const input = { pdf: body.pdf, pdfLinks: body.pdfLinks, sourceLabel: body.sourceLabel, courseHint: body.courseHint, notes: body.notes, context: body.context };
        if (body.url) {
          send({ type: "status", message: "Fetching the page…" });
          const src = await fetchSource(body.url);
          if (src.kind === "pdf") input.pdf = src.data; else input.pageText = src.text;
          input.sourceLabel = body.url;
        }
        send({ type: "status", message: "Claude is reading the syllabus…" });
        const result = await extractCourse(env, input, (p) => { chars = p.chars; });
        result.course.source = body.url ? { type: "web", url: body.url, updated: today } : { type: "syllabus", file: body.sourceLabel, updated: today };
        send({ type: "result", ...result });
      } catch (e) {
        send({ type: "error", message: e.message || String(e) });
      } finally {
        clearInterval(beat);
        w.close().catch(() => {});
      }
    })());
    return new Response(readable, { headers: { ...cors, "content-type": "application/x-ndjson", "cache-control": "no-store" } });
  }

  if (path === "/admin/publish") {
    const c = body.course;
    if (!c || !/^MGT\d{3}$/.test(c.id || "")) return json({ error: "Missing or invalid course id." }, 400, cors);
    const index = JSON.parse((await repo.readFile(COURSES_DIR + "index.json")) || '{"courses":[]}');
    const isNew = !index.courses.includes(c.id);
    index.courses = [...new Set([...index.courses, c.id])].sort();
    index.updated = today;
    const res = await repo.commit([
      { path: COURSES_DIR + c.id + ".json", content: JSON.stringify(c, null, 2) + "\n" },
      { path: COURSES_DIR + "index.json", content: JSON.stringify(index, null, 2) + "\n" }
    ], (isNew ? "Add " : "Update ") + c.code + " " + c.name + " (via Manage courses" + (c.source && c.source.url ? ", from " + c.source.url : c.source && c.source.file ? ", from " + c.source.file : "") + ")");
    return json({ ok: true, ...res }, 200, cors);
  }

  if (path === "/admin/remove") {
    const id = body.id;
    if (!/^MGT\d{3}$/.test(id || "")) return json({ error: "Invalid course id." }, 400, cors);
    const index = JSON.parse((await repo.readFile(COURSES_DIR + "index.json")) || '{"courses":[]}');
    index.courses = index.courses.filter((x) => x !== id);
    index.updated = today;
    const res = await repo.commit([
      { path: COURSES_DIR + id + ".json", delete: true },
      { path: COURSES_DIR + "index.json", content: JSON.stringify(index, null, 2) + "\n" }
    ], "Remove " + id + " course data (via Manage courses)");
    return json({ ok: true, ...res }, 200, cors);
  }

  if (path === "/admin/history") {
    return json({ commits: await repo.history(COURSES_DIR, 20) }, 200, cors);
  }

  if (path === "/admin/undo") {
    // Put every course file that commit touched back to how it was just before it.
    const info = await repo.commitInfo(body.sha);
    if (!info.parent) return json({ error: "Can't undo the very first commit." }, 400, cors);
    const files = info.files.filter((f) => f.path.startsWith(COURSES_DIR));
    if (!files.length) return json({ error: "That change didn't touch course data." }, 400, cors);
    const changes = [];
    for (const f of files) {
      const before = await repo.readFile(f.path, info.parent);
      changes.push(before == null ? { path: f.path, delete: true } : { path: f.path, content: before });
    }
    const res = await repo.commit(changes, "Undo: " + info.message);
    return json({ ok: true, ...res }, 200, cors);
  }

  return json({ error: "Unknown admin action." }, 404, cors);
}
