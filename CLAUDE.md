# EMBA Planner

One Cloudflare Worker (`worker/`) serves the site (`public/`, static assets) and its API on a single
origin, backed by a D1 database. Sign-in is a 6-digit code emailed to a @yale.edu address.

Run locally (codes show on screen; `.dev.vars` makes test.admin@yale.edu the admin):
`cd worker && npx wrangler d1 migrations apply DB --local && python3 ../tools/seed_db.py && npx wrangler d1 execute DB --local --file seed.sql && npx wrangler dev`

- `worker/src/index.js`: router. `auth.js` (codes, sessions; ADMIN_EMAILS owners are always admin), `users.js` (admin Accounts list, make/remove admins in the app), `canvas.js` (weekly Canvas check: latest report + dismissed keys in KV, every report archived in `canvas_reports`), change logs: `util.logEvent` → `audit_log` (user/admin/team; team lines never name members), read via `users.changeLog`, `docs.js`
  (course data + change history/undo, admin per-item edits, iPhone inbox, shortcut keys), `me.js`
  (checkmarks, my courses, private per-item notes, calendar token), `teams.js` (teams, invites, meetings, skips), `calendar.js` (private feeds:
  `/cal/<token>/courses.ics?courses=…`, `/cal/<token>/team/<id>.ics`), `extract.js` (Claude syllabus
  extraction; for a course web site, `crawlSite` also reads up to 25 same-folder subpages, homework/project/grading first), `proxy.js` (chat on Haiku 5.5 via CHAT_MODEL; only the browser-side `save_note` tool may pass), `guard.js` (chat safety harness: off switch, rate limits, size caps, foul-language blocklist, server-owned ground rules), `email.js` (Resend in production, console log locally)
- `worker/migrations/`: D1 schema. `seed/`: the original course JSON, loaded by `tools/seed_db.py`
- `public/`: `index.html` + `assets/app.js` (planner), `signin.js`, `teams.js` (Teams view + meeting
  recurrence, must match calendar.js RRULE logic), `assistant.js` (chat), admin pages: `admin.html` + `admin.js` (courses), `admin-people.html` + `admin-people.js` (accounts, admins, teams), shared `admin-common.js`
- Weekly Canvas check: `.claude/skills/canvas-check/SKILL.md`, run by a local scheduled task with Claude in Chrome; reads Canvas read-only, uploads syllabus PDFs to `/api/inbox`, posts `/api/admin/canvas/report` with the admin key in `~/.config/emba-planner/planner-key`. Shown as "From Canvas" on admin.html
- Layout tiers in `assets/styles.css`: laptop >= 1024, tablet 601-1023, phone <= 600

Rules:
- Item `id`s never change once published: checkmarks are stored per student by id.
- After changing any asset, bump `?v=` in `public/index.html`/`admin.html`/`admin-people.html` (and the admin-common.js imports) and `VERSION` in `public/sw.js`.
- The repo is public: never commit syllabus PDFs (`syllabi/` is git-ignored), emails, or `.dev.vars`.
