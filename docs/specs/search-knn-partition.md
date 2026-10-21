# Partition-constrained KNN for search and Ask

SPEC-ID: SPEC-ADDON-025
SPEC-ID: SPEC-ADDON-026

Approval:

## Summary

The intelligence addon's hybrid search (`search()` in `app/search.py`, behind
`GET /search` and Ask's retrieval) answers in about 0.5 s on production, and almost all
of it is one sqlite-vec `MATCH`: the CLIP channel, `_vector_search_clip`, scans every row
of `vec_clip`. The channels run in parallel, so the slowest one sets the time.

`vec_clip` holds 857,359 rows: 838,039 scene frames (`clip`) and 19,320 representative
frames (`clip_thumbnail`). With **Scene search** off, which is the default, the channel
keeps only `clip_thumbnail` rows. Today it applies that filter after the KNN. It takes
the nearest `rrf_candidates` (50) rows of any type, then drops the scene rows.

In practice the channel contributes almost nothing to default search on production. The
score gap check runs over those 50 mixed rows, and scene frames flatten the distribution.
For 20 everyday text queries embedded with the production CLIP model (2026-10-21), the
gap check discarded everything for 17 and the score floor for 2. Only one query passed,
with a single match. On the same queries, the `clip_thumbnail` partition alone passed
the gates for 15 queries and kept 10-50 thumbnails each. The user inspected the kept
thumbnails for 12 queries and judged them to show what the query names, down to the
lowest-ranked. Whether a viewer wants such a file (an anime scene for "住宅") is a
property of image matching itself, not of this change.

Since SPEC-ADDON-022, `vec_clip` and `vec_text` carry `embedding_type` as a sqlite-vec
partition key. A `MATCH` constrained to one type scans only that partition.

Measured on production, read-only, 2026-10-21 (hako `YUqEMWLQq2IgLMxWXQuE1`):

| Query | Today, warm | Today, cold page cache | Constrained, warm |
|---|---|---|---|
| `vec_clip`, k=50 | 0.48 s | 8.3 s | 0.013 s (`clip_thumbnail`) |
| `vec_text`, k=50 | 0.12 s | 4.8 s | 0.004 s (`metadata`) |
| FTS channels | ~0 s | | |
| `GET /search`, end to end | 0.50 s | | |

This change constrains two KNNs to the partition they actually use:

- **SPEC-ADDON-025**: the search CLIP channel with Scene search off is constrained to
  `clip_thumbnail`.
- **SPEC-ADDON-026**: Ask's Stage 1 coarse retrieval (`coarse_retrieve` in
  `app/rag/coarse_retriever.py`) is constrained to `metadata`. Today it takes the global
  top 1,000 of `vec_text` (632,274 rows, 91% `whisper`) and only then keeps `metadata`
  rows of the request drive. So a drive's best summaries can fall outside the 1,000 that
  transcript chunks fill.

There is no schema change and no migration: only the queries change. It is for the
viewer searching a drive and asking questions about it.

## Required items

### 1. Normal flow

SPEC-ADDON-025 (search CLIP channel):

1. A viewer searches, through `GET /search`, `GET /search/compare` or an Ask retrieval
   that calls `search()`. `search()` embeds the query with CLIP and calls
   `_vector_search_clip(clip_vector, rrf_candidates, mode=..., include_scene_clip=...)`.
2. With `include_scene_clip=False`, the KNN is constrained to the `clip_thumbnail`
   partition with `k = rrf_candidates`. It returns the nearest `clip_thumbnail` rows,
   at most `rrf_candidates` of them, ordered by distance. No scene row is fetched.
3. The returned rows go through the stages that exist today, unchanged: the score gap
   and coefficient-of-variation checks over all returned scores, the per-type
   `min_score_clip_thumbnail` floor, and the margin cutoff. The difference is the input:
   every row is now a `clip_thumbnail` row, so the gap and CV are computed over
   thumbnails only. The filter on `embeddings.embedding_type` against `allowed_types`
   stays after the KNN.
4. With `include_scene_clip=True`, the channel behaves exactly as today: an
   unconstrained KNN over `vec_clip`, then the filter to `clip_thumbnail` and `clip`.
   Constraining to both partitions costs a full scan as well (measured 0.48 s), so
   nothing is gained by changing it.

SPEC-ADDON-026 (Ask coarse retrieval):

1. Ask with hierarchical retrieval enabled (`rag.hierarchical.enabled`, default on) calls
   `coarse_retrieve(query, drive, top_k=coarse_top_k)`.
2. The KNN over `vec_text` is constrained to the `metadata` partition with
   `k = over_fetch`. `over_fetch` keeps today's value, `max(top_k * 50, 500)`.
