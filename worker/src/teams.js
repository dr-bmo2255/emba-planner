// Working teams: any student creates one and shares an invite link; members manage meetings.
// Team data is visible only to its members (and the maintainer, who can remove a team).
import { HttpError, json, body, nowIso, randomToken, text, optText, isDate, isTime, logEvent, who } from "./util.js";

// Team log lines (admin view) say what happened to a team, not which classmate joined or left: team
// membership stays private to members. Team names and creators are already visible to admins.
const tname = async (env, id) => ((await env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(id).first()) || {}).name || "(deleted team)";
const size = async (env, id) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?").bind(id).first()).n;

const COLORS = ["#00356b", "#1f7a4d", "#c0392b", "#6c3fc5", "#d35400", "#00838f", "#9c3d8f", "#b35c00", "#2e5e9e", "#5b6b2e"];

async function membership(env, teamId, user) {
  const m = await env.DB.prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?").bind(teamId, user.id).first();
  if (m) return m.role;
  if (user.role === "admin") return "admin";
  throw new HttpError(404, "Team not found.");
}

async function teamPayload(env, team, user, role) {
  const [members, meetings, skips] = await Promise.all([
    env.DB.prepare("SELECT u.id, u.name, u.email, m.role FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.role DESC, u.name").bind(team.id).all(),
    env.DB.prepare("SELECT * FROM meetings WHERE team_id = ? ORDER BY COALESCE(date, start_date), start_time").bind(team.id).all(),
    env.DB.prepare("SELECT s.meeting_id, s.date FROM meeting_skips s JOIN meetings m ON m.id = s.meeting_id WHERE m.team_id = ?").bind(team.id).all()
  ]);
  const skipMap = {};
  skips.results.forEach((s) => (skipMap[s.meeting_id] = skipMap[s.meeting_id] || []).push(s.date));
  return {
    id: team.id, name: team.name, color: team.color, created_at: team.created_at,
    myRole: role,
    inviteCode: team.invite_code,
    members: members.results.map((m) => ({ id: m.id, name: m.name || m.email.split("@")[0], email: m.email, role: m.role, me: m.id === user.id })),
    meetings: meetings.results.map((m) => ({
      id: m.id, title: m.title, kind: m.kind, date: m.date, startDate: m.start_date, untilDate: m.until_date,
      weekdays: m.weekdays ? m.weekdays.split(",").map(Number) : [], every: m.every,
      startTime: m.start_time, endTime: m.end_time, location: m.location, notes: m.notes,
      skips: (skipMap[m.id] || []).sort()
    }))
  };
}

export async function myTeams(env, user) {
  const { results } = await env.DB.prepare("SELECT t.*, m.role FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY t.name").bind(user.id).all();
  return json({ teams: await Promise.all(results.map((t) => teamPayload(env, t, user, t.role))) });
}

