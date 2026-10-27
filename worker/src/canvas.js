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

/** Keeps only the fields the Courses page shows, with length caps. */
function cleanReport(r) {
  if (!r || typeof r !== "object") throw new HttpError(400, "Report must be a JSON object.");
  return {
    checkedAt: s(r.checkedAt, 40) || nowIso(),
    receivedAt: nowIso(),
    canvasCourses: list(r.canvasCourses, 40).map((c) => ({ code: s(c.code, 40), name: s(c.name, 160), url: s(c.url, 400) })),
    syllabi: list(r.syllabi, 40).map((x) => ({
      key: s(x.key, 100), course: s(x.course, 12), title: s(x.title, 200), status: x.status === "changed" ? "changed" : "new",
      canvasUrl: s(x.canvasUrl, 400), inboxId: /^[a-z0-9-]{36}$/.test(x.inboxId || "") ? x.inboxId : null, note: s(x.note, 400)
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
  return json({ ok: true, syllabi: report.syllabi.length, dates: report.dates.length, newItems: report.newItems.length });
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
