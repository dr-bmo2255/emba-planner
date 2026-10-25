// Calendar feeds. Calendar apps can't sign in, so each student's feed URLs carry their private
// cal_token (resettable from the account menu):
//   GET /cal/<token>/courses.ics?courses=MGT410     one course (or several, comma-separated)
//       optional &types=…&req=…&mode=… (same values as the planner's menus) &download=1
//   GET /cal/<token>/team/<teamId>.ics             a team's meetings (members only)
import { loadAll } from "./docs.js";

const TYPES = ["assignment", "exam", "case", "reading", "session", "colloquium", "office", "event"];
const DUE = new Set(["assignment", "exam"]);
const ICS_HEADERS = { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=600" };

export async function handleCalendar(request, env) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/cal\/([A-Za-z0-9_-]{20,})\/(courses|team\/([A-Za-z0-9_-]+))\.ics$/);
  if (!m) return new Response("Not found", { status: 404 });
  const user = await env.DB.prepare("SELECT id, role FROM users WHERE cal_token = ?").bind(m[1]).first();
  if (!user) return new Response("This calendar link is no longer valid. Get a new one from the EMBA Planner.", { status: 404 });
  let ics;
  if (m[3]) {
    const team = await env.DB.prepare("SELECT t.* FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = ? AND tm.user_id = ?").bind(m[3], user.id).first();
    if (!team) return new Response("You're not on this team anymore.", { status: 404 });
    const [meetings, skips] = await Promise.all([
      env.DB.prepare("SELECT * FROM meetings WHERE team_id = ?").bind(team.id).all(),
      env.DB.prepare("SELECT s.meeting_id, s.date FROM meeting_skips s JOIN meetings m ON m.id = s.meeting_id WHERE m.team_id = ?").bind(team.id).all()
    ]);
    ics = buildTeamIcs(team, meetings.results, skips.results);
  } else {
    ics = buildIcs(await loadAll(env), url.searchParams);
  }
  const headers = { ...ICS_HEADERS };
  if (url.searchParams.get("download") === "1") headers["content-disposition"] = 'attachment; filename="emba-planner.ics"';
  return new Response(ics, { headers });
}

// Mirrors how the planner itself merges sessions, topics, speakers, and course items.
function collectItems({ program, sessions, courses }) {
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  const reg = program.courseRegistry || {};
  const info = (id) => ({ code: (byId[id] && byId[id].code) || (reg[id] && reg[id].code) || id, name: (byId[id] && byId[id].name) || (reg[id] && reg[id].name) || id });
  const faculty = (id, last) => {
    const fac = (byId[id] && byId[id].faculty) || (reg[id] && reg[id].faculty) || [];
    if (!last) return "";
    return last.split("/").map((ln) => {
      const f = fac.find((x) => x.name.split(/\s+/).pop().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().startsWith(ln.trim().toLowerCase().slice(0, 4)));
      return f ? f.name : ln.trim();
    }).join(", ");
  };
  const items = [];
  sessions.forEach((s) => {
    if (s.kind === "event") { items.push({ id: s.id, kind: "event", course: "PROGRAM", title: s.title, date: s.date, time: s.start, endTime: s.end }); return; }
    const c = byId[s.course] || {};
    const topics = (c.topics || []).filter((t) => t.date === s.date && !(t.start && s.start && (t.start < s.start || (s.end && t.start >= s.end)))).map((t) => t.label);
    const sp = (c.speakers || []).find((x) => x.date === s.date);
    items.push({
      id: s.id, kind: s.course === "MGT699" ? "colloquium" : "session", course: s.course,
      title: sp ? "Colloquium: " + sp.speaker : s.name, date: s.date, time: s.start, endTime: s.end,
      location: sp ? sp.location : s.room ? "Evans Hall " + s.room : null,
      notes: [faculty(s.course, s.instructor), topics.join("\n"), sp && sp.title].filter(Boolean).join("\n")
    });
  });
  (program.milestones || []).forEach((m) => items.push({ id: m.id, kind: "event", course: "PROGRAM", title: m.title, date: m.date, endDate: m.endDate }));
  (program.classWeekends || []).forEach(([a, b]) => items.push({ id: "wk-" + a, kind: "event", course: "PROGRAM", title: "EMBA class weekend", date: a, endDate: b }));
  courses.forEach((c) => (c.items || []).forEach((x) => items.push({ ...x, kind: x.type, course: c.id })));
  return { items, info };
}

