# Vector tables partitioned by embedding type

SPEC-ID: SPEC-ADDON-022
SPEC-ID: SPEC-ADDON-023

Approval:

## Summary

The intelligence addon's similar-files panel ("似たファイル", `GET /similar/{file_id}`,
`find_similar` in `app/search.py`) takes about 10 s the first time a file is opened on
production. Repeat opens are fast because the result is cached in memory. The cache is
cleared on every scan-complete webhook and on every restart.

The time goes into sqlite-vec `MATCH` calls. A `vec0` table has no ANN index, so each
`MATCH` is a brute-force scan of the whole table, and both tables mix every drive and
every embedding type:

- `vec_clip`: 854,882 rows, 768 dimensions.
- `vec_text`: 623,876 rows, 256 dimensions.

`_find_similar_by_embedding` filters by type and drive only after the KNN. It widens the
fetch over `_NEIGHBOUR_FETCH_FACTORS = (1, 4, 16)`, so a video can run up to 3 scans for
each of its 2 signals.

Measured on production, read-only:

- One `MATCH` costs 0.9-3.6 s on `vec_clip` and 0.4-2.5 s on `vec_text`.
- The rows of the type a video's similar-files query needs are 16,843 `clip_thumbnail`
  rows (2.0% of `vec_clip`) and 10,215 `tfidf_keywords` rows (1.6% of `vec_text`),
  counted over all drives.

