# Corpus IDF from stored per-file term sets

SPEC-ID: SPEC-ADDON-021

Approval:

## Summary

The intelligence addon weights TF-IDF keywords with a per-drive corpus IDF
(`app/tfidf.py`, `_get_corpus_idf`). Today every rebuild tokenizes every active file of the
drive with Janome (`_build_corpus_idf`), and the cache expires after
`_IDF_CACHE_TTL_SECONDS` (600 s). Since `76c672a` (#109) the rebuild runs in a child
process with one build per drive, so it no longer slows other threads, but its cost still
grows with the corpus: 47.7 s for 2.65 M characters on this machine's data, about 9.5 min
at production scale, repeated whenever the cache expires and a whisper job asks for it.
A file's term set changes only when its transcript or filename changes, so after this
change each file's distinct term set is stored once, in a new table, and recomputed only
when that file changes. The IDF is then a SQL aggregate over the stored sets of the
drive's active files: measured 0.44 s at production scale and 1.95 s at 50x, and equal
to the full rebuild's IDF. For the operator, whose server stops spending minutes of CPU
every ten minutes on recomputing the same numbers.

## Required items

### 1. Normal flow

SPEC-ADDON-021:

**The term set of a file** is `set(_document_tokens(filename, transcript, tokenizer))`,
the same tokens the full rebuild counts today: the transcript is the file's
`transcript_chunks` text joined in `chunk_index` order (`_get_transcript_text`), and the
filename comes from `indexed_files.filename`. A file whose set is empty (no transcript of
20+ characters and no filename tokens) has no rows, as today it does not count toward the
document count.

**Storage.**

1. `indexed_files` gains two columns: `idf_terms_indexed` (boolean, default false, with
   an index) and `idf_terms_gen` (integer, default 0). A new table
   `idf_doc_terms(file_id, term)` holds one row per distinct term of a file, keyed by
   `(file_id, term)`, with `file_id` referencing `indexed_files` `ON DELETE CASCADE`.

**Marking a file changed.**

2. Every write that changes the inputs of a file's term set sets `idf_terms_indexed` to
   false and increments `idf_terms_gen` for that file, in the same transaction as the
   change. The writers are:
   - `_remove_whisper_data` (`workers/whisper.py`), which every transcript replacement
     goes through: `_persist_transcript` (whisper transcription), `_index_loft_vtt` (the
     `.loft` VTT path) and `fail_orphaned_running_jobs` (startup cleanup of
     interrupted jobs). The mark goes inside that function as its first statement,
     before any delete that can raise, so all three callers are covered, including
     `fail_orphaned_running_jobs`, which commits even when the function raises partway.
   - The refine per-window write and the re-chunk (`workers/refine.py`).
   - `handle_files_moved` (`indexer.py`), for both the `files.moved` webhook and
     reconcile's drift repair, only when the new filename differs from the stored one.
     A move that keeps the name changes no input, whether or not the drive changes.
3. The mark also arranges a backfill request that is sent **after the writer's
   transaction commits** (an after-commit hook on the session), never at the mark point
   and never for a rolled-back transaction. A request sets a thread-safe flag that the
   backfill loop reads. When no loop is running (in tests, in scripts, or before the
   lifespan starts the workers), the request only sets the flag. The startup pass covers
   it.

**Backfill loop.**

4. One backfill loop runs per addon process, started in the `main.py` lifespan after the
   rule-version check (step 11). It runs a pass at startup. After that, it waits for a
   request, then waits a further 5 s so that a burst of requests (refine windows, a
   whisper backlog) becomes one pass. A request that arrives during a pass causes
   exactly one more pass after it.
   While the index queue is paused (`IndexManager.pause()`, `POST /queue/pause`), no
   batch starts. A pass checks the pause before each batch, and before each single-file
   retry, and waits there until the queue resumes. The human chose this so that pausing
   frees the CPU.
5. `reconcile()` sends a request in a `finally` at its end, so the files it added,
   reactivated or moved are covered even when one of its steps raised. It does not wait
   for the pass.
6. A pass collects the active files with `idf_terms_indexed` false, of every file type
   (filename-only files count toward today's IDF), ordered by `file_id`. It leaves out
   the files held after failing on their own (step 7). When none are collected, it
   spawns no child and logs at DEBUG only.
   For each batch of `_CORPUS_BATCH_FILES` files, it reads each file's `idf_terms_gen`
   first, then its `filename` and transcript. It tokenizes the batch in a spawned child
   process that the pass can terminate. This replaces the `ProcessPoolExecutor` of
   `_tokenizer_process` from #109, whose worker cannot be terminated. One child is kept
   for the pass and replaced after a failure.
   Then, in one short write transaction per file, it replaces that file's
   `idf_doc_terms` rows and sets `idf_terms_indexed` true. It does so only if the file
   is still present and still active, and its `idf_terms_gen` still equals the value
   read. Otherwise the file is skipped and stays false.
7. When a batch fails (the child dies, raises, or takes longer than 300 s), the pass
   terminates that child and retries the batch's files one at a time, each in a fresh
   child with the same 300 s limit. A file that fails on its own:
   - stays false;
   - is logged at WARNING with its `file_id`;
   - is held: left out of collection by later passes in this process while its
     `idf_terms_gen` is unchanged. A change to the file, or a restart, releases it.
8. The pass runs off the event loop (`asyncio.to_thread`). Janome never runs in the
   addon's own process for this purpose.
9. After each batch's writes commit, the cached IDF of each drive written in that batch
   is dropped, and any build of those drives already in flight does not store its
   result in the cache (it is returned to its own caller only). So the next
   `_get_corpus_idf` call builds from the new rows. This holds for a pass that later
   raises too, since the drop is per batch.
   A pass that collected at least one file logs one INFO line when it ends, whether it
   finished or raised:
   `IDF term backfill: written=<n> skipped=<n> failed=<n> held=<n> remaining=<n>`.
   - `skipped` counts files that changed, were purged, or became inactive between read
     and write.
   - `failed` counts files whose write raised or that failed on their own in this pass.
   - `held` counts files left out because they failed on their own earlier.
   - `remaining` counts active files still flagged false, held ones excluded.

   If any file was skipped because it changed, the loop runs another pass after the 5 s
   wait. If any write raised, it runs another pass after 60 s.
10. Loop resilience and shutdown:
    - An exception from a pass outside the cases above (a collection query that raises,
      a spawn that fails) is logged at ERROR. The loop waits 60 s and continues, so the
      task never ends because of a failed pass.
    - At shutdown the lifespan cancels the loop. The running child, if any, is terminated
      at once. The lifespan then waits at most 5 s for the pass thread to return. Work of
      a file whose write had not committed is discarded; its flag stays false.

**Computing the IDF.**

11. `_get_corpus_idf(drive)` keeps its cache, its TTL and its one-build-per-drive
    behavior. A build is one read transaction (one snapshot) that computes:
    - per term, the number of active files of the drive that have the term;
    - the document count, the number of active files of the drive that have any row.

    The IDF formula (`log(n_docs / df) + 1`) is unchanged. A build does no tokenization
    and uses no child process.
12. `extract_top_keywords` and `get_tfidf_keywords_for_file` use the returned IDF and
    document count as today.

**Tokenizer rules.**

13. `app/tfidf.py` carries a term-rule version string. The `main.py` lifespan, and no
    other entry point (`init_search_db`, the eval harnesses and `scripts/` do not run
    it), compares the version with `index_meta['idf_term_rules']` before starting the
    backfill loop. When they differ (including the first start after this change, where
    the key is absent), one transaction sets `idf_terms_indexed` false on every file and
    records the new version. Existing rows stay and are replaced file by file. Changing
    the stopwords, the filename boost or anything else that changes `_document_tokens`
    output requires bumping the version.

### 2. Failure cases

- A batch fails: the pass falls back to retrying its files one at a time (step 7).
- A per-file write transaction raises (for example a write-lock timeout): it rolls back,
  so that file's old rows and false flag remain. It is counted in `failed`, and the loop
  runs another pass after 60 s (step 9).
- A file's inputs change between the read of its `idf_terms_gen` and its write: the
  generation no longer matches, so the write is skipped. Because the generation is read
  before the inputs, a change committed between the two reads is also caught.
- A file is purged or deactivated between read and write: the write is skipped. A purge
  has already removed its rows through the cascade. A deactivated file stays false, and
  when it is reactivated by `reconcile()` the request at the end of that run picks it
  up.
- Any other exception from a pass: logged at ERROR, retried after 60 s (step 10).
- The startup rule-version check raises: the transaction rolls back, so neither the
  flags nor the recorded version change. An error is logged and startup continues. The
  check runs again at the next start.
- The aggregate query raises: the build raises as `_build_corpus_idf` raises today, and
  a caller waiting on that build retries it itself (the existing `_get_corpus_idf`
  behavior).
- The addon stops during a pass: files still flagged false are collected by the startup
  pass.

### 3. States

Per file, `idf_terms_indexed`:

- **false**: the stored rows (possibly none) may not match the current inputs. This is
  the default for a new file. It is set by step 2 and by the rule-version reset.
- **true**: the stored rows are the term set of the transcript and filename as of
  `idf_terms_gen`.

Allowed transitions:

- false → true only by a backfill write that replaced the rows in the same transaction
  while the file was active and its `idf_terms_gen` unchanged.
- true → false only by a step-2 writer or the rule-version reset.

Not allowed:

- Nothing else sets true.
- The backfill writes no rows for an inactive file.
- Deactivation, reactivation, and a move that keeps the filename (across drives or not)
  change neither the flag, nor `idf_terms_gen`, nor the rows.
- A move that changes the filename is a step-2 change, whether or not the drive also
  changes.

Rows of a file flagged false still count toward the IDF until they are replaced. A new
file has no rows until its first write. The active/missing/trash state and the drive are
not mirrored: the aggregate reads them from `indexed_files` at build time.

### 4. Data read and written

- Written: `idf_doc_terms` (new); `indexed_files.idf_terms_indexed` and
  `indexed_files.idf_terms_gen` (new columns); `index_meta['idf_term_rules']`.
- Read: `transcript_chunks.text`; `indexed_files` (`filename`, `active`, `drive`,
  `idf_terms_gen`).
- In-memory: the per-drive IDF cache in `app/tfidf.py`, unchanged in shape, now also
  dropped per drive after a pass that wrote it; the request flag; the set of
  `(file_id, idf_terms_gen)` that failed on their own in this process.
- Not written: `embeddings`, `vec_text`, any FTS table, `tfidf_keywords_indexed`.

### 5. External services

None. Janome runs locally. No LLM or embedding call is added.

### 6. Authorization

None. No endpoint is added or changed. The drive boundary is kept: each drive's IDF counts
only that drive's files (the aggregate filters by `indexed_files.drive`).

### 7. Effect on existing features

- Whisper's TF-IDF keyword embedding (`_index_tfidf_keywords` → `extract_top_keywords`)
  and auto-tag candidates (`get_tfidf_keywords_for_file`) read the IDF built from the
  table. Once every active file of the drive is flagged true, it is the IDF the full
  rebuild computes (I1).
- Steady-state freshness is at least as good as today. A pass starts about 5 s after a
  committed change, and the drives it wrote rebuild their IDF on the next call. Whisper
  extracts a file's keywords right after `_persist_transcript`, before that file's rows
  exist, so the file's own new terms are not in the IDF at that moment. Today's cached
  IDF is equally unlikely to contain them.
- **First backfill after deploy (the human chose a partial IDF over keeping the full
  rebuild).** For about 10 minutes at production scale, a drive's IDF covers only the
  files written so far. Each batch drops the cached IDF of the drives it wrote, so the
  cache does not extend this window. Files not yet written count toward neither document
  frequencies nor the document count (I4). This has three effects:
  - Keyword vectors that whisper stores in this window are weighted by the partial IDF
    and are kept as stored.
  - Until the drive's first batch is written, its IDF is empty.
    `extract_top_keywords` falls back to log-TF as today, and
    `get_tfidf_keywords_for_file` returns no TF-IDF tag candidates.
  - While the document count is under 10, `_idf_upper_bound_from_min_df` switches off
    the `min_doc_freq` noise filter, as it does for any small corpus today.
- The transcript writers and `handle_files_moved` gain one column update and one
  after-commit request each, inside transactions they already open.
- `_purge_file` and `purge_drive` remove the rows through the cascade.
  `PRAGMA foreign_keys=ON` is set on every connection by the engines' connect hook
  (`_enable_wal_mode`).
- The text-embedding-model reset in `database.py` resets `whisper_indexed`. The
  re-transcription it triggers goes through `_remove_whisper_data`, which marks the
  file, so the reset itself needs no change.
- `_build_corpus_idf` stops using the child process. The backfill takes it over.

### 8. Error behavior

Nothing new reaches a user. The operator sees:

- the per-pass INFO line (step 9);
- a WARNING per file that fails on its own (step 7);
- an ERROR when a pass raises (step 10) or the startup rule-version check fails.

A rebuild failure logs as it does today.

### 9. User-visible behavior

Keyword vectors and tag candidates are computed from the same IDF as before, except in
the first-backfill window described in item 7. The host stops running a multi-minute
Janome pass whenever the 600 s cache expires. A paused index queue also holds the
backfill.

`docs/addons/intelligence.md` gains one sentence beside its first-start note (the model
download). It says that the first start after upgrading tokenizes every file once in the
background, which takes minutes on a large library. During that time TF-IDF tag
candidates are missing or less precise. The human chose to document it.

### 10. Non-functional

Measured 2026-10-15 on a copy of this machine's DB (2,071 active files, 46 k chunks,
4.2 M characters), with production scale simulated by duplicating files (hako
`d7WuWD70GW2AJQrt4kK-C`):

- Rows: 137 k here. At 12x (≈ production): 1.65 M rows, aggregate 0.44 s per drive.
  At 50x: 6.9 M rows, aggregate 1.95 s, table about 200 MB.
- Replacing one file's rows takes under 5 ms. Tokenizing the largest file (114 k
  characters) takes 2.5 s, in the child process.