3. The rows are joined to `embeddings` and `indexed_files` and filtered to the request
   drive and active files, as today. The `embedding_type = 'metadata'` filter becomes
   redundant and may stay.
4. Dedupe per file, sort by distance, trim to `top_k`, and convert distances to scores,
   all unchanged. `drive_file_count` is unchanged.

### 2. Failure cases

- **A vec table without the partition key.** It cannot exist while the addon serves.
  `init_search_db` runs `_migrate_vec_partition_if_needed` unconditionally before the
  lifespan finishes. That includes a DB named by `INTELLIGENCE_SEARCH_DB_PATH`. A failed
  migration stops the addon from starting, so no query runs against an unpartitioned
  table.
- **A vec row whose partition value is NULL.** Addon code older than SPEC-ADDON-022
  writes such rows. A constrained KNN never returns them, which is the same as
  SPEC-ADDON-023's similar-files KNN. `repair_unkeyed_vec_rows` re-keys them at the next
  start. If the repair raises, the lifespan logs an ERROR with the traceback and starts
  anyway. The unkeyed thumbnails and summaries then stay out of default search and
  coarse retrieval until a later start repairs them. Today's unconstrained KNN still
  finds such rows, so this change makes that gap visible in search results.
- **An empty partition** (a library with no thumbnails or no summaries). The KNN
  returns no rows. The CLIP channel returns `[]` as it does today for an empty table.
  `coarse_retrieve` returns an empty shortlist, which the caller already treats as the
  `empty_shortlist` bypass.
- **A sqlite error during the KNN.** Propagates as today: `search()` fails, and so do
  `GET /search` (500 "Search failed") and `coarse_retrieve`'s caller. No new handling.

### 3. States

None. These are read-only queries with no state of their own.

### 4. Data read and written

- Read: `vec_clip` (the `clip_thumbnail` partition, and all of it with Scene search on),
  `vec_text` (the `metadata` partition for coarse retrieval), `embeddings`, and
  `indexed_files`.
- Written: nothing. The in-process similar-files cache is unrelated and untouched.

### 5. External services

None. The query embedding models run in-process, as today.

### 6. Authorization

Unchanged. The drive comes from `X-Lit-Drive` (search) or the Ask request (coarse
retrieval). The drive filter after the KNN stays where it is: `_build_results` for
search, and the `i.drive = :drive` join for coarse retrieval. Neither query returns a row
of another drive that today's query would not have dropped.

### 7. Effect on existing features

- **Ordinary search (Scene search off)**: the CLIP channel starts contributing. Its
  matches enter the cosine and RRF combiners, so the result list gains image and video
  hits and reorders. This is intended. The gap and CV gates now judge a thumbnail-only
  score distribution. On production they pass most everyday queries (15 of 20 measured),
  where today they discard almost all of them (19 of 20). The thresholds stay as they
  are. How much of the final top 20 the new matches take is not measured before
  implementation. R-5 checks it on the running app.
- **`GET /search/compare`**: calls `_vector_search_clip(clip_vector, candidates)` with
  the default `include_scene_clip=False`, so it changes the same way.
- **Ask retrieval** (`app/rag/retriever.py`): calls `search()` with
  `include_scene_clip` from the Ask request. With it off, it changes the same way.
- **Ask coarse shortlist**: it can contain summaries that transcript chunks crowded out
  before. `top_score` can only rise or stay the same for a given query, so the
  low-confidence bypass fires the same or less often.
- **Ask with personal history** (`retrieve_hierarchical` with `pre_scope_file_ids`): the
  shortlist is intersected with the history scope. A fuller shortlist can make an
  intersection non-empty that was empty before. The `empty_intersection` bypass then
  fires less often, and retrieval is scoped to the intersection more often. The
  intersected `top_score` can only rise or stay the same. Both are intended: they are
  the history files whose summaries match, which the crowding hid.
- **Scene search on**: unchanged.
- **The text channel (`_vector_search_text`)**: unchanged.
- **Similar files and tag recommendation (`tag_knn`)**: unchanged.

### 8. Error behavior

Nothing new is shown or logged. The existing DEBUG logs for the gap and CV discards
still fire. They now describe thumbnail-only distributions.

### 9. User-visible behavior

- Search with Scene search off answers faster: about 0.5 s to about 0.15 s on production
  with a warm cache. After a restart or memory pressure, the first search reads about
  60 MB of thumbnail vectors instead of about 2.6 GB.
- Search with Scene search off lists image and video results that match the query
  visually, where today it almost never does. These can take places in the list from
  text-matched files and change the order. Text, labels and defaults do not change.
- Ask can cite files whose summaries were not reached before.
- Search with Scene search on: no change.

### 10. Non-functional

- The CLIP channel's time with Scene search off is bounded by the size of the
  `clip_thumbnail` partition, not by the whole of `vec_clip`.
