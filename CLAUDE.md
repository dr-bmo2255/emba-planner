# EMBA Planner

One Cloudflare Worker (`worker/`) serves the site (`public/`, static assets) and its API on a single
origin, backed by a D1 database. Sign-in is a 6-digit code emailed to a @yale.edu address.

Run locally (codes show on screen; `.dev.vars` makes test.admin@yale.edu the admin):
`cd worker && npx wrangler d1 migrations apply DB --local && python3 ../tools/seed_db.py && npx wrangler d1 execute DB --local --file seed.sql && npx wrangler dev`

- `worker/src/index.js`: router. `auth.js` (codes, sessions, admin role via ADMIN_EMAILS), `docs.js`
  (course data + change history/undo, admin per-item edits, iPhone inbox, shortcut keys), `me.js`
  (checkmarks, my courses, private per-item notes, calendar token), `teams.js` (teams, invites, meetings, skips), `calendar.js` (private feeds:
  `/cal/<token>/courses.ics?courses=…`, `/cal/<token>/team/<id>.ics`), `extract.js` (Claude syllabus
  extraction), `proxy.js` (chat; only the browser-side `save_note` tool may pass), `email.js` (Resend in production, console log locally)
- `worker/migrations/`: D1 schema. `seed/`: the original course JSON, loaded by `tools/seed_db.py`
- `public/`: `index.html` + `assets/app.js` (planner), `signin.js`, `teams.js` (Teams view + meeting
  recurrence, must match calendar.js RRULE logic), `assistant.js` (chat), `admin.html` + `admin.js`
- Layout tiers in `assets/styles.css`: laptop >= 1024, tablet 601-1023, phone <= 600

Rules:
- Item `id`s never change once published: checkmarks are stored per student by id.
- After changing any asset, bump `?v=` in `public/index.html`/`admin.html` and `VERSION` in `public/sw.js`.
- The repo is public: never commit syllabus PDFs (`syllabi/` is git-ignored), emails, or `.dev.vars`.
