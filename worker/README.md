# EMBA Planner Worker

Serves the planner (`../public`) and its API from one origin, with a D1 database.

## Local development

```bash
cd worker
npm install
npx wrangler d1 migrations apply DB --local
python3 ../tools/seed_db.py && npx wrangler d1 execute DB --local --file seed.sql
npx wrangler dev        # http://localhost:8787
```

`.dev.vars` (git-ignored) holds local-only settings: `DEV_SHOW_CODES="1"` shows sign-in codes on screen
instead of emailing them, and `ADMIN_EMAILS="test.admin@yale.edu"` makes that test account the admin.
Add `ANTHROPIC_API_KEY=...` there to try the chat and syllabus extraction locally.

## Production settings

| Setting | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | Chat and syllabus extraction |
| `RESEND_API_KEY` | secret | Sends sign-in codes (resend.com) |
| `ADMIN_EMAILS` | secret | Owner accounts (comma-separated @yale.edu), always admin. Owners and admins can add more admins on Manage courses → Accounts |
| `CHAT_MODEL` / `CHAT_MAX_TOKENS` / `CHAT_ENABLED` | wrangler.toml | Chat model (default `claude-haiku-5-5`), reply cap, and off switch (`"0"`) |
| `EXTRACT_MODEL` | wrangler.toml | Syllabus reading (`claude-opus-5-5`) |
| `EMAIL_MODE` / `EMAIL_FROM` | wrangler.toml | `resend` and a sender on your verified domain |
| D1 `database_id` | wrangler.toml | From `npx wrangler d1 create emba-planner` |

Deploy: `npx wrangler d1 migrations apply DB --remote`, seed once with `--remote`, then `npx wrangler deploy`.

## Security notes

- Sessions are HttpOnly, Secure, SameSite=Lax cookies; cross-site writes are refused.
- Sign-in codes are stored hashed, expire in 10 minutes, allow 5 tries; requests are rate-limited.
- Calendar feeds can't sign in, so each student's feed URLs carry a private, resettable token.
- Teams are visible only to members (and the maintainer, who can remove a team).
- The chat and extraction endpoints require a signed-in user, so the Anthropic key can't be used anonymously.
- Chat safety harness (`src/guard.js`, all server-side): off switch; 30 messages per student per hour and 1,500
  per day for the class; question and conversation size caps; a foul-language blocklist that refuses before any
  model call; server-owned ground rules placed first in the system prompt (on topic, accurate, academic
  integrity, clean language, kind, private, injection-resistant, no professional advice). The page also masks
  any foul word in replies.
- Weekly Canvas check (`src/canvas.js`): a scheduled Claude task on the maintainer's Mac reads Canvas read-only
  and posts a report with an admin shortcut key; it can't publish. Admins review it on the Courses page.
- Admin changes: an owner (ADMIN_EMAILS) can't be demoted, and nobody can remove their own admin access.