- First backfill after deploy: one full tokenization of the corpus in the child process,
  about 10 min at production scale. After that, only changed files.
- Duplicating files keeps the vocabulary constant, and real growth adds terms, so the
  real aggregate time grows somewhat faster than these numbers.

Concurrency limits:

- At most one backfill pass and one tokenizer child exist per addon process.
- Requests are coalesced over 5 s.
- A build holds no write lock.
- Backfill writes are one short transaction per file.

## Touch points

- `addons/intelligence/app/tfidf.py`:
  - `_build_corpus_idf` becomes the aggregate.
  - `_get_corpus_idf` keeps its contract and gains a per-drive cache drop that also
    stops an in-flight build from storing its result.
  - `_tokenizer_process` is replaced by a terminable child.
  - New: the term-rule version, and the backfill pass and loop.
- `addons/intelligence/app/models.py`: `IndexedFile.idf_terms_indexed`,
  `IndexedFile.idf_terms_gen`, the `idf_doc_terms` model.
- `addons/intelligence/app/database.py`: the migration adding the columns, the index and
  the table; the rule-version check function (called from `main.py` only); the
  after-commit request hook.
- `addons/intelligence/app/main.py`: the lifespan runs the rule-version check, starts
  the backfill loop with the other workers, and cancels it at shutdown.