After this change, both tables carry `embedding_type` as a sqlite-vec partition key
(supported by the v0.1.6 build in the addon's `Dockerfile`). The similar-files KNN then
scans only the partition of the type it asks for. In a 200,000-row stand-in, that query
dropped from 0.172 s to 0.004 s.

The change also fixes how the widening loop decides it has enough. Today it counts
candidates from other drives and inactive files, so it can stop early and return fewer
results than the drive holds.

It is for the viewer opening a file's detail page.

## Required items

### 1. Normal flow

SPEC-ADDON-022 (storage and migration):

1. `_create_vec_tables` creates
   `vec_text` / `vec_clip` as
   `vec0(embedding_id TEXT PRIMARY KEY, embedding_type TEXT PARTITION KEY, vector float[N])`.
   `N` comes from the same configuration as today. The DDL keeps `vector float[N]`, which
   `_migrate_vec_clip_if_needed` and `_probe_vec_text_dim` parse to detect a dimension
   change.
2. Every insert into either table writes the `embedding_type` column. Its value equals the
   `embedding_type` of the `embeddings` row with the same id. The insert sites are:
   - `metadata._store_embedding` (`metadata`, `text_content`);
   - `whisper._index_tfidf_keywords`;
   - `whisper._persist_transcript`;
   - `whisper._index_loft_vtt`;
   - `refine.recompute_chunk_embeddings` (`_store`);
   - `vision._embed_and_store`;
   - `video_visual._embed_scene`;
   - `clip._store_clip_embedding` (`clip`, `clip_thumbnail`).

   Each already knows the type it stores.
3. `init_search_db` runs a new migration, `_migrate_vec_partition_if_needed`, as its last
   vec step. It runs after `_migrate_image_clip_to_clip_thumbnail`, so the types it copies
   are the final ones. It acts only on a table whose `CREATE` SQL in `sqlite_master` has
   no `partition key` column. When one table is partitioned and the other is not (a
   model or dimension migration recreated one), only the unpartitioned one is touched.
   The work runs inside one explicit transaction (a SAVEPOINT through
   `conn.begin_nested()`, as `_migrate_vec_text_if_needed` does), because pysqlite
   otherwise autocommits each DDL statement. For each table to migrate:
   1. Copy `embedding_id`, the joined `embeddings.embedding_type` and `vector` into a
      plain table `<table>_migrate`. This is an inner join on
      `embeddings.id = embedding_id`.
   2. Drop the old table.
   3. Create the partitioned table at the same dimension.
   4. Insert every copied row.
   5. Drop the plain table.
   6. Commit.

   A table that is already partitioned is left alone, so the migration runs once. The
   schema is its own marker: nothing is recorded in `index_meta`.
4. A vec row with no `embeddings` row is an orphan, which `cleanup_orphaned_embeddings`
   deletes at startup today. The migration does not copy it.
5. The migration logs one INFO line when it starts and one when it ends. The end line
   carries each table's copied row count, the orphans dropped and the elapsed seconds.
   After the commit it runs `PRAGMA wal_checkpoint(TRUNCATE)`, which returns the WAL's
   several GB to the disk. The pages freed inside `search.db` are kept, and later
   inserts reuse them. There is no VACUUM (the user's decision).
5a. The `main.py` lifespan runs `init_search_db` through `await asyncio.to_thread(...)`.
   Today it runs on the event-loop thread, where a multi-minute migration trips the
   `LoopWatchdog` started just before it: an ERROR "Event loop has not run a
   callback" with a stack dump at 120 s. That is the symptom
   `docs/addons/intelligence.md` tells the operator to answer with a restart, and a
   restart would roll the migration back. HTTP is still not served until the lifespan
   finishes, as today.
5b. At every start, the startup cleanup that already runs off the loop
   (`asyncio.to_thread`, beside `cleanup_orphaned_embeddings`) repairs vec rows whose
   partition value is NULL. Addon code older than this change writes such rows when it
   runs on a partitioned table: sqlite-vec accepts the insert without the partition
   column and stores NULL (measured), and a type-constrained KNN never returns it.
   - Each such row that has an `embeddings` row is deleted and re-inserted with that
     row's type and the same vector bytes.
   - Each such row without an `embeddings` row is deleted.
   - The repair logs one INFO line with the counts, only when it changed something.

   The scan costs about 0.46 s per 200,000 rows (measured), so about 2-3 s on
   production. Decided by the user.
6. `_migrate_image_clip_to_clip_thumbnail` rewrites `embeddings.embedding_type` from
   `clip` to `clip_thumbnail`, one transaction per chunk of 500 files. It is the only
   code that changes an existing embedding's type.
   - **`vec_clip` unpartitioned** (the first start after the upgrade, since this runs
     before step 3): it leaves `vec_clip` alone. Step 3 then copies the rewritten type.
   - **`vec_clip` partitioned**: inside each chunk's transaction, it deletes each
     rewritten embedding's `vec_clip` row and re-inserts it with `clip_thumbnail` and
     the same vector bytes. sqlite-vec rejects an `UPDATE` of a partition key column,
     so the row cannot be changed in place.
   - A rewritten embedding with no `vec_clip` row gets none.
7. Every other read and write of the vec tables is unchanged:
   - DELETE by `embedding_id`;
   - point reads by `embedding_id`;
   - the orphan cleanup;
   - every KNN outside `find_similar`.

   A `MATCH` with no partition constraint scans every partition and returns the same
   neighbours as the unpartitioned table (measured).

SPEC-ADDON-023 (similar-files KNN):

8. `_find_similar_by_embedding(file_id, embedding_type, limit, drive)` reads and averages
   the source vectors as today. Its KNN is then
   `... WHERE vector MATCH :vec AND k = :k AND embedding_type = :type ORDER BY distance`,
   so the scan covers only that type's partition.
9. The widening loop keeps `_NEIGHBOUR_FETCH_FACTORS` and `_NEIGHBOUR_FETCH_MAX`. It
   stops when the fetched rows hold at least `limit` distinct files that are all of the
   following:
   - not the source;
   - active in `indexed_files`;
   - in `drive` (only when `drive` is given);
   - of the requested type in `embeddings`.

   It also stops at the cap, after the last factor, or when the table returned fewer rows
   than asked.
10. The neighbour lookup keeps its `Embedding.embedding_type == embedding_type` filter,
    and the widening check keeps the same filter. With correct partitions this is a
    no-op. It remains as the guard against a row stored in the wrong partition.
11. The neighbours are restricted to active files of `drive`, and to files other than
    the source, **before** the quality filters (0.999, 0.70, gap, margin, CV) run.
    Today the drive and active filter runs after them, so files of other drives take
    part in the gap, margin and CV decisions. After this change the filters judge only
    the candidates the viewer can be shown. Decided by the user.
12. The rest of `find_similar` is unchanged: the merge and its normalisation, the
    keyword bags, and the cache.

### 2. Failure cases

- The migration raises at any point, for example on a full disk: the transaction rolls
  back, both tables keep their old schema and rows, and `init_search_db` raises as the
  other startup migrations do. The container exits and the next start retries the
  migration from the beginning.
- The process is killed mid-migration: SQLite rolls the transaction back on the next
  open. Same outcome as above.
- A vec row is left in the wrong partition, which could only come from a type rewrite
  outside step 6. Its row is not seen by a type-constrained KNN of its real type. Step 6
  makes the only rewriter re-key, and invariant I3 pins it.
- The widening loop reaches `_NEIGHBOUR_FETCH_MAX` in a type partition larger than 4096
  rows without `limit` usable files: it uses what it has, as today.

### 3. States

- A vec table is either unpartitioned (before the migration) or partitioned (after).
  The only transition is unpartitioned → partitioned, done atomically by the migration.
  Nothing moves a table back.
- A partitioned table can hold rows with a NULL partition value, if older addon code
  ran on it (a rollback). The next start of this code repairs them (step 5b).
- A dimension or model migration (`_migrate_vec_clip_if_needed`,
  `_migrate_vec_text_if_needed`) drops the table. `_create_vec_tables` then recreates it
  partitioned and empty, and the partition migration finds nothing to do.

### 4. Data read and written

- `vec_text`, `vec_clip`: schema replaced, rows copied (written once by the migration).
  After that, inserts write the new column.
- `embeddings`: read by the migration (join), unchanged.
- `indexed_files`: read by the widening check (`active`, `drive`).
- Plain tables `vec_text_migrate` and `vec_clip_migrate`: exist only inside the migration
  transaction.
- The in-memory similar-files cache: unchanged.

### 5. External services

None. Everything is local SQLite.

### 6. Authorization

Unchanged. `GET /similar/{file_id}` keeps `require_drive` and the source-drive check in
`routers/similar.py`. Results are still filtered to the requested drive after the KNN,
because the partition is by type, not by drive.

### 7. Effect on existing features

- Every writer of the vec tables (the eight insert sites in step 2) must supply the type.
- Unchanged readers, which keep scanning every partition: `_vector_search_text` and
  `_vector_search_clip` (search and Ask), `coarse_retriever`, the `rag/context.py`
  per-file KNNs, `tag_knn`, `citations`, `pickup`, `clip_concepts` and `video_visual`
  point reads.
- `GET /debug/similar/{file_id}` (`routers/similar.py`) calls
  `_find_similar_by_embedding` for four types, so it follows the new KNN, widening and
  filter order. Its code does not change.
- The readers that join a vec table with `embeddings` (`rag/context.py`, `citations.py`,
  `coarse_retriever.py`) qualify every `embedding_type` as `e.embedding_type` today. The
  new column on the vec tables would make an unqualified reference ambiguous, so they
  stay qualified.
- Tests that create plain stand-ins of the vec tables, or that rewrite the `MATCH` SQL
  text, follow the new schema and SQL. The properties they pin are kept.
- The eval snapshot (`evals/test-drive/snapshot/search.db`) is migrated in place the
  first time an eval runs, as the existing migrations already do.

### 8. Error behavior

- Migration start and end: INFO lines (step 5).
- A failed migration: the exception propagates out of `init_search_db` with its
  traceback, and the addon does not start.
- While the migration runs, the addon serves nothing. This is the existing behaviour of
  an addon that is down, unchanged here:
  - Core keeps rendering the addon's slots, because they come from manifest files.
  - The proxy answers 502 "Addon service unavailable".
  - The similar-files panel retries and then shows "似たファイル検出は利用できません".
  - Search and Ask show their own existing error states.
  - The healthcheck may report unhealthy.

  All of this ends when the migration finishes.
- `find_similar` errors are unchanged (500 "Similar search failed").

### 9. User-visible behavior

- The first open of a file's similar files on production is expected to take well under
  1 s instead of about 10 s. This is measured on production after deploy, not asserted
  in tests.
- The list of similar files can change for the same index contents. It is not pinned
  to today's output, for three reasons:
  - the candidates are now all of the requested type;
  - the quality filters now judge only the drive's active files (step 11);
  - the widening fetches more of them.

  The merge normalises each leg by its own minimum and maximum, so the scores move with
  the candidates.

  In particular, in a drive whose nearest neighbours are dominated by other drives'
  rows, a file may now show up to `limit` similar files where it showed fewer or none.
  The tests pin I4-I6, not equality with today's results.
- Operator: the first start after the upgrade rebuilds both vector tables before the
  addon answers. Estimated at about 5 minutes on production (48 s per 200,000 768-dim
  rows measured locally). `docs/addons/intelligence.md` gets one sentence beside the
  existing first-start notes. It says:
  - that the start takes minutes;
  - which INFO line marks the start and which marks the end;
  - that `unhealthy` during it is expected;
  - that a restart starts the copy over;
  - the free disk needed.

### 10. Non-functional

- Disk, measured on 200,000 768-dim rows (600 MB of vectors):
  - Before commit, the WAL reached 1,392 MB.
  - After the commit and checkpoint, `search.db` grew from 604 to 1,390 MB, of which
    786 MB are free pages, and the WAL was truncated to 0.

  Scaled to production's 3.3 GB of vectors, that is about 8 GB of WAL at the peak and
  about +4.3 GB of `search.db` afterwards, mostly free pages. Production has 75 GB
  free. The docs sentence asks for 4x the vector data free.
- Time: the migration blocks addon startup once, about 5 minutes on production.
- Memory: `INSERT ... SELECT` streams rows, so the migration does not load the tables
  into Python.
- Partition count: one per embedding type, eight types at most.

## Touch points

- `addons/intelligence/app/database.py`:
  - `_create_vec_tables`: the new DDL.
  - New: `_migrate_vec_partition_if_needed`, called from `init_search_db` after
    `_migrate_image_clip_to_clip_thumbnail`.
  - `_migrate_image_clip_to_clip_thumbnail` re-keys the `vec_clip` rows it rewrites.
- Insert sites:
  - `addons/intelligence/app/workers/metadata.py` (`_store_embedding`);
  - `addons/intelligence/app/workers/whisper.py` (`_index_tfidf_keywords`,
    `_persist_transcript`, `_index_loft_vtt`);
  - `addons/intelligence/app/workers/refine.py` (`recompute_chunk_embeddings`);
  - `addons/intelligence/app/workers/vision.py` (`_embed_and_store`);
  - `addons/intelligence/app/workers/video_visual.py` (`_embed_scene`);
  - `addons/intelligence/app/workers/clip.py` (`_store_clip_embedding`).
- `addons/intelligence/app/main.py`: the lifespan awaits `init_search_db` in a thread,
  and runs the NULL-partition repair in the existing off-loop startup cleanup.
- `addons/intelligence/app/indexer.py` or `database.py`: the NULL-partition repair
  function, beside `cleanup_orphaned_embeddings`.
- `addons/intelligence/app/search.py`: `_find_similar_by_embedding` (the KNN constraint,
  the widening check, and the drive and active filter moved before the quality
  filters).
- `addons/intelligence/app/routers/similar.py`: `GET /debug/similar/{file_id}` follows
  the change, with no code change.
- Tables: `vec_text`, `vec_clip` (schema), with `embeddings` and `indexed_files` read.
- Tests in `addons/intelligence/tests/` with vec stand-ins or `MATCH` rewrites, updated
  to the new schema and SQL without weakening:
  - `test_z_clip_thumbnail_dispatch.py`
  - `test_z_pickup_profile.py`
  - `test_startup_running_jobs.py`
  - `test_z_tfidf_keyword_indexing_drive.py`
  - `test_provider_failure_handling.py`
  - `test_z_auto_tag_drive_scope.py`
  - `test_z_neighbour_type_isolation.py`
  - `test_loft_vtt_sidecar.py`
  - `idf_term_db.py`
  - `test_embeddings_chunk_index_migration.py`
  - `test_vec_text_migration.py`
  - `test_epub_indexing_e2e.py`
  - `test_pdf_indexing_e2e.py`
  - `test_whisper_skip_jobrecord.py`
  - `test_z_clip_thumbnail_leg_recovery.py`
  - `test_vision_purge.py`
  - `test_z_pickup_retrieval.py`
  - `test_idf_term_backfill.py`
  - `test_z_image_clip_migration.py`
- New tests citing SPEC-ADDON-022 / SPEC-ADDON-023 in `addons/intelligence/tests/`.
- Docs: `docs/addons/intelligence.md`, one sentence on the first start after the upgrade.
- The addon change is committed in the addon repository. The core bumps the
  `addons/intelligence` pointer.
- Rules passed through:
  - `.claude/rules/design-decisions.md`: the drive boundary (results stay
    drive-filtered) and data that cannot be regenerated (every vector is copied, none
    recomputed).
  - The hako invariant that KNN on the shared vec tables is filtered by
    `embedding_type`, now done before the scan instead of after.
- Risk: schema change plus `DROP TABLE` / `DELETE` (schema and persistence modifiers).
  No protected path is edited.
- Review topic: `docs/process/reviews/feature-vec-partition-keys/`.

## Invariants

I1. After the migration, every `embeddings` row that had a vec row before it has exactly
one vec row in the same table. That row has the same `embedding_id`, byte-identical
`vector` bytes, and an `embedding_type` partition value equal to the `embeddings` row's
type. No vec row without an `embeddings` row remains.

I2. If the migration raises or the process dies at any point before it commits, both
tables keep their pre-migration schema and every row, and no `*_migrate` table remains.
This includes a failure after the old table was dropped. A later start migrates from
that state. A start whose tables are already partitioned copies nothing and changes no
row. When only one table is unpartitioned, the other table's rows are unchanged.

I3. After any insert path in the touch points writes an embedding, or
`_migrate_image_clip_to_clip_thumbnail` rewrites one, its vec row's partition value
equals its `embeddings` row's `embedding_type`. This holds for a DB that needs both
migrations in one start, and for a rewrite on an already-partitioned table. A rewritten
embedding without a vec row still has none.

I4. The KNN in `_find_similar_by_embedding` returns only rows of the requested
`embedding_type`. A `clip_thumbnail` query never scores a scene `clip` row, and a
`tfidf_keywords` query never scores a `whisper` row.

I5. `find_similar` never returns the source file, a file of another drive than the
requested one, or an inactive file.

I6. Let `limit` be the `limit` argument of `_find_similar_by_embedding` (which
`find_similar` calls with twice its own), and let "source rows" be the number of the
source's `embeddings` rows of the requested type. Suppose the requested drive holds at
least `limit` active files other than the source with an embedding of that type, and
they lie within the nearest
`min((source rows + limit + 20) × 16, _NEIGHBOUR_FETCH_MAX)` rows of that type's
partition. Then the rows the loop finally fetches contain `limit` such files. Rows of
other drives, of inactive files and of the source do not count toward it, and do not
take part in the quality filters' decisions.

I7. For the same index contents, every KNN outside `_find_similar_by_embedding` returns
the same rows and distances as on the unpartitioned table. Every DELETE by
`embedding_id` removes the vec row.

I8. The migration ends with one INFO line carrying, for each table, the copied row count,
the dropped orphan count and the elapsed time.

I9. After a start of this code, no vec row has a NULL partition value. A NULL row with
an `embeddings` row is re-inserted with that row's type and byte-identical vector bytes,
and a type-constrained KNN of that type can return it.

I10. While the migration runs, the event loop keeps running callbacks: the
`LoopWatchdog` logs no stall ERROR during a migration that outlasts its threshold.

## Checked, no action

- **Partitioning by drive as well.** It would make the scan 2-3x smaller again, but six
  of the eight insert sites do not have the drive in scope. A cross-drive move
  (`handle_files_moved`) would also have to delete and re-insert every vector of the
  file, since a partition key cannot be updated. The type partition alone cuts the scan to
  about 1/50 of today's rows, and adding the drive to about 1/140. Both answer in
  milliseconds, so the difference is not perceptible.
  Decided by the user.
- **Moving search, Ask (`coarse_retriever`, `rag/context.py`) and `tag_knn` to
  type-constrained KNN.** They would gain the same speed-up, but each is its own change
  with its own tests. They keep working unchanged on the partitioned tables (I7). Left
  for later specs. Decided by the user.
- **`tag_knn` mixes `clip` and `clip_thumbnail` rows** (its post-filter has no type
  filter). This is pre-existing, not touched here, and a candidate for that later spec.
- **Migrating in the background while serving from the old table.** It would avoid the
  startup pause, but every write during the migration would have to go to both tables.
  The one-time pause is accepted. Decided by the user.
- **SQLite's vec1 extension.** It is pre-release (0.7, "testing is insufficient"),
  approximate (IVFADC + OPQ, needs training), a separate loadable extension, and has no
  partition keys yet. The partition-by-type layout carries over if it is adopted later.
- **Renaming the vec0 table instead of copying through a plain table.** `ALTER TABLE
  RENAME` on a vec0 table leaves its shadow tables under the old name, and creating the
  new table then fails (`v_info already exists`, measured). Hence the plain-table copy.
- **Recording the migration in `index_meta`.** The partition column in `sqlite_master`
  is the marker. A dimension or model migration that drops the table recreates it
  partitioned.
- **The eval snapshot is not regenerated.** It is migrated in place by the first eval
  run, as the dimension migration already does to it.
- **Scripts and evals that call `init_search_db()` while the server migrates.** They wait
  on the 120 s busy timeout and fail visibly. Run against an unmigrated DB, they perform
  the migration themselves, which is correct. Operators run them after the addon is up.
- **A migration that keeps failing under `restart: unless-stopped`** (for example a full
  disk) repeats the copy on every restart. Each attempt rolls back fully (I2), and the
  traceback is in the log. No retry limit is added.
- **Insert sites that only log a failed vec insert** (`vision`, `video_visual`,
  `refine`). A wrong or missing partition value there would be quiet. I3 is tested per
  insert site for that reason.
- **Lowering `_NEIGHBOUR_FETCH_FACTORS` now that scans are cheap.** It is not needed:
  inside one type's partition the retries cost milliseconds.
