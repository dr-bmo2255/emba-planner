-- EMBA Planner database (Cloudflare D1 / SQLite). Times are ISO-8601 UTC strings.

-- People -------------------------------------------------------------------------------
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,           -- lowercase @yale.edu
  name        TEXT,                           -- set on first sign-in
  role        TEXT NOT NULL DEFAULT 'student', -- 'student' | 'admin'
  cal_token   TEXT NOT NULL UNIQUE,           -- secret in this user's calendar-feed URLs
  created_at  TEXT NOT NULL
);

-- One pending sign-in code per email (stored hashed; 10-minute life, 5 tries).
CREATE TABLE login_codes (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);

-- Fixed-window rate limits (sign-in requests per email and per IP).
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

-- Browser sessions; id is the SHA-256 of the cookie value.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Personal access tokens (e.g. the iPhone "Add to EMBA Planner" shortcut); id = SHA-256 of token.
CREATE TABLE api_tokens (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Course data ----------------------------------------------------------------------------
-- Documents: 'program', 'sessions', 'course:MGT410', ...
CREATE TABLE docs (
  key         TEXT PRIMARY KEY,
  json        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Every publish / remove / undo, with before & after, so any change can be undone.
CREATE TABLE doc_changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL,
  before_json TEXT,                           -- NULL = document didn't exist
  after_json  TEXT,                           -- NULL = document removed
  message     TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

-- Personal to-do state -------------------------------------------------------------------
CREATE TABLE completions (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  done_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE user_settings (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  my_courses  TEXT                           -- JSON array of course ids; NULL = all courses
);

-- Working teams ---------------------------------------------------------------------------
CREATE TABLE teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  invite_code TEXT UNIQUE,                    -- NULL = invite link turned off
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE team_members (
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  joined_at   TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_members_user ON team_members(user_id);

-- Meetings: kind 'once' uses date; kind 'weekly' repeats on weekdays every `every` weeks
-- from start_date through until_date (inclusive), minus meeting_skips.
CREATE TABLE meetings (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL,                  -- 'once' | 'weekly'
  date        TEXT,                           -- once: YYYY-MM-DD
  start_date  TEXT,                           -- weekly
  until_date  TEXT,                           -- weekly
  weekdays    TEXT,                           -- weekly: e.g. "0,3" (0 = Sunday)
  every       INTEGER NOT NULL DEFAULT 1,     -- weekly: 1 = every week, 2 = every other week
  start_time  TEXT NOT NULL,                  -- HH:MM Eastern
  end_time    TEXT NOT NULL,
  location    TEXT,                           -- room or Zoom link
  notes       TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX meetings_team ON meetings(team_id);

CREATE TABLE meeting_skips (
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  PRIMARY KEY (meeting_id, date)
);