function header(name, desc) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EMBA C28 Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc(name), "X-WR-TIMEZONE:America/New_York", "X-WR-CALDESC:" + esc(desc),
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H", "X-PUBLISHED-TTL:PT2H", ...VTIMEZONE];
}
const stampNow = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const dt = (d, t) => d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** A team's meetings: weekly series become RRULE events (with EXDATE for skipped dates). */
function buildTeamIcs(team, meetings, skips) {
  const L = header(team.name + " (team)", "Meetings for " + team.name + " · Unofficial EMBA Planner");
  const stamp = stampNow();
  for (const m of meetings) {
    L.push("BEGIN:VEVENT", "UID:meeting-" + m.id + "@emba28-planner", "DTSTAMP:" + stamp);
    if (m.kind === "once") {
      L.push("DTSTART;TZID=America/New_York:" + dt(m.date, m.start_time), "DTEND;TZID=America/New_York:" + dt(m.date, m.end_time));
    } else {
      const days = m.weekdays.split(",").map(Number);
      // DTSTART must be the first real occurrence on or after start_date.
      const d0 = new Date(m.start_date + "T12:00:00Z");
      while (!days.includes(d0.getUTCDay())) d0.setUTCDate(d0.getUTCDate() + 1);
      const first = d0.toISOString().slice(0, 10);
      L.push("DTSTART;TZID=America/New_York:" + dt(first, m.start_time), "DTEND;TZID=America/New_York:" + dt(first, m.end_time));
      // UNTIL is in UTC: end of until_date in New York is at most 05:00 UTC the next day.
      const u = new Date(m.until_date + "T12:00:00Z"); u.setUTCDate(u.getUTCDate() + 1);
      L.push("RRULE:FREQ=WEEKLY;INTERVAL=" + (m.every || 1) + ";WKST=SU;BYDAY=" + days.map((d) => DAY_CODES[d]).join(",") + ";UNTIL=" + u.toISOString().slice(0, 10).replace(/-/g, "") + "T035959Z");
      const ex = skips.filter((s) => s.meeting_id === m.id).map((s) => dt(s.date, m.start_time));
      if (ex.length) L.push("EXDATE;TZID=America/New_York:" + ex.join(","));
    }
    L.push("SUMMARY:" + esc(team.name + ": " + m.title));
    const desc = [m.location && /^https?:/.test(m.location) ? "Join: " + m.location : "", m.notes || ""].filter(Boolean).join("\n");
    if (desc) L.push("DESCRIPTION:" + esc(desc));
    if (m.location) L.push("LOCATION:" + esc(m.location));
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

function buildIcs(data, q) {
  const list = (k, all) => { const v = q.get(k); return new Set(v ? v.split(",").map((s) => s.trim()).filter(Boolean) : all); };
  const types = list("types", TYPES), req = list("req", ["required", "optional"]), mode = list("mode", ["individual", "group", "unspecified"]);
  const courseFilter = q.get("courses") ? list("courses", []) : null;
  const { items, info } = collectItems(data);
  const keep = items.filter((it) => it.date && types.has(it.kind) && (!courseFilter || courseFilter.has(it.course)) &&
    (!["assignment", "exam", "reading", "case"].includes(it.kind) || req.has(it.required === false ? "optional" : "required")) &&
    (!DUE.has(it.kind) || mode.has(it.mode || "unspecified")));

  const stamp = stampNow();
  // A single-course feed is named after the course, so each shows up as its own calendar.
  let calName = "EMBA C28 Planner (unofficial)";
  if (courseFilter && courseFilter.size === 1) {
    const only = [...courseFilter][0];
    calName = only === "PROGRAM" ? "EMBA class weekends & events (unofficial)" : only.replace("MGT", "") + " " + info(only).name + " · EMBA (unofficial)";
  }
  const L = header(calName, "Yale SOM EMBA Class of 2028 deadlines, readings, and classes (unofficial). Confirm on Canvas.");
  const addMin = (t, m) => { const [h, mm] = t.split(":").map(Number); const x = Math.max(0, h * 60 + mm + m); return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
  const nextDay = (d) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ""); };
  const fmtT = (t) => { let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + " " + ap; };
  const event = (uid, summary, d, start, end, endDate, desc, loc, alarm) => {
    L.push("BEGIN:VEVENT", "UID:" + uid + "@emba28-planner", "DTSTAMP:" + stamp);
    if (start) L.push("DTSTART;TZID=America/New_York:" + dt(d, start), "DTEND;TZID=America/New_York:" + dt(d, end || start));
    else L.push("DTSTART;VALUE=DATE:" + d.replace(/-/g, ""), "DTEND;VALUE=DATE:" + nextDay(endDate || d));
    L.push("SUMMARY:" + esc(summary));
    if (desc) L.push("DESCRIPTION:" + esc(desc));
    if (loc) L.push("LOCATION:" + esc(loc));
    if (alarm) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(summary), "TRIGGER:-P1D", "END:VALARM");
    L.push("END:VEVENT");
  };
  const num = (id) => id === "PROGRAM" ? "EMBA" : id.replace("MGT", "");
  const links = (it) => (it.links || []).map((l) => l.label + ": " + l.url).join("\n");

  // Readings and cases: one event per course per class start ("Prepare for 410"), like the calendar view.
  const bundles = new Map();
  keep.filter((it) => it.kind === "reading" || it.kind === "case").forEach((it) => {
    const k = it.course + "|" + it.date + "|" + (it.time || "");
    if (!bundles.has(k)) bundles.set(k, []);
    bundles.get(k).push(it);
  });
  bundles.forEach((arr, k) => {
    const [course, date, time] = k.split("|");
    const c = info(course);
    const summary = arr.length === 1 ? num(course) + " Prepare: " + arr[0].title : num(course) + " Prepare: " + arr.length + " readings/cases";
    const desc = c.code + " " + c.name + " · due by the start of class\n\n" + arr.map((it) => "• " + it.title + (it.required === false ? " (optional)" : "") + (links(it) ? "\n  " + links(it).replace(/\n/g, "\n  ") : "")).join("\n");
    event("prep-" + course + "-" + date + "-" + (time || "x").replace(":", ""), summary, date, time ? addMin(time, -30) : null, time || null, null, desc, null, false);
  });

  keep.filter((it) => it.kind !== "reading" && it.kind !== "case").forEach((it) => {
    const c = info(it.course);
    if (DUE.has(it.kind)) {
      const due = it.time === "00:00" ? "00:00" : it.time;
      const summary = num(it.course) + " DUE: " + it.title + (it.time ? " (" + fmtT(it.time) + ")" : "");
      const desc = [c.code + " " + c.name, it.points != null ? "Worth " + Math.round(it.points * 100) / 100 + "% of the course grade" : "",
        it.mode ? "Work: " + it.mode : "", it.required === false ? "Optional" : "", it.notes || "", it.verify ? "⚠ Verify: " + it.verify : "", links(it)].filter(Boolean).join("\n");
      // Show deadlines as a 30-minute block ending at the due time.
      event(it.id, summary, it.date, due ? addMin(due, -30) : null, due || null, null, desc, null, true);
    } else {
      const summary = (it.course === "PROGRAM" ? "" : num(it.course) + " ") + it.title;
      const desc = [it.course === "PROGRAM" ? "" : c.code + " " + c.name, it.notes || "", links(it)].filter(Boolean).join("\n");
      event(it.id, summary, it.date, it.time || null, it.endTime || (it.time ? addMin(it.time, 60) : null), it.endDate, desc, it.location, false);
    }
  });
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);

// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = "", len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:America/New_York",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
  "END:VTIMEZONE"
];
