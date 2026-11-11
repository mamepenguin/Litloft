"""Compare each Ask citation quote against the stored transcript/doc chunks.

Usage: python3 -I check.py <sse.txt> <search.db>
Read-only: opens the DB with mode=ro.
"""
import json
import re
import sqlite3
import sys

sse_path, db_path = sys.argv[1], sys.argv[2]
db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
WINDOW = 60.0

events = []
event = None
for line in open(sse_path, encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("event:"):
        event = line[6:].strip()
    elif line.startswith("data:"):
        try:
            events.append((event, json.loads(line[5:].strip())))
        except Exception:
            pass

final = [d for e, d in events if e == "citations"]
cites = final[-1] if final else [d for e, d in events if e == "citation"]
if isinstance(cites, dict):
    cites = cites.get("citations", [cites])
print("events:", sorted({e for e, _ in events}))
print("n citations:", len(cites))


def secs(loc):
    m = re.fullmatch(r"(?:(\d+):)?(\d+):(\d{2})", loc or "")
    if not m:
        return None
    h, mi, s = m.groups()
    return int(h or 0) * 3600 + int(mi) * 60 + int(s)


for i, c in enumerate(cites, 1):
    q = (c.get("quote") or "")
    loc = c.get("segment_location")
    print(f"\n[{i}] {c['file_id']} {c.get('file_type')} loc={loc!r} filename={c['filename'][:50]}")
    print("   quote:", q[:120])
    s = secs(loc)
    head = q.rstrip("…")[:25]
    if s is not None:
        rows = db.execute(
            "select chunk_index, timestamp_start, timestamp_end, text from transcript_chunks "
            "where file_id=? and timestamp_end > ? and timestamp_start < ? order by chunk_index",
            (c["file_id"], s - WINDOW - 30, s + WINDOW + 30),
        ).fetchall()
        hit = [r for r in rows if head and r[3].strip().startswith(head[:12])]
        first_after = next((r for r in rows if r[2] > s), None)
        for r in hit:
            print(f"   quote starts at chunk {r[0]} [{r[1]:.1f}-{r[2]:.1f}] (delta to cited {r[1]-s:+.1f}s)")
        if not hit:
            print("   quote start not found at a chunk start in +-90s")
        if first_after:
            print(f"   first chunk ending after {s}s: {first_after[0]} [{first_after[1]:.1f}-{first_after[2]:.1f}] {first_after[3][:40]!r}")
    else:
        rows = db.execute(
            "select chunk_index, page, substr(text,1,60) from fts_text_content where file_id=? and text like ? limit 3",
            (c["file_id"], (head[:15].replace('%', '') + '%')),
        ).fetchall()
        print("   chunks starting with quote head:", rows)
