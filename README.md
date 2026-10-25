# EMBA Planner: Yale SOM EMBA Class of 2028

One place for every assignment, reading, case, and class session across all of our courses.
It's the combined view Canvas doesn't give us.

**Features**
- **List view** grouped by class weekend (everything due between one weekend and the next), with a "Today" marker
- **Calendar view**: short color-coded entries; hover for a preview, click for full details
- **By-course view** with grading breakdown and per-course progress
- Every deliverable shows **points (% of course grade)**, **group / individual**, and **required / optional**
- Readings and cases link straight to the Canvas file or case site
- **Checkboxes** gray out finished items; uncheck any time. Saved in *your* browser only.
- Category / course / requirement / group switches, plus **Show all** and **Clear output**
- **📅 Add to calendar**: one-tap subscribe in Apple, Google, or Outlook Calendar (a live feed that updates when a syllabus is published), or download a one-time .ics
- **📱 Install app**: add it to your phone or iPad home screen; works offline; layouts tuned for laptop, tablet, and phone
- **Ask the Planner** chat (bottom-right): built-in answers for "what's due this week", "readings for
  Nov 7", "who teaches Operations", "how is Competitor graded" (no key needed); optional **Claude**
  for any question in your own words, through a shared proxy (`worker/`) or your own API key
- Full **professor names** with Yale profile links on every class session and course

> Unofficial, student-built. Always confirm dates on Canvas. Items marked **⚠ verify** need a human check.

## Updating (maintainer only)

Open `admin.html` on the live site (not linked from the planner), enter the passcode, then drop a
syllabus PDF or paste a public course page. Claude extracts it, you review, and Publish commits it.
Every change can be undone there. On iPhone, the "Add to EMBA Planner" Shortcut sends a PDF from
Canvas's Share button straight to that page (setup steps are on the page).

Or, in Claude Code from this folder:

```
/add-syllabus syllabi/<the-syllabus>.pdf
```

The skill extracts the text and links, writes `data/courses/MGTxxx.json`, registers it in `data/courses/index.json`,
and lists anything it couldn't confirm. New master schedule from the EMBA office:

```
/add-syllabus syllabi/<schedule>.xlsx
```

## Turn on Claude for the whole cohort (optional)

Deploy the Worker in `worker/` (see `worker/README.md`), then set `assistant.endpoint` in
`data/program.json` to its URL. The same Worker serves the calendar feed and the Manage courses actions.

## Publish on GitHub Pages

1. Create a repo (e.g. `emba-planner`) and push this folder.
2. Repo **Settings → Pages → Deploy from branch → `main` / root**.
3. Share `https://<your-username>.github.io/emba-planner/` with the cohort.

`syllabi/` is git-ignored so school PDFs and contact details never get published.
