-- Change logs for admins (course data has its own: doc_changes) and the weekly Canvas report archive.
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('user', 'admin', 'team')),
  message     TEXT NOT NULL,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX audit_log_kind ON audit_log (kind, id);

-- Every weekly Canvas report, kept to look back on (the latest also lives in KV for the Courses page).
CREATE TABLE canvas_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at   TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  summary      TEXT NOT NULL,  -- e.g. "7 syllabi · 11 date differences · 0 new"
  json         TEXT NOT NULL
);
