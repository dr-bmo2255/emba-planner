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
| `ADMIN_EMAILS` | wrangler.toml | Maintainer accounts (comma-separated @yale.edu) |
| `EMAIL_MODE` / `EMAIL_FROM` | wrangler.toml | `resend` and a sender on your verified domain |
| D1 `database_id` | wrangler.toml | From `npx wrangler d1 create emba-planner` |

Deploy: `npx wrangler d1 migrations apply DB --remote`, seed once with `--remote`, then `npx wrangler deploy`.

## Security notes

- Sessions are HttpOnly, Secure, SameSite=Lax cookies; cross-site writes are refused.
- Sign-in codes are stored hashed, expire in 10 minutes, allow 5 tries; requests are rate-limited.
- Calendar feeds can't sign in, so each student's feed URLs carry a private, resettable token.
- Teams are visible only to members (and the maintainer, who can remove a team).
- The chat and extraction endpoints require a signed-in user, so the Anthropic key can't be used anonymously.
