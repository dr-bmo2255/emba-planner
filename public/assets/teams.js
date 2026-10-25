// Working teams in the planner: expands meetings into dated items, renders the Teams view,
// and the add/edit meeting form. Uses window.EMBA_APP (from app.js) for shared helpers.
(function () {
  "use strict";
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYS_LONG = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const COLORS = ["#00356b", "#1f7a4d", "#c0392b", "#6c3fc5", "#d35400", "#00838f", "#9c3d8f", "#b35c00", "#2e5e9e", "#5b6b2e"];
  const DAY = 864e5;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const utc = (iso) => Date.parse(iso + "T12:00:00Z");
  const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);

  /** Occurrence dates of a meeting. Weekly series count weeks from the week of the first real
   *  occurrence (same as the calendar feed's RRULE with WKST=SU), skipping meeting.skips. */
  function occurrences(m) {
    if (m.kind === "once") return [m.date];
    let first = utc(m.startDate);
    while (!m.weekdays.includes(new Date(first).getUTCDay())) first += DAY;
    const weekStart = first - new Date(first).getUTCDay() * DAY;
    const out = [], end = utc(m.untilDate), skips = new Set(m.skips || []);
    for (let d = first; d <= end; d += DAY) {
      const wd = new Date(d).getUTCDay();
      const week = Math.round((d - wd * DAY - weekStart) / (7 * DAY));
      if (m.weekdays.includes(wd) && week % (m.every || 1) === 0 && !skips.has(isoOf(d))) out.push(isoOf(d));
    }
    return out;
  }

  function teamKey(t) { return "TEAM-" + t.id; }

  /** Planner items (kind "team") for every meeting occurrence of every team. */
  function items(teams) {
    const out = [];
    teams.forEach((t) => t.meetings.forEach((m) => occurrences(m).forEach((date) => out.push({
      id: "tm-" + m.id + "-" + date, kind: "team", course: teamKey(t), title: m.title,
      date, time: m.startTime, endTime: m.endTime, location: m.location, notes: m.notes,
      meetingId: m.id, teamId: t.id, weekly: m.kind === "weekly"
    }))));
    return out;
  }

  function seriesText(m, A) {
    const t = A.fmtTime(m.startTime) + "–" + A.fmtTime(m.endTime);
    if (m.kind === "once") return A.fmtDow(m.date) + " " + A.fmtDate(m.date) + " · " + t;
    const days = m.weekdays.length === 1 ? DAYS_LONG[m.weekdays[0]] : m.weekdays.map((d) => DAYS[d]).join(" & ");
    return (m.every === 2 ? "Every other week, " : "") + days + " · " + t + " · " + A.fmtDate(m.startDate) + " – " + A.fmtDate(m.untilDate);
  }

  function locationHtml(loc) {
    if (!loc) return "";
    return /^https?:\/\//.test(loc) ? '<a href="' + esc(loc) + '" target="_blank" rel="noopener">' + esc(loc.replace(/^https?:\/\//, "").slice(0, 40)) + " ↗</a>" : esc(loc);
  }

  // ---------------------------------------------------------------- Teams view
  function view(A) {
    const teams = A.teams();
    const join = A.pendingJoin();
    let h = '<div class="teams-head"><div><h2>Your teams</h2><p class="muted-p">Teams are private to their members. Share the invite link with your teammates, then add your regular and one-off meetings.</p></div>' +
      '<button class="btn" data-team-new>+ Create a team</button></div>';
    if (join) {
      h += '<div class="join-banner" style="--c:' + esc(join.team.color) + '"><div><b>Join ' + esc(join.team.name) + "?</b><span>" + join.team.members + " member" + (join.team.members === 1 ? "" : "s") + "</span></div>" +
        (join.alreadyMember ? '<span class="muted-p">You\'re already on this team.</span><button class="btn btn-ghost" data-join-dismiss>OK</button>' :
          '<button class="btn" data-join-accept>Join team</button><button class="btn btn-ghost" data-join-dismiss>Not now</button>') + "</div>";
    }
    if (!teams.length) h += '<div class="empty">You\'re not on a team yet. Create one, or open an invite link a teammate sent you.</div>';
    teams.forEach((t) => {
      const owner = t.myRole === "owner" || t.myRole === "admin";
      const link = t.inviteCode ? location.origin + "/?join=" + t.inviteCode : "";
      const upcoming = items([t]).filter((i) => i.date >= A.todayIso).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      h += '<section class="team-card" style="--c:' + esc(t.color) + '">' +
        '<div class="team-top"><div><h3>' + esc(t.name) + '</h3><div class="muted-p">' + t.members.length + " member" + (t.members.length === 1 ? "" : "s") +
        (upcoming.length ? " · next: " + esc(A.fmtDow(upcoming[0].date) + " " + A.fmtDate(upcoming[0].date) + " " + A.fmtTime(upcoming[0].time)) : "") + "</div></div>" +
        '<div class="team-actions"><button class="btn btn-sm" data-meet-new="' + t.id + '">+ Meeting</button>' +
        '<button class="btn btn-ghost btn-sm" data-team-cal="' + t.id + '">📅 Subscribe</button></div></div>';
      h += '<div class="team-cols"><div class="team-meetings"><h4>Meetings</h4>' +
        (t.meetings.length ? t.meetings.map((m) => '<div class="meet-row"><div><b>' + esc(m.title) + '</b><span>' + esc(seriesText(m, A)) + "</span>" +
          (m.location ? "<span>" + locationHtml(m.location) + "</span>" : "") +
          (m.skips && m.skips.length ? '<span class="skips">Skipped: ' + m.skips.map((d) => esc(A.fmtDate(d)) + ' <button class="linkish" data-unskip="' + m.id + ":" + d + '" title="Put this date back">restore</button>').join(", ") + "</span>" : "") + "</div>" +
          '<div class="meet-btns"><button class="linkish" data-meet-edit="' + m.id + '">Edit</button><button class="linkish danger" data-meet-del="' + m.id + '">Delete</button></div></div>').join("")
          : '<p class="muted-p">No meetings yet.</p>') + "</div>";
      h += '<div class="team-people"><h4>Members</h4><ul>' + t.members.map((p) => "<li>" + esc(p.name) + (p.role === "owner" ? ' <span class="tag">owner</span>' : "") + (p.me ? ' <span class="tag">you</span>' : "") +
        (owner && !p.me ? ' <button class="linkish danger" data-member-del="' + t.id + ":" + p.id + '">Remove</button>' : "") + "</li>").join("") + "</ul>" +
        "<h4>Invite link</h4>" + (link ? '<div class="cal-copy"><input readonly value="' + esc(link) + '" aria-label="Invite link"><button class="btn btn-ghost btn-sm" data-copy="' + esc(link) + '">Copy</button></div>' : '<p class="muted-p">Invites are turned off.</p>') +
        (owner ? '<div class="team-owner"><button class="linkish" data-invite="' + t.id + ':reset">New link</button>' + (link ? ' · <button class="linkish" data-invite="' + t.id + ':off">Turn off</button>' : "") +
          ' · <button class="linkish" data-team-rename="' + t.id + '">Rename</button> · <button class="linkish danger" data-team-del="' + t.id + '">Delete team</button></div>' : "") +
        '<div class="team-owner"><button class="linkish danger" data-team-leave="' + t.id + '">Leave team</button></div></div></div></section>';
    });
    return h;
  }

  // ---------------------------------------------------------------- meeting form
  function meetingForm(A, team, m) {
    const in8weeks = new Date(Date.parse(A.todayIso + "T12:00:00Z") + 56 * DAY).toISOString().slice(0, 10);
    m = m || { kind: "weekly", title: "Team meeting", weekdays: [], every: 1, startTime: "19:00", endTime: "20:00", startDate: A.todayIso, untilDate: in8weeks, date: A.todayIso };
    const cb = DAYS.map((d, i) => '<label class="daychk"><input type="checkbox" name="wd" value="' + i + '"' + ((m.weekdays || []).includes(i) ? " checked" : "") + "><span>" + d + "</span></label>").join("");
    return '<h3 id="modal-title">' + (m.id ? "Edit meeting" : "New meeting") + " · " + esc(team.name) + "</h3>" +
      '<form class="meet-form" data-meet-form="' + team.id + '"' + (m.id ? ' data-meeting="' + m.id + '"' : "") + ">" +
      '<label>Title<input name="title" maxlength="80" value="' + esc(m.title) + '" required></label>' +
      '<div class="seg" role="radiogroup"><label><input type="radio" name="kind" value="weekly"' + (m.kind === "weekly" ? " checked" : "") + "> Repeats</label>" +
      '<label><input type="radio" name="kind" value="once"' + (m.kind === "once" ? " checked" : "") + "> One time</label></div>" +
      '<div class="when-weekly"' + (m.kind === "weekly" ? "" : " hidden") + '><div class="days">' + cb + "</div>" +
      '<label>Repeats<select name="every"><option value="1"' + (m.every !== 2 ? " selected" : "") + '>Every week</option><option value="2"' + (m.every === 2 ? " selected" : "") + ">Every other week</option></select></label>" +
      '<div class="grid2f"><label>From<input type="date" name="startDate" value="' + esc(m.startDate || A.todayIso) + '"></label><label>Until<input type="date" name="untilDate" value="' + esc(m.untilDate || "") + '"></label></div></div>' +
      '<div class="when-once"' + (m.kind === "once" ? "" : " hidden") + '><label>Date<input type="date" name="date" value="' + esc(m.date || A.todayIso) + '"></label></div>' +
      '<div class="grid2f"><label>Starts<input type="time" name="startTime" value="' + esc(m.startTime) + '" required></label><label>Ends<input type="time" name="endTime" value="' + esc(m.endTime) + '" required></label></div>' +
      '<label>Where <small>(room or Zoom link)</small><input name="location" maxlength="300" value="' + esc(m.location || "") + '" placeholder="https://yale.zoom.us/j/… or Evans 2400"></label>' +
      '<label>Notes<textarea name="notes" maxlength="1000" rows="2">' + esc(m.notes || "") + "</textarea></label>" +
      '<p class="muted-p">Times are Eastern. Everyone on the team can see and edit meetings.</p>' +
      '<div class="pv-actions"><button class="btn" type="submit">' + (m.id ? "Save" : "Add meeting") + '</button><span class="form-msg"></span></div></form>';
  }

  function readForm(f) {
    const kind = f.kind.value;
    return {
      title: f.title.value, kind, every: Number(f.every.value),
      weekdays: [...f.querySelectorAll('input[name="wd"]:checked')].map((x) => Number(x.value)),
      startDate: f.startDate.value, untilDate: f.untilDate.value, date: f.date.value,
      startTime: f.startTime.value, endTime: f.endTime.value, location: f.location.value, notes: f.notes.value
    };
  }

  window.PlannerTeams = { occurrences, items, view, meetingForm, readForm, seriesText, locationHtml, teamKey, COLORS };
})();
