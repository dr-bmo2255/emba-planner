// GET /calendar.ics: a live iCalendar feed built from the planner's published JSON.
// Calendar apps poll it, so subscribers get updates when a syllabus is published.
// Optional filters (same values as the planner's menus):
//   ?courses=MGT410,MGT411  &types=assignment,exam,reading,case,session,colloquium,office,event
//   &req=required,optional  &mode=individual,group,unspecified  &download=1
const TYPES = ["assignment", "exam", "case", "reading", "session", "colloquium", "office", "event"];
const DUE = new Set(["assignment", "exam"]);

export async function handleCalendar(request, env, ctx) {
  const url = new URL(request.url);
  const cache = caches.default;
  const cacheKey = new Request(url.toString().replace(/[?&]download=1/, ""), { method: "GET" });
  let res = await cache.match(cacheKey);
  if (!res) {
    const data = await loadData(env.SITE_URL);
    const ics = buildIcs(data, url.searchParams);
    res = new Response(ics, {
      headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=900", "access-control-allow-origin": "*" }
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  if (url.searchParams.get("download") === "1") {
    res = new Response(res.body, res);
    res.headers.set("content-disposition", 'attachment; filename="emba-planner.ics"');
  }
  return res;
}

async function loadData(site) {
  const get = (p) => fetch(site + p, { cf: { cacheTtl: 120 } }).then((r) => {
    if (!r.ok) throw new Error(p + " " + r.status);
    return r.json();
  });
  const [program, sched, idx] = await Promise.all([get("data/program.json"), get("data/sessions.json"), get("data/courses/index.json")]);
  const courses = await Promise.all(idx.courses.map((id) => get("data/courses/" + id + ".json")));
  return { program, sessions: sched.sessions, courses };
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
  courses.forEach((c) => (c.items || []).forEach((x) => items.push({ ...x, kind: x.type, course: c.id })));
  return { items, info };
}

function buildIcs(data, q) {
  const list = (k, all) => { const v = q.get(k); return new Set(v ? v.split(",").map((s) => s.trim()).filter(Boolean) : all); };
  const types = list("types", TYPES), req = list("req", ["required", "optional"]), mode = list("mode", ["individual", "group", "unspecified"]);
  const courseFilter = q.get("courses") ? list("courses", []) : null;
  const { items, info } = collectItems(data);
  const keep = items.filter((it) => it.date && types.has(it.kind) && (!courseFilter || courseFilter.has(it.course)) &&
    (!["assignment", "exam", "reading", "case"].includes(it.kind) || req.has(it.required === false ? "optional" : "required")) &&
    (!DUE.has(it.kind) || mode.has(it.mode || "unspecified")));

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EMBA C28 Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:EMBA C28 Planner", "X-WR-TIMEZONE:America/New_York",
    "X-WR-CALDESC:Yale SOM EMBA Class of 2028 deadlines\\, readings\\, and classes (unofficial). Confirm on Canvas.",
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H", "X-PUBLISHED-TTL:PT4H", ...VTIMEZONE];
  const dt = (d, t) => d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
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
