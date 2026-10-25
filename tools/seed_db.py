"""Write worker/seed.sql: loads seed/*.json into the D1 `docs` table (program, sessions, courses).

Usage:
    python3 tools/seed_db.py                  # first-time load: INSERT OR IGNORE (never overwrites)
    python3 tools/seed_db.py --replace MGT412 # publish one course from seed/courses/MGT412.json (undoable)
    cd worker && npx wrangler d1 execute DB --local --file seed.sql    # use --remote for production

The Manage courses page (admin.html) is the usual way to publish; --replace is for the command line.
"""
import sys
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
seed = root / "seed"
now = datetime.now(timezone.utc).isoformat(timespec="seconds")


def q(s):
    return "'" + s.replace("'", "''") + "'"


docs = {
    "program": json.loads((seed / "program.json").read_text()),
    "sessions": json.loads((seed / "sessions.json").read_text()),
}
for cid in json.loads((seed / "courses" / "index.json").read_text())["courses"]:
    docs["course:" + cid] = json.loads((seed / "courses" / (cid + ".json")).read_text())

if "--replace" in sys.argv:
    cid = sys.argv[sys.argv.index("--replace") + 1]
    key = "course:" + cid
    body = json.dumps(docs[key], separators=(",", ":"))
    c = docs[key]
    lines = [
        # Log the change (with the previous version) so it can be undone from Manage courses.
        f"INSERT INTO doc_changes (key, before_json, after_json, message, created_at) SELECT {q(key)}, (SELECT json FROM docs WHERE key = {q(key)}), {q(body)}, {q('Update ' + c['code'] + ' ' + c['name'] + ' (command line)')}, {q(now)};",
        f"INSERT INTO docs (key, json, updated_at) VALUES ({q(key)}, {q(body)}, {q(now)}) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at;",
    ]
else:
    lines = [f"INSERT OR IGNORE INTO docs (key, json, updated_at) VALUES ({q(k)}, {q(json.dumps(v, separators=(',', ':')))}, {q(now)});"
             for k, v in docs.items()]
(root / "worker" / "seed.sql").write_text("\n".join(lines) + "\n")
print(f"Wrote {len(lines)} documents to worker/seed.sql")
