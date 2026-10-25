// Loads everything the planner needs for the signed-in student: course data, their own state
// (checkmarks, my courses, calendar token), and their teams. Rejects with { needsLogin: true }
// when nobody is signed in.
window.api = async function (method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin"
  });
  if (res.status === 401) throw Object.assign(new Error("Please sign in."), { needsLogin: true });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ").");
  return data;
};

window.loadPlannerData = async function () {
  const [data, me, teams] = await Promise.all([api("GET", "/api/data"), api("GET", "/api/me"), api("GET", "/api/teams")]);
  window.EMBA = { program: data.program, sessions: data.sessions, courses: data.courses, coursesUpdated: data.updated, me, teams: teams.teams };
  return window.EMBA;
};