- `addons/intelligence/app/indexer.py`:
  - `reconcile()` sends the request in a `finally`.
  - `handle_files_moved` marks a file when its filename changes.
  - `_purge_file` relies on the cascade.
- `addons/intelligence/app/workers/whisper.py`: `_remove_whisper_data`, the shared mark
  point for `_persist_transcript`, `_index_loft_vtt` and `fail_orphaned_running_jobs`.
- `addons/intelligence/app/workers/refine.py`: the per-window write (`_apply`) and
  `rechunk_from_words`.
- `addons/intelligence/app/purge.py`: `purge_drive`, read through `_purge_file`.
- Tables: `idf_doc_terms` (new), `indexed_files` (new columns), `index_meta`.
- Existing tests that call `_build_corpus_idf` on fixtures holding only
  `transcript_chunks`, in `addons/intelligence/tests/test_z_auto_tag_drive_scope.py`:
  - `test_document_frequency_counts_only_the_drives_own_files`
  - `test_the_idf_counts_every_batch_and_only_active_files_with_words`
  - `test_the_corpus_is_tokenized_in_a_spawned_process`

  They are rewritten to keep the properties they pin. Drive scope, active-only counting,
  every batch counted, and the 20-character and empty-set rules are checked by running
  the backfill pass and then the build. They do not insert `idf_doc_terms` rows by hand.
  The spawn property moves to the backfill. None is deleted or weakened. The cache and
  single-flight tests in `test_tfidf_keywords.py` stub `_build_corpus_idf` and are
  unchanged.