export async function createTeam(request, env, user) {
  const b = await body(request);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM team_members WHERE user_id = ?").bind(user.id).first();
  if (count.n >= 20) throw new HttpError(400, "You're already on 20 teams.");
  const id = randomToken(9);
  const color = COLORS.includes(b.color) ? b.color : COLORS[Math.floor(Math.random() * COLORS.length)];
  await env.DB.batch([
    env.DB.prepare("INSERT INTO teams (id, name, color, invite_code, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, text(b.name, 60, "Team name"), color, randomToken(12), user.id, nowIso()),
    env.DB.prepare("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").bind(id, user.id, nowIso())
  ]);
  const team = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(id).first();
  await logEvent(env, "team", user.id, `${who(user)} created the team "${team.name}"`);
  return json({ team: await teamPayload(env, team, user, "owner") });
}

export async function updateTeam(request, env, user, teamId) {
  const role = await membership(env, teamId, user);
  if (role === "member") throw new HttpError(403, "Only the team's owner can rename it.");
  const b = await body(request);
  const before = await tname(env, teamId);
  if (b.name != null) await env.DB.prepare("UPDATE teams SET name = ? WHERE id = ?").bind(text(b.name, 60, "Team name"), teamId).run();
  if (b.color && COLORS.includes(b.color)) await env.DB.prepare("UPDATE teams SET color = ? WHERE id = ?").bind(b.color, teamId).run();
  if (b.invite === "reset") await env.DB.prepare("UPDATE teams SET invite_code = ? WHERE id = ?").bind(randomToken(12), teamId).run();
  if (b.invite === "off") await env.DB.prepare("UPDATE teams SET invite_code = NULL WHERE id = ?").bind(teamId).run();
  const after = await tname(env, teamId);
  const did = [after !== before ? `renamed to "${after}"` : null, b.color ? "color changed" : null,
    b.invite === "reset" ? "invite link replaced" : null, b.invite === "off" ? "invite link turned off" : null].filter(Boolean);
  if (did.length) await logEvent(env, "team", user.id, `Team "${before}": ${did.join(", ")}`);
  return json({ ok: true });
}

export async function deleteTeam(env, user, teamId) {
  const role = await membership(env, teamId, user);
  if (role === "member") throw new HttpError(403, "Only the team's owner (or the maintainer) can delete it.");
  const name = await tname(env, teamId);
  await env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(teamId).run();
  await logEvent(env, "team", user.id, `Team "${name}" was deleted by ${role === "admin" ? "admin " + who(user) : "its owner"}`);
  return json({ ok: true });
}

export async function removeMember(env, user, teamId, memberId) {
  const role = await membership(env, teamId, user);
  const leaving = Number(memberId) === user.id;
  if (!leaving && role === "member") throw new HttpError(403, "Only the team's owner can remove members.");
  const name = await tname(env, teamId);
  await env.DB.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").bind(teamId, Number(memberId)).run();
  // Someone was removed (not leaving on their own): replace the invite link so the old one can't be
  // used to rejoin. Current members are unaffected; an invite link that was turned off stays off.
  if (!leaving) await env.DB.prepare("UPDATE teams SET invite_code = ? WHERE id = ? AND invite_code IS NOT NULL").bind(randomToken(12), teamId).run();
  // Keep an owner: promote the longest-standing member, or delete an empty team.
  const left = await env.DB.prepare("SELECT user_id, role FROM team_members WHERE team_id = ? ORDER BY joined_at").bind(teamId).all();
  await logEvent(env, "team", null, `Team "${name}": ${leaving ? "a member left" : "a member was removed"} · ${left.results.length} left${!leaving ? " · invite link replaced" : ""}${left.results.length ? "" : " · team deleted (empty)"}`);
  if (!left.results.length) await env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(teamId).run();
  else if (!left.results.some((m) => m.role === "owner")) {
    await env.DB.prepare("UPDATE team_members SET role = 'owner' WHERE team_id = ? AND user_id = ?").bind(teamId, left.results[0].user_id).run();
  }
  return json({ ok: true });
}

export async function previewInvite(env, user, code) {
  const t = await env.DB.prepare("SELECT id, name, color FROM teams WHERE invite_code = ?").bind(code).first();
  if (!t) throw new HttpError(404, "This invite link isn't valid anymore. Ask your team for a new one.");
  const [n, mine] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?").bind(t.id).first(),
    env.DB.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?").bind(t.id, user.id).first()
  ]);
  return json({ team: { id: t.id, name: t.name, color: t.color, members: n.n }, alreadyMember: !!mine });
}

export async function joinTeam(env, user, code) {
  const t = await env.DB.prepare("SELECT id FROM teams WHERE invite_code = ?").bind(code).first();
  if (!t) throw new HttpError(404, "This invite link isn't valid anymore. Ask your team for a new one.");
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?").bind(t.id).first();
  if (n.n >= 30) throw new HttpError(400, "This team is full (30 members).");
  const r = await env.DB.prepare("INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").bind(t.id, user.id, nowIso()).run();
  if (r.meta && r.meta.changes) await logEvent(env, "team", null, `Team "${await tname(env, t.id)}": a member joined · ${await size(env, t.id)} members`);
  return json({ ok: true, teamId: t.id });
}

