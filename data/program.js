// Program-level data: class weekends, milestones, and the registry of every course
// (name + color). Source: Class of 2028 Program Calendar (v2 Final) and the master schedule.
window.EMBA = window.EMBA || { courses: [] };

EMBA.program = {
  cohort: "Class of 2028",
  updated: "2026-10-25",

  // Chat assistant. Leave endpoint empty to use built-in answers (plus an optional personal
  // API key per viewer). Set it to your deployed worker/anthropic-proxy.js URL to give the
  // whole cohort "Ask Claude" with no key, e.g. "https://emba-planner-proxy.<you>.workers.dev".
  assistant: {
    endpoint: "https://emba-planner-proxy.emba28.workers.dev",
    model: "claude-opus-5-5"
  },

  // Class weekends from the Program Calendar (light-blue days). [first day, last day]
  classWeekends: [
    ["2026-08-14", "2026-08-15"], ["2026-08-28", "2026-08-29"],
    ["2026-09-11", "2026-09-12"], ["2026-09-25", "2026-09-26"],
    ["2026-10-09", "2026-10-10"], ["2026-10-23", "2026-10-24"],
    ["2026-11-06", "2026-11-07"], ["2026-11-20", "2026-11-21"],
    ["2026-12-04", "2026-12-05"], ["2026-12-18", "2026-12-19"],
    ["2027-01-07", "2027-01-09"], ["2027-01-22", "2027-01-23"],
    ["2027-02-05", "2027-02-06"], ["2027-02-19", "2027-02-20"],
    ["2027-03-05", "2027-03-06"], ["2027-03-19", "2027-03-20"],
    ["2027-04-02", "2027-04-03"], ["2027-04-16", "2027-04-17"],
    ["2027-04-30", "2027-05-01"], ["2027-05-14", "2027-05-15"],
    ["2027-08-13", "2027-08-14"], ["2027-08-27", "2027-08-28"],
    ["2027-09-10", "2027-09-11"], ["2027-09-24", "2027-09-25"],
    ["2027-10-08", "2027-10-09"], ["2027-10-22", "2027-10-23"],
    ["2027-11-05", "2027-11-06"], ["2027-11-18", "2027-11-20"],
    ["2027-12-03", "2027-12-04"], ["2027-12-17", "2027-12-18"],
    ["2028-01-13", "2028-01-15"], ["2028-01-28", "2028-01-29"],
    ["2028-02-11", "2028-02-12"], ["2028-02-25", "2028-02-26"],
    ["2028-03-10", "2028-03-11"], ["2028-03-24", "2028-03-25"],
    ["2028-04-07", "2028-04-08"], ["2028-04-21", "2028-04-22"],
    ["2028-05-05", "2028-05-06"]
  ],

  // Multi-day program milestones (shown under "Program events")
  milestones: [
    { id: "pm-math", title: "Pre-Program Math Course", date: "2026-07-10", endDate: "2026-07-12" },
    { id: "pm-orientation", title: "Orientation", date: "2026-07-12", endDate: "2026-07-13" },
    { id: "pm-res-2026", title: "Residence Weeks", date: "2026-07-14", endDate: "2026-07-25" },
    { id: "pm-gnw-2027", title: "EMBA Global Network Week", date: "2027-06-14", endDate: "2027-06-18" },
    { id: "pm-res-2027", title: "Residence Week", date: "2027-07-17", endDate: "2027-07-24" },
    { id: "pm-commencement", title: "Commencement", date: "2028-05-22" }
  ],

  // Every course the cohort takes. Color is used for chips, pills, and calendar entries.
  // faculty: full names verified against the Yale SOM faculty directory (Oct 2026); entries with
  // `verify` were matched by last name only and should be confirmed from the syllabus.
  courseRegistry: {
    MGT401: { code: "MGT 401E", name: "Managing Groups & Teams", color: "#7a4f9a",
      faculty: [{ name: "Jennifer Dannals", title: "Associate Professor of Organizational Behavior", url: "https://som.yale.edu/faculty-research/faculty-directory/jennifer-dannals" }] },
    MGT404: { code: "MGT 404E", name: "Economics / Game Theory", color: "#8a6d1f",
      faculty: [{ name: "Evangelia (Eva) Chalioti", title: "Senior Lecturer, Department of Economics (Economics)", url: "https://som.yale.edu/faculty-research/faculty-directory/evangelia-chalioti" }, { name: "Jidong Zhou", title: "Professor of Economics (Game Theory)", url: "https://som.yale.edu/faculty-research/faculty-directory/jidong-zhou" }] },
    MGT405: { code: "MGT 405E", name: "Modeling Managerial Decisions", color: "#2f6f6a",
      faculty: [{ name: "Anjani Jain", title: "Deputy Dean for Academic Programs & Professor in the Practice of Management", url: "https://som.yale.edu/faculty-research/faculty-directory/anjani-jain", verify: "Matched by last name and field; not yet confirmed from a syllabus." }, { name: "Nathan Novemsky", title: "Professor of Marketing", url: "https://som.yale.edu/faculty-research/faculty-directory/nathan-novemsky" }] },
    MGT407: { code: "MGT 407E", name: "Statistics", color: "#4b6584",
      faculty: [{ name: "Peter K. Schott" }] },
    MGT408: { code: "MGT 408E", name: "Negotiations", color: "#a3496b",
      faculty: [{ name: "Daylian Cain", title: "Senior Lecturer in Negotiation, Sales, and Leadership", url: "https://som.yale.edu/faculty-research/faculty-directory/daylian-cain" }, { name: "Barry Nalebuff", title: "Milton Steinbach Professor of Management", url: "https://som.yale.edu/faculty-research/faculty-directory/barry-nalebuff" }] },
    MGT409: { code: "MGT 409", name: "AI Foundations for Managers", color: "#6c3fc5",
      faculty: [{ name: "Tauhid Zaman", title: "Lecturer in Management and Special Advisor for AI Initiatives", url: "https://som.yale.edu/faculty-research/faculty-directory/tauhid-zaman" }] },
    MGT410: { code: "MGT 410E", name: "Competitor", color: "#c0392b",
      faculty: [{ name: "Kevin Williams" }] },
    MGT411: { code: "MGT 411E", name: "Customer", color: "#1f7a4d",
      faculty: [{ name: "K. Sudhir" }] },
    MGT412: { code: "MGT 412E", name: "Investor", color: "#b35c00",
      faculty: [{ name: "William N. Goetzmann", url: "https://som.yale.edu/faculty-research/faculty-directory/william-n-goetzmann" }] },
    MGT413: { code: "MGT 413E", name: "State & Society", color: "#5b6b2e",
      faculty: [{ name: "Gautam Mukunda", title: "Lecturer in the Practice of Management", url: "https://som.yale.edu/faculty-research/faculty-directory/gautam-mukunda" }] },
    MGT420: { code: "MGT 420E", name: "The Workforce", color: "#9c3d8f",
      faculty: [{ name: "James N. Baron", title: "William S. Beinecke Professor of Management", url: "https://som.yale.edu/faculty-research/faculty-directory/james-n-baron" }, { name: "Laura Adler", title: "Assistant Professor of Organizational Behavior", url: "https://som.yale.edu/faculty-research/faculty-directory/laura-adler" }, { name: "Kim", title: "Likely Minjae Kim, Assistant Professor of Organizational Behavior", url: "https://som.yale.edu/faculty-research/faculty-directory/minjae-kim", verify: "The schedule says only \"Kim\"; Yale SOM has more than one Professor Kim. Confirm when the syllabus is out." }] },
    MGT421: { code: "MGT 421E", name: "Innovator", color: "#00838f",
      faculty: [{ name: "Balázs Kovács", title: "Professor of Organizational Behavior", url: "https://som.yale.edu/faculty-research/faculty-directory/balazs-kovacs" }, { name: "Tristan L. Botelho", title: "Associate Professor of Organizational Behavior", url: "https://som.yale.edu/faculty-research/faculty-directory/tristan-l-botelho" }] },
    MGT422: { code: "MGT 422E", name: "Operations Engine", color: "#d35400",
      faculty: [{ name: "Lesley Meng" }] },
    MGT423: { code: "MGT 423E", name: "Sourcing & Managing Funds", color: "#2e5e9e",
      faculty: [{ name: "K. Geert Rouwenhorst", title: "Robert B. and Candice J. Haas Professor of Corporate Finance", url: "https://som.yale.edu/faculty-research/faculty-directory/k-geert-rouwenhorst" }, { name: "Jacob Thomas", title: "Williams Brothers Professor of Accounting and Finance", url: "https://som.yale.edu/faculty-research/faculty-directory/jacob-thomas", verify: "Matched by last name and field; not yet confirmed from a syllabus." }] },
    MGT425: { code: "MGT 425E", name: "Global Macroeconomy", color: "#6d4c41",
      faculty: [{ name: "Kevin Donovan", title: "Associate Professor of Economics", url: "https://som.yale.edu/faculty-research/faculty-directory/kevin-donovan" }] },
    MGT592: { code: "MGT 592E", name: "Legal Context of Management", color: "#455a64",
      faculty: [{ name: "Douglas Kysar", title: "Joseph M. Field '55 Professor of Law, Yale Law School", url: "https://law.yale.edu/douglas-kysar" }] },
    MGT699: { code: "MGT 699E", name: "Colloquium", color: "#286dc0",
      faculty: [{ name: "Todd Cort", title: "Faculty Director", url: "https://som.yale.edu/faculty-research/faculty-directory/todd-cort" }, { name: "Howard P. Forman", title: "Faculty Director", url: "https://medicine.yale.edu/profile/howard-forman/" }, { name: "William N. Goetzmann", title: "Faculty Director", url: "https://som.yale.edu/faculty-research/faculty-directory/william-n-goetzmann" }] },
    PROGRAM: { code: "EMBA", name: "Program", color: "#00356b" }
  }
};
