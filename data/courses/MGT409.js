// MGT 409 AI Foundations for Managers - Fall 2026.
// Source: cohort deliverables tracker (no syllabus loaded yet). Run /add-syllabus with the
// MGT 409 syllabus to fill in readings, group/individual, and earlier homeworks.
(function () {
  const VERIFY = "Entered from the cohort tracker; MGT 409 syllabus not loaded yet.";

  EMBA.courses.push({
    id: "MGT409",
    code: "MGT 409",
    name: "AI Foundations for Managers",
    term: "Fall 2026",
    instructor: "Zaman",
    canvas: null,
    grading: [],
    notes: "Syllabus not loaded yet. Only the deliverables from the cohort tracker are listed.",

    items: [
      { id: "409-hw4", type: "assignment", title: "HW4", date: "2026-10-24", time: "00:00",
        points: 6.67, mode: null, required: true, verify: VERIFY },
      { id: "409-hw5", type: "assignment", title: "HW5: MCP Servers", date: "2026-11-06", time: "08:00",
        points: 6.67, mode: null, required: true,
        verify: VERIFY + " The tracker lists this as both Fri 11/6 8:00 AM and Sat 11/7 12:00 AM." },
      { id: "409-hw6", type: "assignment", title: "HW6: Security & Economics", date: "2026-11-06", time: "08:00",
        points: 6.67, mode: null, required: false, notes: "Optional assignment.", verify: VERIFY },
      { id: "409-copilot", type: "assignment", title: "Business AI Co-pilot", date: "2026-11-20", time: "23:59",
        points: 6.67, mode: null, required: true, verify: VERIFY }
    ]
  });
})();
