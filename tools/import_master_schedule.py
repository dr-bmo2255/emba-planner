"""Convert the EMBA master class schedule (.xlsx from the EMBA office) into data/sessions.json.

Usage:
    python3 tools/import_master_schedule.py syllabi/EMBA+C28+Student+Schedule+10-21-26.xlsx

The sheet layout is one column per class day. A row of weekday names is followed by a
row of dates, then one row per time slot ("9:00 am - 12:00 pm", "After Class", ...).
Cells look like "MGT 411E\\nCustomer\\nSudhir\\n4400", optionally prefixed with an
explicit time ("2:30 - 4:00 pm: ...") that overrides the slot's time.
"""
import datetime as dt
import json
import re
import sys
from pathlib import Path

import openpyxl

SKIP = re.compile(r"^(breakfast|lunch)", re.I)
TIME_RANGE = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)", re.I)
PREFIX = re.compile(r"^\s*(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm))\s*:\s*", re.I)
CODE = re.compile(r"^(MGT)\s*(\d{3})(E?)\s*(.*)$", re.I)


def to24(h, m, ampm):
    h, m = int(h), int(m or 0)
    if ampm and ampm.lower() == "pm" and h < 12:
        h += 12
    if ampm and ampm.lower() == "am" and h == 12:
        h = 0
    return f"{h:02d}:{m:02d}"


def parse_range(text):
    """'2:30 pm - 5:30 pm' or '2:30 - 4:00 pm' -> ('14:30', '16:00')."""
    m = TIME_RANGE.search(text or "")
    if not m:
        return None, None
    sh, sm, sap, eh, em, eap = m.groups()
    if not sap:
        # "2:30 - 4:00 pm": the start shares the end's meridiem unless that would put it after the end
        sap = eap if int(sh) <= int(eh) or int(eh) == 12 else ("am" if eap.lower() == "pm" else "pm")
    return to24(sh, sm, sap), to24(eh, em, eap)


def parse_cell(raw):
    text = str(raw).strip()
    start = end = None
    pm = PREFIX.match(text)
    if pm:
        start, end = parse_range(pm.group(1))
        text = text[pm.end():]
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return None
    m = CODE.match(lines[0])
    if not m:
        return {"kind": "event", "title": " ".join(lines), "start": start, "end": end}
    course = f"MGT{m.group(2)}"
    code = f"MGT {m.group(2)}{m.group(3).upper()}"
    rest = ([m.group(4).strip()] if m.group(4).strip() else []) + lines[1:]
    room = rest.pop() if rest and re.fullmatch(r"\d{3,4}|TBA", rest[-1]) else None
    name = rest[0] if rest else code
    instructor = " ".join(rest[1:]).replace("/ ", "/").strip() or None
    return {"kind": "session", "course": course, "code": code, "name": name,
            "instructor": instructor, "room": room, "start": start, "end": end}


def main(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows())
    sessions = []
    i = 0
    while i < len(rows):
        row = rows[i]
        # A date row: several datetime cells
        dates = {c.column: c.value.date() for c in row if isinstance(c.value, dt.datetime)}
        if len(dates) < 3:
            i += 1
            continue
        j = i + 1
        while j < len(rows):
            slot = rows[j]
            label = str(slot[0].value or "").strip()
            if label.lower().startswith(("date", "time")) or any(isinstance(c.value, dt.datetime) for c in slot):
                break
            s_start, s_end = parse_range(label)
            for c in slot[1:]:
                if c.column not in dates or c.value is None or SKIP.match(str(c.value).strip()):
                    continue
                item = parse_cell(c.value)
                if not item:
                    continue
                item["date"] = dates[c.column].isoformat()
                item["start"] = item["start"] or s_start
                item["end"] = item["end"] or s_end
                if item["kind"] == "event" and item["title"].lower().startswith("colloquium"):
                    item.update(kind="session", course="MGT699", code="MGT 699E", name="Colloquium",
                                instructor=None, room=None, title=None)
                sessions.append(item)
            j += 1
        i = j

    sessions.sort(key=lambda s: (s["date"], s["start"] or "99"))
    for s in sessions:
        s["id"] = "s-" + s["date"] + "-" + (s.get("course") or re.sub(r"\W+", "-", s["title"].lower()))[:24] + "-" + (s["start"] or "x").replace(":", "")
        for k in [k for k, v in s.items() if v is None]:
            del s[k]

    # GENERATED file - re-run this importer when the EMBA office publishes a new master schedule.
    out = Path(__file__).resolve().parent.parent / "data" / "sessions.json"
    out.write_text(json.dumps({"source": Path(path).name, "sessions": sessions}, indent=1) + "\n")
    print(f"Wrote {len(sessions)} sessions to {out}")


if __name__ == "__main__":
    main(sys.argv[1])