// ---- meetings (any member can add, edit, skip, or delete)
function meetingFields(b) {
  const kind = b.kind === "weekly" ? "weekly" : "once";
  const f = {
    title: text(b.title || "Team meeting", 80, "Title"),
    kind,
    start_time: b.startTime, end_time: b.endTime,
    location: optText(b.location, 300, "Location"),
    notes: optText(b.notes, 1000, "Notes"),
    date: null, start_date: null, until_date: null, weekdays: null, every: 1
  };
  if (!isTime(f.start_time) || !isTime(f.end_time)) throw new HttpError(400, "Start and end times are required.");
  if (f.end_time <= f.start_time) throw new HttpError(400, "The meeting has to end after it starts.");
  if (kind === "once") {
    if (!isDate(b.date)) throw new HttpError(400, "Pick a date.");
    f.date = b.date;
  } else {
    if (!isDate(b.startDate) || !isDate(b.untilDate)) throw new HttpError(400, "Pick the first and last dates for the series.");
    if (b.untilDate < b.startDate) throw new HttpError(400, "The series has to end after it starts.");
    if ((Date.parse(b.untilDate) - Date.parse(b.startDate)) / 864e5 > 400) throw new HttpError(400, "A series can run at most about 13 months.");
    const days = [...new Set((b.weekdays || []).map(Number))].filter((d) => d >= 0 && d <= 6).sort();
    if (!days.length) throw new HttpError(400, "Pick at least one day of the week.");
    f.start_date = b.startDate; f.until_date = b.untilDate; f.weekdays = days.join(",");
    f.every = Number(b.every) === 2 ? 2 : 1;
  }
  return f;
}

export async function addMeeting(request, env, user, teamId) {
  await membership(env, teamId, user);
  const f = meetingFields(await body(request));
  const id = randomToken(9);
  await env.DB.prepare("INSERT INTO meetings (id, team_id, title, kind, date, start_date, until_date, weekdays, every, start_time, end_time, location, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, teamId, f.title, f.kind, f.date, f.start_date, f.until_date, f.weekdays, f.every, f.start_time, f.end_time, f.location, f.notes, user.id, nowIso(), nowIso()).run();
  await logEvent(env, "team", null, `Team "${await tname(env, teamId)}": ${f.kind === "weekly" ? "a weekly meeting series" : "a meeting"} was added`);
  return json({ ok: true, id });
}

async function meetingTeam(env, user, meetingId) {
  const m = await env.DB.prepare("SELECT team_id FROM meetings WHERE id = ?").bind(meetingId).first();
  if (!m) throw new HttpError(404, "Meeting not found.");
  await membership(env, m.team_id, user);
  return m.team_id;
}

export async function updateMeeting(request, env, user, meetingId) {
  const teamId = await meetingTeam(env, user, meetingId);
  const f = meetingFields(await body(request));
  await env.DB.prepare("UPDATE meetings SET title = ?, kind = ?, date = ?, start_date = ?, until_date = ?, weekdays = ?, every = ?, start_time = ?, end_time = ?, location = ?, notes = ?, updated_at = ? WHERE id = ?")
    .bind(f.title, f.kind, f.date, f.start_date, f.until_date, f.weekdays, f.every, f.start_time, f.end_time, f.location, f.notes, nowIso(), meetingId).run();
  await logEvent(env, "team", null, `Team "${await tname(env, teamId)}": a meeting was changed`);
  return json({ ok: true });
}

export async function deleteMeeting(env, user, meetingId) {
  const teamId = await meetingTeam(env, user, meetingId);
  await env.DB.prepare("DELETE FROM meetings WHERE id = ?").bind(meetingId).run();
  await logEvent(env, "team", null, `Team "${await tname(env, teamId)}": a meeting was removed`);
  return json({ ok: true });
}

/** Cancel (skip: true) or restore (skip: false) one date of a weekly series. */
export async function skipMeeting(request, env, user, meetingId) {
  await meetingTeam(env, user, meetingId);
  const { date, skip } = await body(request);
  if (!isDate(date)) throw new HttpError(400, "Invalid date.");
  if (skip) await env.DB.prepare("INSERT OR IGNORE INTO meeting_skips (meeting_id, date) VALUES (?, ?)").bind(meetingId, date).run();
  else await env.DB.prepare("DELETE FROM meeting_skips WHERE meeting_id = ? AND date = ?").bind(meetingId, date).run();
  return json({ ok: true });
}

/** Maintainer overview: every team with its size (to spot and remove problems). */
export async function allTeams(env) {
  const { results } = await env.DB.prepare(
    "SELECT t.id, t.name, t.color, t.created_at, u.name AS owner_name, u.email AS owner_email, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS members FROM teams t LEFT JOIN users u ON u.id = t.created_by ORDER BY t.created_at DESC"
  ).all();
  return json({ teams: results });
}
