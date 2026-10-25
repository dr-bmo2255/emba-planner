// MGT 411E Customer - Fall 2026. Source: MGT411E_Fall2026_Syllabus.pdf
(function () {
  const F = "https://yale.instructure.com/courses/122094/files/folder/";
  const S1 = F + "Sessions%201A%20and%201B%3A%20August%2014%2C%202026/";
  const S2 = F + "Sessions%202A%20and%202B%3A%20August%2028%2C%202026/";
  const S3 = F + "Sessions%203A%20and%203B%3A%20September%2011%2C%202026/";
  const S4 = F + "Sessions%204A%20and%204B%3A%20September%2026%2C%202026/";
  const S5 = F + "Sessions%205A%20and%205B%3A%20October%209%2C%202026/";
  const S6 = F + "Sessions%206A%20and%206B%3A%20October%2023%2C%202026/";
  const CASE_NOTE = "Group. Answer all discussion questions in a PowerPoint deck (1-2 slides per question). Due at the start of class, uploaded to Canvas. Best 3 of 4 case assignments count (30% total).";

  EMBA.courses.push({
    id: "MGT411",
    code: "MGT 411E",
    name: "Customer",
    term: "Fall 2026",
    instructor: "K. Sudhir",
    canvas: "https://yale.instructure.com/courses/122094",
    contacts: [
      { role: "Professor", name: "K. Sudhir" },
      { role: "TA", name: "Richard Archer" }
    ],
    grading: [
      { label: "Final paper (individual)", weight: 35 },
      { label: "Case assignments, best 3 of 4 (group)", weight: 30 },
      { label: "TIAA capstone case (group)", weight: 10 },
      { label: "TIAA ad (group)", weight: 10 },
      { label: "Class participation", weight: 10 },
      { label: "Consumer choice exercise (individual)", weight: 5 }
    ],
    notes: "Cold calls at the start of each session. Missing more than 2 classes = zero participation. AI use not allowed without instructor permission.",

    topics: [
      { date: "2026-08-14", start: "09:00", label: "1A Framework for Marketing Analysis (3Cs-STP-4Ps)" },
      { date: "2026-08-14", start: "10:35", label: "1B Positioning and Branding" },
      { date: "2026-08-28", start: "09:00", label: "2A Market Segmentation (Case: Inspire Medical Systems)" },
      { date: "2026-08-28", start: "10:35", label: "2B Customer Analysis I: CLV and CRM" },
      { date: "2026-09-11", start: "09:00", label: "3A STP and CLV (Case: Chase Sapphire)" },
      { date: "2026-09-11", start: "10:35", label: "3B Customer Analysis II: Consumer Choice and Persuasion" },
      { date: "2026-09-26", start: "08:00", label: "4A Social Marketing in Emerging Markets (Case: HIV Prevention)" },
      { date: "2026-09-26", start: "09:35", label: "4B Digital Marketing, Social Media, Influencer Marketing" },
      { date: "2026-10-09", start: "09:00", label: "5A Digital Strategy and Influencer Marketing (Case: Melissa Wood Health)" },
      { date: "2026-10-09", start: "10:35", label: "5B Creating a Customer Aligned Organization (ARC framework)" },
      { date: "2026-10-23", start: "09:00", label: "6A Extracting Customer Value through Pricing" },
      { date: "2026-10-23", start: "10:35", label: "6B Capstone Case: TIAA 2021" }
    ],

    items: [
      // ---- Deliverables
      { id: "411-inspire", type: "assignment", title: "Case write-up: Inspire Medical Systems", date: "2026-08-28", time: "09:00",
        points: 10, mode: "group", required: true, notes: CASE_NOTE },
      { id: "411-consumer-choice", type: "assignment", title: "Consumer Choice Survey Exercise", date: "2026-09-10", time: "17:00",
        points: 5, mode: "individual", required: true,
        notes: "Customer interview exercise, submitted via Canvas. Used to orient the 9/11 class discussion." },
      { id: "411-chase", type: "assignment", title: "Case write-up: Chase Sapphire", date: "2026-09-11", time: "09:00",
        points: 10, mode: "group", required: true, notes: CASE_NOTE },
      { id: "411-hiv", type: "assignment", title: "Case write-up: HIV Prevention", date: "2026-09-26", time: "08:00",
        points: 10, mode: "group", required: true, notes: CASE_NOTE },
      { id: "411-melissa", type: "assignment", title: "Case write-up: Melissa Wood Health", date: "2026-10-09", time: "09:00",
        points: 10, mode: "group", required: true, notes: CASE_NOTE },
      { id: "411-tiaa-case", type: "assignment", title: "TIAA 2021 Capstone: case deck", date: "2026-10-21", time: "17:00",
        points: 10, mode: "group", required: true,
        notes: "Answer all discussion questions in a PowerPoint deck. Groups selected to present are notified Thu 10/22 by 5 PM; one group presents (10 min) on 10/23.",
        links: [{ label: "TIAA 2021 case", url: S6 + "Required%20Readings?preview=12863347" }] },
      { id: "411-tiaa-ad", type: "assignment", title: "TIAA 2021 Capstone: ad", date: "2026-10-21", time: "17:00",
        points: 10, mode: "group", required: true,
        notes: "Submit the ad in any medium (video, audio, paper). Selected groups show their ad in class with a presentation of up to 4 minutes." },
      { id: "411-final-paper", type: "assignment", title: "Final paper: Personal Brand / Marketing Plan", date: "2026-11-01", time: "23:59",
        points: 35, mode: "individual", required: true,
        notes: "Personal branding and marketing plan using course ideas. Instructions released 9/26. Due Sunday 11/1 before midnight." },

      // ---- Readings and cases (due before class)
      { id: "411-r-intro", type: "reading", title: "Sudhir, \"The Customer Perspective: An Introductory Note\"", date: "2026-08-14", time: "09:00", required: true,
        links: [{ label: "Canvas", url: S1 + "Required%20Readings?preview=12863303" }] },
      { id: "411-r-segmentation", type: "reading", title: "Sudhir, \"Market Segmentation\"", date: "2026-08-14", time: "09:00", required: true,
        links: [{ label: "Canvas", url: S1 + "Required%20Readings?preview=12863294" }] },
      { id: "411-r-videos", type: "reading", title: "Customer Perspective Video Series (senior executives)", date: "2026-08-14", time: "09:00", required: false,
        notes: "Watch at leisure; the professor especially recommends Anil Menon's video.",
        links: [{ label: "Canvas", url: S1 + "Optional%20Readings?preview=12863288" }] },
      { id: "411-r-brand", type: "reading", title: "HBS Note: Brand Positioning (Avery & Gupta)", date: "2026-08-14", time: "10:35", required: true,
        links: [{ label: "Canvas", url: S1 + "Required%20Readings?preview=12864394" }] },
      { id: "411-c-inspire", type: "case", title: "Case: Inspire Medical Systems", date: "2026-08-28", time: "09:00", required: true,
        notes: "Discussion questions are posted separately on Canvas.",
        links: [{ label: "Canvas", url: S2 + "Required%20Readings?preview=12901718" }] },
      { id: "411-r-clv", type: "reading", title: "Sudhir, \"Note on Customer Lifetime Value (CLV)\"", date: "2026-08-28", time: "10:35", required: true,
        links: [{ label: "Canvas", url: S2 + "Required%20Readings?preview=12863297" }] },
      { id: "411-r-mckinsey", type: "reading", title: "McKinsey Quarterly: Preparing for loyalty's next frontier: Ecosystems", date: "2026-08-28", time: "10:35", required: false,
        links: [{ label: "Canvas", url: S2 + "Required%20Readings?preview=12863318" }] },
      { id: "411-c-chase", type: "case", title: "Case: Chase Sapphire", date: "2026-09-11", time: "09:00", required: true,
        links: [{ label: "Canvas", url: S3 + "Required%20Readings?preview=12864397" }] },
      { id: "411-r-consumer", type: "reading", title: "Sudhir, \"Consumer Behavior\"", date: "2026-09-11", time: "10:35", required: true,
        links: [{ label: "Canvas", url: S3 + "Required%20Readings?preview=12863289" }] },
      { id: "411-c-hiv", type: "case", title: "Case: HIV Prevention (lenacapavir in South Africa)", date: "2026-09-26", time: "08:00", required: true,
        notes: "Case distributed on Canvas (TBA in syllabus)." },
      { id: "411-r-dogood", type: "reading", title: "HBR: Do Better at Doing Good", date: "2026-09-26", time: "08:00", required: true,
        links: [{ label: "Canvas", url: S4 + "Required%20Readings?preview=12864398" }] },
      { id: "411-r-digital", type: "reading", title: "Digital Marketing (Gupta & Davin)", date: "2026-09-26", time: "09:35", required: true,
        links: [{ label: "Canvas", url: S4 + "Required%20Readings?preview=12864457" }] },
      { id: "411-r-socialmedia", type: "reading", title: "HBS Note: Social Media (9-510-095)", date: "2026-09-26", time: "09:35", required: false,
        links: [{ label: "Canvas", url: S4 + "Optional%20Readings?preview=12864460" }] },
      { id: "411-c-melissa", type: "case", title: "Case: Melissa Wood Health", date: "2026-10-09", time: "09:00", required: true,
        links: [{ label: "Canvas", url: S5 + "Required%20Readings?preview=12864461" }] },
      { id: "411-r-saloner", type: "reading", title: "Saloner, Shepard & Podolny, Strategic Management, Ch. 4 \"Internal Context: Organizational Design\"", date: "2026-10-09", time: "10:35", required: true,
        links: [{ label: "Canvas", url: S5 + "Required%20Readings?preview=12863360" }] },
      { id: "411-r-pricing", type: "reading", title: "Sudhir, \"A Note on Pricing\"", date: "2026-10-23", time: "09:00", required: true,
        links: [{ label: "Canvas", url: S6 + "Required%20Readings?preview=12863317" }] },
      { id: "411-c-tiaa", type: "case", title: "Case: TIAA 2021", date: "2026-10-23", time: "10:35", required: true,
        links: [{ label: "Canvas", url: S6 + "Required%20Readings?preview=12863347" }] }
    ]
  });
})();
