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
- **Export .ics** of whatever is currently shown, for Google/Apple/Outlook calendars
- **Ask the Planner** chat (bottom-right): built-in answers for "what's due this week", "readings for
  Nov 7", "who teaches Operations", "how is Competitor graded" (no key needed); optional **Claude**
  for any question in your own words, through a shared proxy (`worker/`) or your own API key
- Full **professor names** with Yale profile links on every class session and course

> Unofficial, student-built. Always confirm dates on Canvas. Items marked **⚠ verify** need a human check.

## Updating (maintainers)

New syllabus? In Claude Code, from this folder:

```
/add-syllabus syllabi/<the-syllabus>.pdf
```

The skill extracts the text and links, writes `data/courses/MGTxxx.js`, registers it in `index.html`,
and lists anything it couldn't confirm. New master schedule from the EMBA office:

```
/add-syllabus syllabi/<schedule>.xlsx
```

## Turn on Claude for the whole cohort (optional)

Deploy the small proxy in `worker/` (see `worker/README.md`), then set
`EMBA.program.assistant.endpoint` in `data/program.js` to its URL.

## Publish on GitHub Pages

1. Create a repo (e.g. `emba-planner`) and push this folder.
2. Repo **Settings → Pages → Deploy from branch → `main` / root**.
3. Share `https://<your-username>.github.io/emba-planner/` with the cohort.

`syllabi/` is git-ignored so school PDFs and contact details never get published.
