# EMBA Planner

Static site (no build step) on GitHub Pages, plus a Cloudflare Worker (`worker/`). Serve locally
with `python3 -m http.server 8028` (not `file://`). Live: https://dr-bmo2255.github.io/emba-planner/

Data (all JSON, loaded by `assets/data.js`, fetched no-cache):
- `data/program.json`: class weekends, milestones, `courseRegistry` (name, color, faculty for every course), chat endpoint
- `data/sessions.json`: GENERATED from the master schedule .xlsx by `tools/import_master_schedule.py`
- `data/courses/<ID>.json` + `data/courses/index.json`: one file per course (schema in `.claude/skills/add-syllabus/SKILL.md`)

UI:
- `index.html` + `assets/app.js`: planner (list / calendar / by-course, dropdown filters, Dates menu, details modal, Add to calendar, install button)
- `assets/assistant.js`: "Ask the Planner" chat (built-in answers + Claude via the Worker)
- `admin.html` + `assets/admin.js`: maintainer-only Manage courses page (passcode); not linked from the planner
- `manifest.webmanifest`, `sw.js`, `assets/icons/`: installable app + offline
- Layout tiers in `assets/styles.css`: laptop >= 1024, tablet 601-1023, phone <= 600 (dot calendar + agenda)

Worker (`worker/src`): `/v1/messages` chat proxy, `/calendar.ics` public live feed, `/admin/*`
(extract with Claude, publish/remove/undo as GitHub commits, iPhone share-sheet inbox in KV).
Secrets: ANTHROPIC_API_KEY, GITHUB_TOKEN, ADMIN_PASSCODE. Deploy: `cd worker && npx wrangler deploy`.

Rules:
- Item `id`s never change once published: checkmarks are stored per viewer by id.
- After changing any asset, bump `?v=` in `index.html`/`admin.html` and `VERSION` in `sw.js`.
- The repo is public: never commit syllabus PDFs (`syllabi/` is git-ignored) or email addresses.
