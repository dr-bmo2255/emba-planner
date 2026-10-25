---
name: add-syllabus
description: Add or update a course in the EMBA Planner from a syllabus PDF (or refresh the master class schedule from the EMBA office .xlsx) from the command line. Use when the user hands Claude Code a syllabus file or says a schedule changed. (The maintainer can also do this in the browser at admin.html.)
---

# Add a syllabus to the EMBA Planner

Input: a path to a syllabus PDF (or the master schedule `.xlsx`). If the user gave none, ask for it.

## 0. Setup (once per machine)

```bash
python3 -m venv .venv && .venv/bin/pip install -q -r tools/requirements.txt
```

Copy the source document into `syllabi/` (git-ignored; it is never published).

## 1. Master schedule (.xlsx) instead of a syllabus?

Run `.venv/bin/python tools/import_master_schedule.py syllabi/<file>.xlsx`, which regenerates
`data/sessions.json`. Diff it (`git diff --stat data/sessions.json`) and summarize what moved. Also update
`data/program.json` `classWeekends` / `milestones` if a new Program Calendar was provided. Then skip to step 5.

## 2. Extract the syllabus

```bash
.venv/bin/python tools/extract_syllabus.py syllabi/<file>.pdf
```

Read ALL of the output. The `LINKS` section pairs each URL with the words it is anchored on.
Use it to attach Canvas/case links to the right reading. Never invent a URL.

## 3. Write `data/courses/<ID>.json`

`<ID>` is `MGT` + the 3-digit number (e.g. `MGT412`), matching `courseRegistry` in `data/program.json`
and the `course` field in `data/sessions.json`. If the file exists, update it in place and keep every
existing `id` stable, because users' checkmarks are keyed by `id`. Follow `data/courses/MGT411.json` as the
canonical example. Schema (plain JSON):

```js
{
  id, code, name, term,
  faculty:  [{ name, title?, url? }],      // full names
  canvas,                 // course Canvas URL if any link reveals /courses/<n>
  contacts: [{ role, name }],          // no emails: the repo is public
  grading:  [{ label, weight }],          // weights sum to 100
  resources:[{ label, url }],             // optional, undated
  notes,                                  // AI policy, attendance rules: short
  topics:   [{ date, start?, label }],    // overlays master-schedule sessions (start picks A/B half)
  speakers: [...],                        // Colloquium-style only
  items: [{
    id,                   // "<num>-<slug>", unique and stable
    type,                 // assignment | exam | reading | case | office | event
    title, date /* "YYYY-MM-DD" or null if TBA */, time /* "HH:MM" 24h ET */, endDate?,
    points,               // % of course grade. REQUIRED for assignment/exam.
    mode,                 // "individual" | "group" | null (unknown). Assignments/exams.
    required,             // true | false. Assignments, exams, readings, cases.
    links: [{ label, url }], notes, verify  // verify = what a human should double-check
  }],
  source: { type: "syllabus", file, updated }   // or { type: "web", url, updated }
}
```

Rules:
- **Every assignment/exam needs `points`.** If the syllabus gives a bucket ("3 problem sets, 40%"),
  split evenly and add `verify: "Points split evenly: ..."`. If it gives nothing, set `points: null`
  and explain in `verify`.
- **Group vs individual** comes from the syllabus wording; if unclear use `null` and say why in `verify`.
- **Required vs optional:** readings/cases listed as optional, recommended, or textbook "highly recommended" → `required: false`.
- Readings and cases are dated to the class session they prepare for, with `time` = that session's start
  (use the half-session start for "A"/"B" splits so they overlay correctly).
- Due times: "before 8am" → `"08:00"`; "midnight"/"end of day" → `"23:59"`; "start of class" → session start.
- Cross-check dates against `data/sessions.json` (the master schedule). If the syllabus and the master
  schedule disagree, keep the syllabus date and add a `verify` note naming both.
- Office hours / review sessions → `type: "office"` with Zoom links when given.
- Don't copy syllabus prose wholesale; titles plus one-line notes are enough. No personal phone numbers.

## 4. Register it

- Add the id to `data/courses/index.json` (`courses`, sorted) and set its `updated` to today.
- If the course is missing from `courseRegistry` in `data/program.json`, add it with a distinct color
  that is readable as white text.
- Remove any `verify` flag on `courseRegistry.<ID>.faculty` that the syllabus now confirms.

## 5. Verify, then commit and push (live in about a minute)

Serve the folder (`python3 -m http.server 8028`) or use the `emba-planner` preview, then check that there
are no console errors, the new course appears in List, Calendar, and By course, links open, and the
points and work/requirement tags show. Report to the user:
- counts added (assignments, exams, readings, cases, office hours)
- every `verify` flag you set, verbatim, so they can confirm
- any conflicts with the master schedule or the cohort tracker
