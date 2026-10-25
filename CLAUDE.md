# EMBA Planner

Static site (no build step) that combines every EMBA course's deliverables, readings, and class sessions.
Hosted on GitHub Pages; open `index.html` through a local server (`python3 -m http.server 8028`),
not `file://`.

- `data/program.js`: class weekends, milestones, `courseRegistry` (name + color for every course)
- `data/sessions.js`: GENERATED from the master schedule .xlsx by `tools/import_master_schedule.py`
- `data/courses/MGTxxx.js`: one file per syllabus (schema in `.claude/skills/add-syllabus/SKILL.md`)
- `assets/app.js`: all UI (list / calendar / by-course views, filters, details modal, .ics export)
- `assets/assistant.js`: "Ask the Planner" chat (built-in answers + Claude via `worker/` proxy or a viewer's own key)
- `worker/`: Cloudflare Worker that proxies Claude calls so no key lives in the browser
- Faculty full names live in `courseRegistry[*].faculty` (sessions only carry last names)

After any change, bump the `?v=` version on every asset/data URL in `index.html` so returning
visitors don't get stale cached files.

To add or update a course from a syllabus, use the `/add-syllabus` skill.

Item `id`s must never change once published: checkmarks are stored in each viewer's localStorage by id.
`syllabi/` is git-ignored on purpose. Never commit source PDFs.