- The coarse retrieval KNN is bounded by the size of the `metadata` partition.
- No new memory, concurrency or privacy effect: the same rows are read, fewer of them.

## Touch points

- `addons/intelligence/app/search.py`: `_vector_search_clip` (the KNN query and the
  branch on `include_scene_clip`).
- `addons/intelligence/app/rag/coarse_retriever.py`: `coarse_retrieve` (the KNN in the
  CTE).
- `addons/intelligence/tests/`: new tests citing SPEC-ADDON-025 and SPEC-ADDON-026. They
  run against real partitioned `vec_clip` / `vec_text` tables (sqlite-vec v0.1.6 is in
  `Dockerfile.test`), because the mocked connections in the existing tests cannot see the
  partition constraint.
- `addons/intelligence/tests/test_rag_coarse_retriever.py`: unchanged. The KNN keeps the
  bind name `over_fetch` and its value, so
  `test_passes_drive_and_overfetch_to_query` still holds as written.
- The submodule pointer `addons/intelligence` in core.
- `docs/specs/INDEX.md`.
- Rules passed through: `.claude/rules/design-decisions.md`, Drives (a drive is a
  security boundary); LLM features (Ask applies access control twice).
- No protected path is edited.

## Invariants

I1. With Scene search off, and with thresholds and margin that let every row through,
`_vector_search_clip` returns the `min(rrf_candidates, N)` nearest `clip_thumbnail`
matches and no `clip` match. N is the number of `vec_clip` rows keyed `clip_thumbnail`.
This holds however many `clip` rows are nearer to the query.
I2. With Scene search on, `_vector_search_clip` returns the same matches, scores and
order as before this change, for the same database and query vector.
I3. The CLIP channel's discard stages (score gap, coefficient of variation, per-type
minimum score, margin) apply the same thresholds as before to the rows the KNN returned.
I4. `coarse_retrieve` shortlists only active files of the request drive that have a
`metadata` embedding. Each file appears at most once, with the score of its nearest
`metadata` row. The files are ordered by ascending distance, at most `top_k` of them.
I5. `coarse_retrieve` shortlists the drive's nearest `metadata` files from the
`over_fetch` nearest `metadata` rows, however many rows of other embedding types are
nearer to the query.
I6. The text channel (`_vector_search_text`) returns the same matches as before this
change for the same database and query vector.
I7. Neither query writes to `search.db`.

## Checked, no action

- **Retuning the CLIP gates for the thumbnail-only distribution.** Seven of the
  12 inspected queries keep all 50 thumbnails, because their scores fit inside the 0.05
  margin. The user judged those matches relevant down to the last one, so a tighter gate
  would drop correct matches. The thresholds stay. If the final result list turns out
  crowded by image matches, that is a ranking question for the combiners, outside this
  change.
- **The text channel (`_vector_search_text`).** It keeps every type except
  `video_visual_scene`, and production has no rows of that type. Constraining it would
  scan the same rows. `whisper` alone is 576,143 of 632,274 rows and its KNN takes
  0.107 s. Speeding this up needs an approximate index, not a partition, and 0.12 s is
  not the bottleneck once the CLIP channel is fixed.
- **`tag_knn` (`app/workers/tag_knn.py`).** Its query vectors are the file's scene
  (`clip`) frames, and its neighbours may be any type. Constraining it to `clip` scans
  98% of the table and saves nothing. Constraining it to `clip_thumbnail` changes what
  "similar" means for tag suggestions. It runs in the background auto-tags job, so no
  viewer waits on it.
- **Scene search on: one KNN per partition, merged.** Two constrained KNNs (thumbnails
  plus scenes) would stop scene rows from crowding out thumbnails in scene mode too. But
  the cost stays at the full scan, and it changes scene-mode results with no request
  behind it. Left as is.
- **A drive partition key.** The drive filter still runs after the KNN, so another
  drive's rows can take candidate slots. The production samples showed 49-50 of 50 KNN
  rows in the query's own drive. Adding a second partition key means another
  table-rebuild migration of several minutes. Not worth it on that evidence.
- **Reducing `over_fetch` in `coarse_retrieve`.** With other types gone, it now absorbs
  only other drives' rows. A 1,000-row KNN over the 21,047-row `metadata` partition is
  cheap, so the value stays, to keep the change minimal.
- **Images get no `tag_knn` suggestions.** `load_file_clip_vectors` loads only `clip`
  rows, and images now store `clip_thumbnail` (`_migrate_image_clip_to_clip_thumbnail`).
  This is observed while reading the code and is outside this change.
- **Documentation.** `docs/addons/intelligence.md` and `docs/user-guide/search.md` do
  not describe search latency or how candidates are fetched, and Scene search behaves as
  documented. No page changes.
