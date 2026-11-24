# Review r1: perf-vec-point-reads

Commit reviewed: `4f001d6` against `11be452` in the intelligence addon worktree (`/Users/libre/Sources/intelligence-vec-reads`).
Threat model: personal home-LAN tool, the owner is the only user, no attacker.

## Verdict

The eight sites keep their behavior. No category A defect was found. The three findings below are gaps in the source detector and one possible slowdown on a very large drive. All three score below the fix threshold (F×I < 15, and impact < 8).

## Findings

### 1. tests/test_vec_point_reads.py:162-173 (`_is_vec_read`): the detector misses the join written the other way round, and `{vec_table}`

- Defect: the join rule needs the literal text `JOIN EMBEDDINGS` with exactly one space between the words. These forms of the same whole-table read pass:
  - `FROM embeddings e JOIN vec_text v ON v.embedding_id = e.id`, which is the most natural way to write "this file's embeddings and their vectors"
  - `JOIN` and `embeddings` on separate lines inside a triple-quoted string
  - a comma join (`FROM vec_text v, embeddings e WHERE e.id = v.embedding_id`)
  The placeholder list `{table}|{SCENE_TABLE}|{CHANGE_TABLE}` also leaves out `{vec_table}`, the name `app/search.py:3177` already uses for this table variable. So `f"SELECT vector FROM {vec_table} WHERE embedding_id IN (...)"` passes too.
  I confirmed each case by running `_is_vec_read` on sample strings. A `+`-concatenated statement also passes, but the module docstring already accepts that limit.
- How it happens: someone later writes a per-file vector read starting `FROM embeddings`. The read is 1-2.5 s per statement, and the test stays green.
- Frequency 1, impact 3 (latency you can see, results unchanged), category A (test gap).
- Suggested direction: collapse whitespace before matching. Flag any statement that names a vec table together with `embeddings` and `embedding_id`, does not use `MATCH`, and is not a `DELETE` or `INSERT`. Widen the placeholder to any `{...}`.

### 2. tests/test_vec_point_reads.py:178-179: `indexer.py` is excluded as a whole file, but no exclusion is needed

- Defect: `vec_read_sites` skips every string in `app/indexer.py`. Its orphan scans use `NOT IN`, and `\bembedding_id\s+IN\b` does not match `embedding_id NOT IN`. With the skip removed, the detector reports nothing at `4f001d6` (checked by running it). Meanwhile the largest file in `app/` gets no coverage at all.
- How it happens: an `embedding_id IN` vector read added to `indexer.py` passes.
- Frequency 1, impact 3, category A (test gap).

### 3. app/exact_search.py:295 (`rank_scenes`): one point read per scene embedding on the drive

- Defect: `wanted` holds every active `video_visual_scene` embedding on the drive, not one file's. Production measured 87 `=` statements at 0.007 s, about 0.08 ms each. At that rate the new code is slower than the single old `IN` scan (1-2.5 s) once a drive holds more than roughly 12k-30k scene embeddings. Above 32,766 ids the old expanding `IN` would have failed outright with SQLite's variable limit, so the old path did not handle that size either.
- How it happens: a drive with a large Visual Index runs a scene search. I could not count production's `video_visual_scene` rows, so I cannot show the condition is reached.
- Frequency 1 (unknown, probably 0), impact 3 (a slower scene search), category A.
- No other site has this cost. `_scoped_vector_rows` (≤20k ids) and `search_images` (all clip_thumbnail rows, batches of 500) used to pay one whole-table scan per batch of 500. They are now strictly faster: 20k ids ≈ 1.6 s, against 40 scans × 1-2.5 s before.

## Checked, no defect

- **citations._fetch_file_vectors**: `embeddings.id` is `String(32)`, so `stored.get(embedding_id)` keys match and dropping `CAST(e.id AS TEXT)` loses nothing. Embedding rows with no vector go to `vec_bytes is None → continue` and are not added to `seen`, the same as the old inner join leaving them out. Row order changed from join order to the `embeddings` index order. Both are effectively insertion order, and order only matters for a duplicate chunk_id (first wins), which `_make_chunk_id` does not produce. The read still goes through the same `get_search_db()` session and inside the same try/except, so a failure still returns `[]`.
- **exact_search.rank_scenes**: same ids, `if row.vector` and `if blob` drop the same rows, and the result is consumed as a dict.
- **file_question._vectors / video_visual_selection._load_vectors**: callers use `.get` or membership and then sort by (timestamp, id), so dict order does not matter. One connection now covers all ids, where before there was one per 400.
- **search._scoped_vector_rows**: distances are sorted. The tie order now follows input order, which only matters for bit-identical vectors. Duplicate ids that crossed a 500-id batch boundary were scored twice before and are now deduplicated, which is harmless or better. Old code would have crashed in `np.stack` on an empty blob; new code drops it. vec0 cannot store one anyway.
- **search.search_images**: `stored.get(row.id)` plus `if not blob` behaves the same as before.
- **change_frames._vector_rows**: an empty blob used to be kept and is now dropped. vec0 rejects a zero-length vector on insert, so such a row cannot exist. Before, it would have made the INSERT into `vec_clip` fail and the file be retried on every start; now it would be deleted. Same session as before.
- **clip_concepts.load_file_clip_vectors**: consumers are order-insensitive (frequency × max per concept; `np.mean` in tag_knn, where order differs only in the last bits).
- **read_vectors**: accepts both a Session and a Connection (`execute(text)`). `VEC_TABLES` guards the f-string table name. `dict.fromkeys` deduplicates in input order.
- **Detector against the originals**: run on `11be452`, it flags all eight original sites. Run on `4f001d6`, it reports nothing.
- **Tests vs regressions**: if `read_vectors` went back to `IN`, `test_the_helper_never_issues_an_in_against_a_vec_table` fails on both the statement count and the no-`IN` check. A dropped id fails the equality test. Removing the `dict.fromkeys` deduplication would not fail any test, but it costs only extra statements, not wrong results.
- **Other vec reads in `app/`**: `pickup/profile.py:739`, `pickup/retrieval.py:174`, `search.py:3177` and `vec_partition.rekey_vector` already use `=`. The joins in `rag/context.py:263,394` and `rag/coarse_retriever.py:97` are `MATCH` KNN queries. `indexer.py` orphan cleanup and the `vec_partition` migration are whole-table work by design.

## Coverage

- Full diff `11be452..4f001d6`.
- Changed functions and their callers: `citations._fetch_file_vectors`; `exact_search.rank_scenes` and its router caller; `file_question._vectors` and its caller at line 1405; `search._scoped_vector_rows`, `search.search_images` and `search.py:3160-3225`; `change_frames` (whole module); `clip_concepts.load_file_clip_vectors`, `score_vectors_against_concepts` and `tag_knn`'s vector average; `video_visual_selection._load_vectors`, `_frames` and `load_selection_inputs`; `vec_partition.py:1-110`; `models.Embedding`.
- Grep of every vec-table string in `app/`; `indexer.py:2750-2795,3080-3100`; `rag/context.py`; `rag/coarse_retriever.py`.
- New test file, read in full. The detector was run outside Docker (ast/re only) on both SHAs, with the `indexer.py` skip, without it, and on probe strings.
- Conventions: design-decisions.md and backend-conventions.md (from the session context). `git log` of the changed files.
- Not run: the pytest suite in Docker, and production row counts.

TOTAL: 3 findings