- New tests citing SPEC-ADDON-021 in `addons/intelligence/tests/`.
- The addon change is committed in the addon repository. The core bumps the
  `addons/intelligence` pointer.
- Rules passed through:
  - `.claude/rules/design-decisions.md`: the drive boundary, file state, and missing
    files keeping their data.
  - `.claude/rules/backend-conventions.md`: language-dependent rules. The tokenizer is
    unchanged.
- Review topic: `docs/process/reviews/feature-idf-term-table/`.
- Risk: the change adds a table and columns (schema modifier) and a background loop with
  a thread-safe signal (concurrency modifier), so `risk-zones.conf` promotes it to
  CRITICAL. No protected path is edited.
- `addons/intelligence/app/indexer.py` `IndexManager.pause()` / resume state, read by
  the backfill. `app/routers/queue.py` is unchanged.
- Docs: `docs/addons/intelligence.md`, one sentence beside the first-start note (item 9).

## Invariants

I1. When every active file of a drive is flagged `idf_terms_indexed` true, the IDF and
document count `_get_corpus_idf(drive)` returns are equal to those computed by tokenizing
every active file of that drive with `_document_tokens` and counting document
frequencies. This holds even when a build of that drive was in flight while the last
batch was written.
I2. `_remove_whisper_data` (and so whisper transcription, the VTT path and the startup
orphan cleanup, even when a later statement in it raises), a refine window write, a
re-chunk, and a `handle_files_moved` call that changes the filename each leave the file
flagged false with `idf_terms_gen` incremented, in the same commit as the change. A
writer transaction that rolls back changes neither and sends no backfill request. A move
that keeps the filename, deactivation and reactivation leave the flag, the generation
and the rows unchanged.
I3. When a file's transcript or filename is committed after the backfill read that file's
`idf_terms_gen`, the file is not flagged true with the term set of the earlier inputs,
and a later pass writes the new set.
I4. A drive's IDF counts no file of another drive, no inactive (missing or trash) file,
and no file without rows, in either the document frequencies or the document count. A
reactivated file is counted with its stored rows.
I5. After `_purge_file` or `purge_drive`, no `idf_doc_terms` row of a purged file
remains.
I6. Building a drive's IDF performs no Janome tokenization. The backfill's tokenization
runs only in a spawned child process. At most one backfill pass and one tokenizer child
exist at a time, a child that exceeds 300 s is terminated, and no tokenizer child
outlives the addon's shutdown. While the index queue is paused, no batch or single-file
retry starts.
I7. Without any other trigger, each of the following leads to a pass that writes the
file:
- a committed step-2 change;
- a file added or reactivated by `reconcile()`;
- an addon start with active files flagged false.

