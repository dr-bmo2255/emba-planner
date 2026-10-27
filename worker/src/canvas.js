// Weekly Canvas check (admins only). A scheduled Claude task on the maintainer's Mac reads Canvas in Chrome
// (read-only), uploads new or changed syllabus PDFs to the inbox, and posts a report here. The Courses page
// shows it as "From Canvas" for review; nothing reaches the planner until an admin publishes or edits.
// Stored in KV (not the docs table) so it never changes the planner's "last updated" date.
import { HttpError, json, body, nowIso } from "./util.js";

const REPORT = "canvas:report";
const SEEN = "canvas:seen";
const MAX_SEEN = 1000;

const s = (v, max) => (v == null ? null : String(v).slice(0, max));
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/** One entry per key (a repeated syllabus, date, or assignment shows up once); entries without a key are dropped. */
function unique(arr) {
  const seen = new Set();
  return arr.filter((x) => x.key && !seen.has(x.key) && seen.add(x.key));
}

/** Keeps only the fields the Courses page shows, with length caps. Each report replaces the last one. */
function cleanReport(r) {
  if (!r || typeof r !== "object") throw new HttpError(400, "Report must be a JSON object.");
  const out = {
    checkedAt: s(r.checkedAt, 40) || nowIso(),
    receivedAt: nowIso(),
    canvasCourses: list(r.canvasCourses, 40).map((c) => ({ code: s(c.code, 40), name: s(c.name, 160), url: s(c.url, 400) })),
    syllabi: list(r.syllabi, 40).map((x) => ({
      key: s(x.key, 100), course: s(x.course, 12), title: s(x.title, 200), status: x.status === "changed" ? "changed" : "new",
      canvasUrl: s(x.canvasUrl, 400), inboxId: /^[a-z0-9-]{36}$/.test(x.inboxId || "") ? x.inboxId : null, note: s(x.note, 400),
      updated: s(x.updated, 40) // when Canvas says the file was last uploaded or replaced
    })),
    dates: list(r.dates, 200).map((x) => ({
      key: s(x.key, 160), itemId: s(x.itemId, 80), course: s(x.course, 12), title: s(x.title, 200),
      planner: s(x.planner, 40), canvas: s(x.canvas, 40), canvasUrl: s(x.canvasUrl, 400)
    })),
    newItems: list(r.newItems, 200).map((x) => ({
      key: s(x.key, 160), course: s(x.course, 12), title: s(x.title, 200), due: s(x.due, 40), canvasUrl: s(x.canvasUrl, 400)
    })),
    notes: list(r.notes, 20).map((n) => s(n, 500))
  };
  for (const k of ["syllabi", "dates", "newItems"]) out[k] = unique(out[k]);
  return out;
}

export async function getCanvas(env) {
  const [report, seen] = await Promise.all([env.INBOX.get(REPORT, "json"), env.INBOX.get(SEEN, "json")]);
  return json({ report: report || null, seen: seen || [] });
}

export async function putReport(request, env) {
  const raw = await request.text();
  if (raw.length > 400000) throw new HttpError(413, "Report is too large.");
  let r;
  try { r = JSON.parse(raw); } catch (e) { throw new HttpError(400, "Report must be JSON."); }
  const report = cleanReport(r);
  await env.INBOX.put(REPORT, JSON.stringify(report));
  // Keep every report to look back on.
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const summary = `${n(report.syllabi.length, "syllabus", "syllabi")} · ${n(report.dates.length, "date difference", "date differences")} · ${report.newItems.length} not in the planner` +
    (report.notes.some((n) => /wasn't signed in/i.test(n)) ? " · not signed in" : "");
  await env.DB.prepare("INSERT INTO canvas_reports (checked_at, received_at, summary, json) VALUES (?, ?, ?, ?)")
    .bind(report.checkedAt, report.receivedAt, summary, JSON.stringify(report)).run();
  return json({ ok: true, syllabi: report.syllabi.length, dates: report.dates.length, newItems: report.newItems.length });
}

/** Past weekly reports, newest first (list only; open one with archivedReport). */
export async function archive(env) {
  const { results } = await env.DB.prepare("SELECT id, checked_at, summary FROM canvas_reports ORDER BY id DESC LIMIT 200").all();
  return json({ reports: results });
}
export async function archivedReport(env, id) {
  const row = await env.DB.prepare("SELECT json FROM canvas_reports WHERE id = ?").bind(Number(id)).first();
  if (!row) throw new HttpError(404, "Report not found.");
  return json({ report: JSON.parse(row.json) });
}

/** { key }: hide one entry (a syllabus already read, or a date difference that's fine) from now on. */
export async function markSeen(request, env) {
  const { key } = await body(request);
  if (!key || String(key).length > 160) throw new HttpError(400, "Missing key.");
  const seen = (await env.INBOX.get(SEEN, "json")) || [];
  if (!seen.includes(key)) seen.push(String(key));
  await env.INBOX.put(SEEN, JSON.stringify(seen.slice(-MAX_SEEN)));
  return json({ ok: true });
}
