"""Compare two versions of search.py over one index, read-only.

Run inside the intelligence container, from /app with PYTHONPATH=/app:

    python benchmark.py <drive> <baseline search.py> <candidate search.py>

Both versions read the same index with the same queries in one process. The
database is opened with SQLite's mode=ro. The videos drive prints no query text.
"""

import collections
import importlib.util
import json
import random
import re
import sqlite3
import statistics
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app import database as db
from app.config import settings

NAMED = {
    "photos": ["ペンギン", "penguin", "水族館", "動物園", "犬", "花", "猫", "海"],
    "main": ["カレー", "パスタ", "ケーキ", "味噌汁", "魚", "肉"],
    "videos": ["ピカチュウ", "ポケモン", "イラスト"],
}
UNRELATED = ["量子力学", "確定申告", "請求書", "恐竜の化石", "住民票", "quantum mechanics"]
GENERIC_TAGS = {"画像", "写真", "屋内", "屋外", "動画", "風景", "人物", "テキスト"}
CAPTION_STOPWORDS = set(
    "a an the of on in with and to is at by for from it its two three some that this are there "
    "his her man woman person people group white black red blue green yellow large small close "
    "up next front sitting standing holding wearing".split()
)
FILENAME_STOPWORDS = {"img", "jpg", "jpeg", "png", "heic", "mp4", "mov", "original", "pdf", "mkv", "webp"}
SEED = 20261101
MIN_TAGS_FOR_TAG_QUERIES = 200

drive, baseline_path, candidate_path = sys.argv[1:4]
anonymous = drive == "videos"
db_path = str(settings.search_db_path)


def connect():
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, check_same_thread=False)
    conn.enable_load_extension(True)
    conn.load_extension(db._SQLITE_VEC_PATH)
    conn.enable_load_extension(False)
    return conn


# A connection shared between search()'s parallel channels crashes the process,
# so every checkout gets its own.
db._search_engine = create_engine("sqlite://", creator=connect, poolclass=NullPool)
db._SearchSession = sessionmaker(bind=db._search_engine, expire_on_commit=False)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


versions = {"baseline": load("search_baseline", baseline_path), "candidate": load("search_candidate", candidate_path)}
conn = connect()

try:
    conn.execute("CREATE TABLE benchmark_write_probe (x)")
except sqlite3.OperationalError:
    print("read-only: ok")
else:
    raise SystemExit("read-only: FAILED, the database accepted a write")

files = {
    file_id: file_path
    for file_id, file_path in conn.execute(
        "SELECT file_id, file_path FROM indexed_files WHERE drive=? AND active=1", (drive,)
    )
}
tags = dict(conn.execute("SELECT file_id, tags FROM suggested_tags"))
captions = dict(conn.execute("SELECT file_id, content_preview FROM embeddings WHERE embedding_type='blip_caption'"))


def describes(file_id, query):
    return query.lower() in f"{tags.get(file_id) or ''} {captions.get(file_id) or ''}".lower()


def frequent_words():
    counts = collections.Counter()
    for file_id in files:
        try:
            counts.update(set(json.loads(tags.get(file_id) or "[]")))
        except ValueError:
            pass
    if sum(counts.values()) >= MIN_TAGS_FOR_TAG_QUERIES:
        return [word for word, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])) if word not in GENERIC_TAGS][:20]
    counts = collections.Counter()
    for file_id in files:
        words = re.findall(r"[a-z]{3,}", (captions.get(file_id) or "").lower())
        counts.update(set(words) - CAPTION_STOPWORDS)
    return [word for word, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))][:20]


rng = random.Random(SEED)
positive = frequent_words() + NAMED.get(drive, [])

filename_tokens = collections.Counter()
for file_path in files.values():
    name = file_path.rsplit("/", 1)[-1]
    filename_tokens.update({w.lower() for w in re.findall(r"[^\W\d_]{3,}", name)} - FILENAME_STOPWORDS)
top_tokens = [word for word, _ in sorted(filename_tokens.items(), key=lambda kv: (-kv[1], kv[0]))][:200]
keywords = rng.sample(top_tokens, min(10, len(top_tokens)))

stored_text = collections.defaultdict(list)
for row in conn.execute(
    "SELECT e.file_id, e.embedding_type, e.content_preview FROM embeddings e "
    "JOIN indexed_files f USING(file_id) "
    "WHERE f.drive=? AND f.active=1 AND e.vector_table='vec_text' "
    "AND length(e.content_preview)>=30 ORDER BY e.id",
    (drive,),
):
    stored_text[row[1]].append(row)
known_items = {
    kind: rng.sample(rows, min(15, len(rows))) for kind, rows in sorted(stored_text.items())
}


def ids(results, n=None):
    return [r.file_id for r in results[:n]]


def compare(queries, *, scene=False, describes_query=True):
    """Totals over the queries, for each version, with the kept top 20 counted against the baseline."""
    totals = {name: collections.Counter() for name in versions}
    for query in queries:
        results = {
            name: module.search(query, limit=100, drive=drive, include_scene_clip=scene).results
            for name, module in versions.items()
        }
        base_top = set(ids(results["baseline"], 20))
        for name, rows in results.items():
            total = totals[name]
            total["zero_result_queries"] += not rows
            total["results"] += len(rows)
            total["image_only_top20"] += sum(
                1 for r in rows[:20] if set(r.match_types) <= {"clip", "clip_thumbnail"}
            )
            total["baseline_top20_kept"] += len(base_top & set(ids(rows, 20)))
            total["baseline_top20"] += len(base_top)
            if describes_query:
                total["hits_top20"] += sum(describes(r.file_id, query) for r in rows[:20])
    return {name: dict(total) for name, total in totals.items()}


def known_item_ranks():
    report = {}
    for kind, rows in known_items.items():
        report[kind] = {}
        for name, module in versions.items():
            ranks = []
            counts = []
            for file_id, _, text in rows:
                results = module.search(text[:30], limit=100, drive=drive).results
                order = ids(results)
                counts.append(len(results))
                ranks.append(order.index(file_id) + 1 if file_id in order else None)
            report[kind][name] = {
                "sample": len(ranks),
                "found": sum(r is not None for r in ranks),
                "top5": sum(1 for r in ranks if r and r <= 5),
                "top20": sum(1 for r in ranks if r and r <= 20),
                "median_results": statistics.median(counts),
            }
    return report


report = {
    "drive": "(not shown)" if anonymous else drive,
    "indexed_files": len(files),
    "POS": compare(positive),
    "POS, Scene search on": compare(positive, scene=True),
    "NEG": compare(UNRELATED, describes_query=False),
    "KW": compare(keywords, describes_query=False),
    "known items": known_item_ranks(),
}
if not anonymous:
    report["queries"] = {"POS": positive, "NEG": UNRELATED, "KW": keywords}
print(json.dumps(report, ensure_ascii=False, indent=1))
