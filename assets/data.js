// Loads all planner data (shared by the planner, the Manage courses page, and, through the
// same JSON files, the Worker's calendar feed). Fetched with no-cache so published changes
// show up right away.
window.loadPlannerData = async function () {
  const get = (f) => fetch("data/" + f, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(f + " " + r.status);
    return r.json();
  });
  const [program, sched, idx] = await Promise.all([get("program.json"), get("sessions.json"), get("courses/index.json")]);
  const courses = await Promise.all(idx.courses.map((id) => get("courses/" + id + ".json")));
  window.EMBA = { program, sessions: sched.sessions, courses, coursesUpdated: idx.updated };
  return window.EMBA;
};