`reconcile()` returns without waiting for that pass.
I8. When the term-rule version recorded in `index_meta` differs from the code's at
startup, every file is flagged false and the new version is recorded in one transaction,
and existing rows remain. A start with a matching version, or a check that fails, changes
neither the flags nor the version.
I9. Neither the migration nor the backfill writes `embeddings` or `vec_text`, or changes
`tfidf_keywords_indexed`.
I10. A failure of one file:
- does not keep any other file of the same batch, or any later batch, from being
  written;
- leaves that file's previous rows in place and its flag false.

A pass that raises does not stop later passes.

## Checked, no action

- **Maintaining df counters instead of term rows.** Counters must be adjusted on every
  active/missing/trash transition and drive move as well as content changes, and drift
  silently. With the term rows, the active state and the drive are read from
  `indexed_files` at build time, so those transitions need no write.
- **Writing the term set from `extract_top_keywords`, which already tokenizes the file
  at whisper time.** Filename-only files (images, documents) never pass through it but
  count toward today's IDF. One writer (the backfill) covers every file type and every
  change source.
- **Running the backfill inline in `reconcile()`.** A 10-minute first pass would delay
  `_resume_incomplete`, and a failure would skip reconcile's later steps. The loop is
  separate and only signalled.
- **Shortening or removing the 600 s TTL.** The per-pass cache drop already brings in
  every change the backfill writes. The TTL still bounds how stale the IDF can be for
  inputs the backfill does not see. Left as is.
- **Keeping the full rebuild until the first backfill finishes.** The human chose the
  partial IDF (item 7).
- **Regenerating keyword vectors or tag suggestions stored during the first-backfill
  window.** They are left as stored. A file whose transcript changes later is
  re-embedded through the existing paths.
- **A reactivation by the core's restore webhook outside `reconcile()`.** The file has
  rows from before unless it was deactivated mid-backfill. In that rare case it stays
  out of the IDF until the next `reconcile()` (hourly by default).
- **Persisting the "failed on its own" set across restarts.** A restart retries such a
  file once, at the cost of one child spawn.
- **Detecting a tokenizer-rule change automatically** (a fingerprint over probe text).
  It would catch only the changes the probe exercises. The version string is bumped by
  hand, like the text-embedding model key.
- **`find_similar_by_tfidf`**, which tokenizes the corpus on its own. It has no caller
  (hako `7MuwDn3CueXjga2qAPbDb`). Not touched.
- **Text documents' `text_content`.** Today's IDF reads only `transcript_chunks` and
  the filename. The term set keeps that input, so the IDF does not change.
- **Orphan rows written on a connection without `PRAGMA foreign_keys=ON`.** Every engine
  sets it in its connect hook. Such a row would join to no file and count toward no
  IDF.
- **An admin progress counter for the backfill.** It is not added. The per-pass log
  line (step 9) is the signal.
- **Downgrading and upgrading again.** Older code changes transcripts without marking,
  so its changes would stay unseen while the version string matches. Downgrades are not
  supported. Bumping the version after one repairs it.
- **Write-lock contention from the first backfill** (one short transaction per file,
  about 25 k at production scale). Each holds the lock for a few milliseconds, so
  whisper and refine writes wait at most that long between them.
