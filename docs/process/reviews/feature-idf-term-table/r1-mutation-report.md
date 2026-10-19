# Mutation review: intelligence 15de2e8 (base 76c672a), SPEC-ADDON-021

Tests run per mutation: tests/test_idf_term_backfill.py tests/test_idf_term_marks.py tests/test_idf_term_loop.py tests/test_z_auto_tag_drive_scope.py tests/test_tfidf_keywords.py (`-x --no-cov`), image intelligence-mut-idf with worktree app/ mounted. Baseline: 81 passed.

| id | file:function | change | want | result |
|---|---|---|---|---|
| M01 | app/idf_backfill.py | mark_idf_terms_stale: no gen bump (I2/I3) | want=kill | killed (1 failed, 21 passed in 12.42s) |
| M02 | app/idf_backfill.py | mark_idf_terms_stale: request at mark, not after commit (I2 rollback sends nothing) | want=kill | killed (1 failed, 21 passed in 12.14s) |
| M03 | app/idf_backfill.py | _forget_after_rollback: keep flag after rollback (I2) | want=kill | survived (81 passed in 33.03s) |
| M04 | app/idf_backfill.py | _collect: drop active filter (_read_docs filters again) | want=live | killed (1 failed in 0.91s) |
| M05 | app/idf_backfill.py | _read_docs: tokenize inactive files | want=kill | survived (81 passed in 28.21s) |
| M06 | app/idf_backfill.py | _write: drop gen check (I3) | want=kill | killed (1 failed, 17 passed in 10.83s) |
| M07 | app/idf_backfill.py | _write: write inactive file | want=kill | killed (1 failed, 19 passed in 11.96s) |
| M08 | app/idf_backfill.py | _write: no delete of old rows | want=kill | killed (1 failed, 1 passed in 1.12s) |
| M09 | app/idf_backfill.py | _write: drop single-term sets | want=kill | killed (1 failed in 0.88s) |
| M10 | app/idf_backfill.py | _write: never set flag true | want=kill | killed (1 failed in 0.90s) |
| M11 | app/idf_backfill.py | _write_all: write failure no retry (I10) | want=kill | killed (1 failed, 46 passed in 51.90s) |
| M12 | app/idf_backfill.py | _write_all: write failure stops batch (I10) | want=kill | killed (1 failed, 16 passed in 10.79s) |
| M13 | app/idf_backfill.py | _write_all: skipped-by-gen no re-request (I3 later pass) | want=kill | killed (1 failed, 45 passed in 56.69s) |
| M14 | app/idf_backfill.py | _write_all: no drive recorded -> no cache drop (I1) | want=kill | killed (1 failed, 4 passed in 2.11s) |
| M15 | app/idf_backfill.py | _run_batch: batch failure -> no one-at-a-time retry (I10) | want=kill | killed (1 failed, 12 passed in 4.27s) |
| M16 | app/idf_backfill.py | _tokenize_one_at_a_time: failing file not held (retried every pass) | want=kill | killed (1 failed, 15 passed in 10.32s) |
| M17 | app/idf_backfill.py | _tokenize_one_at_a_time: stop at first bad file (I10) | want=kill | killed (1 failed, 12 passed in 4.41s) |
| M18 | app/idf_backfill.py | _tokenize_one_at_a_time: no pause wait (I6) | want=kill | survived (81 passed in 29.87s) |
| M19 | app/idf_backfill.py | run_idf_backfill_pass: no pause wait per batch (I6) | want=kill | killed (1 failed, 48 passed in 25.82s) |
| M20 | app/idf_backfill.py | _wait_while_paused: ignore stop when not paused | want=kill | survived (81 passed in 29.74s) |
| M21 | app/idf_backfill.py | _take_unheld: no release of entry on gen change | want=kill | survived (81 passed in 29.95s) |
| M22 | app/idf_backfill.py | _take_unheld: held forever even after gen change | want=kill | killed (1 failed, 15 passed in 10.04s) |
| M23 | app/idf_backfill.py | _remaining: count held files | want=kill | killed (1 failed, 15 passed in 10.00s) |
| M24 | app/idf_backfill.py | _run_batch: no drop_corpus_idf (I1) | want=kill | killed (1 failed, 4 passed in 2.16s) |
| M25 | app/idf_backfill.py | run_idf_backfill_pass: child not closed at end (I6 at most one child) | want=kill | killed (1 failed, 12 passed in 9.70s) |
| M26 | app/idf_backfill.py | idf_backfill_loop: changed -> no re-request (I3) | want=kill | killed (1 failed, 45 passed in 51.59s) |
| M27 | app/idf_backfill.py | idf_backfill_loop: pass exception ends loop (I10) | want=kill | killed (1 failed, 47 passed in 23.52s) |
| M28 | app/idf_backfill.py | idf_backfill_loop: cancel does not terminate child (I6) | want=kill | killed (1 failed, 49 passed in 85.35s (0:01:25)) |
| M29 | app/idf_backfill.py | idf_backfill_loop: request not cleared -> pass churn | want=kill | survived (81 passed in 29.45s) |
| M30 | app/idf_backfill.py | idf_backfill_loop: write_failed no retry timer (I10) | want=kill | killed (1 failed, 46 passed in 53.11s) |
| M31 | app/idf_backfill.py | _wait_for_request: retry timer ignored | want=kill | killed (1 failed, 46 passed in 52.53s) |
| M32 | app/idf_backfill.py | _Tokenizer.term_sets: failed child reused | want=kill | killed (1 failed, 12 passed in 4.77s) |
| M33 | app/tfidf.py | tfidf._rebuild: drop epoch check (I1 in-flight build) | want=kill | killed (1 failed, 5 passed in 2.47s) |
| M34 | app/tfidf.py | tfidf.drop_corpus_idf: no epoch bump (I1) | want=kill | killed (1 failed, 5 passed in 2.38s) |
| M35 | app/tfidf.py | tfidf.drop_corpus_idf: no cache pop (I1) | want=kill | killed (1 failed, 4 passed in 2.13s) |
| M36 | app/tfidf.py | tfidf._rebuild: epoch read after build (I1) | want=kill | killed (1 failed, 5 passed in 2.48s) |
| M37 | app/tfidf.py | _IDF_AGGREGATE_SQL: drop active filter (I4) | want=kill | killed (1 failed, 7 passed in 3.02s) |
| M38 | app/tfidf.py | _IDF_AGGREGATE_SQL: drop drive filter (I4) | want=kill | killed (1 failed, 2 passed in 1.52s) |
| M39 | app/tfidf.py | _IDF_AGGREGATE_SQL: n_docs counts files without rows (I4) | want=kill | killed (1 failed, 2 passed in 1.55s) |
| M40 | app/tfidf.py | TokenizerChild.term_sets: no timeout (I6 300 s) | want=kill | killed (1 failed, 14 passed in 125.67s (0:02:05)) |
| M41 | app/tfidf.py | TokenizerChild.term_sets: child error treated as ok | want=kill | killed (1 failed, 13 passed in 5.13s) |
| M42 | app/database.py | check_idf_term_rules: no reset on version change (I8) | want=kill | killed (1 failed, 36 passed in 14.36s) |
| M43 | app/database.py | check_idf_term_rules: reset on every start (I8) | want=kill | killed (1 failed, 38 passed in 14.29s) |
| M44 | app/database.py | check_idf_term_rules: version committed before reset (I8 one transaction) | want=kill | survived (81 passed in 29.67s) |
| M45 | app/database.py | _migrate_idf_terms_columns: existing rows default indexed=1 (I7 addon start) | want=kill | survived (81 passed in 29.99s) |
| M46 | app/indexer.py | handle_files_moved: mark on every move (I2 move keeping name unchanged) | want=kill | killed (1 failed, 29 passed in 14.22s) |
| M47 | app/indexer.py | handle_files_moved: never mark on rename (I2) | want=kill | killed (1 failed, 28 passed in 13.24s) |
| M48 | app/indexer.py | reconcile: no backfill request (I7) | want=kill | killed (1 failed, 32 passed in 14.35s) |
| M49 | app/indexer.py | IndexManager.is_paused: always false (I6) | want=kill | killed (1 failed, 48 passed in 26.98s) |
| M50 | app/workers/whisper.py | _remove_whisper_data: no mark (I2) | want=kill | killed (1 failed, 21 passed in 12.29s) |
| M51 | app/workers/refine.py | rechunk_from_words: no mark (I2) | want=kill | killed (1 failed, 26 passed in 13.79s) |
| M52 | app/workers/refine.py | _run_refine_job: no mark on window write (I2) | want=kill | killed (1 failed, 24 passed in 13.36s) |
| M53 | app/workers/whisper.py | _remove_whisper_data: mark moved after deletes (I2 even when later statement raises) | want=kill | killed (1 failed, 21 passed in 13.22s) |
| M54 | app/idf_backfill.py | _read_docs: extra transcript read before gen (harmless; control) | want=live | survived (81 passed in 29.15s) |
| M55 | app/idf_backfill.py | _read_docs: gen/filename re-read after transcript (I3 ordering) | want=kill | survived (81 passed in 28.37s) |
| M56 | app/idf_backfill.py | _write_all: no stop check between writes | want=live | survived (81 passed in 29.57s) |
| M57 | app/idf_backfill.py | idf_backfill_loop: no startup pass (I7 addon start) | want=kill | killed (1 failed, 40 passed in 44.47s) |
| M58 | app/main.py | lifespan: rule check not run (I8) | want=kill | survived (81 passed in 29.70s) |
| M59 | app/main.py | lifespan: backfill task not cancelled at shutdown (I6) | want=kill | survived (81 passed in 29.16s) |
| M60 | app/idf_backfill.py | _tokenize_one_at_a_time: held at wrong gen (retried each pass) | want=kill | killed (1 failed, 15 passed in 10.73s) |
| M58-full | app/main.py | lifespan: rule check not run (I8) [full suite] | want=kill | survived (3626 passed, 2 skipped in 188.51s (0:03:08)) |
| M59-full | app/main.py | lifespan: backfill task not cancelled (I6) [full suite] | want=kill | survived (3626 passed, 2 skipped in 192.02s (0:03:12)) |
| M44-full | app/database.py | check_idf_term_rules: version committed before reset (I8) [full suite] | want=kill | survived (3626 passed, 2 skipped in 191.23s (0:03:11)) |

Notes on the table: M04 was declared live but was killed (a test pins `_collect`'s active filter directly) — no finding. M44/M58/M59 were re-run on the full suite (`tests/`, 3626 passed) and still survived. The worktree was clean after every mutation and has been removed.

Reclassified as equivalent (declared kill, survived, no finding):
- M21 `_take_unheld` without `del _held[fid]`: the stale entry is only consulted for `held_gen == gen`, and generations only increase, so a released entry can never re-hold the file; a new failure overwrites it. Memory only.
- M45 migration `DEFAULT 1`: on upgrade `index_meta` has no `idf_term_rules` key, so `check_idf_term_rules` flags every file false anyway. Equivalent only because the lifespan calls the check — which is itself unpinned (finding M58).
- M54, M56: declared live, survived as expected.

## Findings

F1 (M55) `idf_backfill._read_docs` — reading `idf_terms_gen` after the transcript survives. Breaks I3. Bucket A (rare race). pysqlite runs each SELECT outside a transaction, so the two reads are separate snapshots. Scenario: a re-transcription (`_remove_whisper_data` + new chunks) commits between the transcript read and the gen read; the backfill then holds the old transcript with the new gen, `_write` accepts it, and the file is flagged true with the old term set; no later pass rewrites it. The I3 tests inject the change between `_read_docs` and `_write`, never inside `_read_docs`, so the "gen before inputs" order in the docstring is not tested.

F2 (M58) `main.lifespan` — removing `await asyncio.to_thread(check_idf_term_rules)` survives (full suite). Breaks I8 at the integration level. Bucket A. Scenario: a later change bumps `IDF_TERM_RULES_VERSION`; if the call is dropped or moved after the loop starts, no file is re-tokenized and every drive's IDF silently stays on the old rules. The unit tests call `check_rules()` directly; nothing asserts that startup runs it (or runs it before the first pass).

F3 (M59) `main.lifespan` — removing the backfill task's cancel/await at shutdown survives (full suite). Breaks I6 ("no tokenizer child outlives the addon's shutdown"). Bucket A, low. Scenario: shutdown during the first-start backfill; the loop is not cancelled before the rest of shutdown (engine disposal etc.), so the pass thread and its child keep running until the event loop is torn down. The cancellation test drives `run_loop()` directly, not the lifespan.

F4 (M20) `_wait_while_paused` — returning `True` instead of `not stop.is_set()` when the queue is not paused survives. Breaks I6 (child outliving shutdown) for multi-batch passes. Bucket A, low. Scenario: shutdown during a first-start backfill of thousands of files. Stop terminates the current child and `_run_batch` returns, but the batch loop's `_wait_while_paused(stop)` is the only stop check between batches. With the mutation the pass goes on reading the next batch and `_Tokenizer` spawns a new child after shutdown, once per remaining batch. The default-executor thread is non-daemon, so the process exit waits for it. The cancellation test has a single file (one batch), so the stop check between batches is not exercised.

F5 (M18) `_tokenize_one_at_a_time` — removing the per-file `_wait_while_paused` survives. Breaks I6 ("While the index queue is paused, no ... single-file retry starts"). Bucket A, low. Scenario: a 200-file batch fails (timeout or a crashing file), and the owner pauses the queue to free CPU while the one-at-a-time retry runs. The retry keeps tokenizing all remaining files (each up to 300 s) regardless. The pause test covers only the per-batch wait (M19 killed).

F6 (M44) `database.check_idf_term_rules` — committing the new version before the flag reset survives (full suite). Breaks I8 ("one transaction ... a check that fails changes neither"). Bucket A, low likelihood. Scenario: on a rule-version bump, the reset `UPDATE indexed_files` fails (e.g. `database is locked`, since the index manager has already started). The version is already recorded, so later starts never reset again, and the IDF stays on the old rules. The failure test injects its fault at the `index_meta` upsert (CHECK constraint), which runs last in the original order and first in the mutant, so it cannot tell the two orders apart. A fault on the `UPDATE` would.

F7 (M29) `idf_backfill_loop` — not clearing `_requested` before a pass survives. No invariant is directly broken; nothing ends up wrong. Bucket B. Effect: after the first request the loop runs a pass every 5 s forever (a `_collect` query each time). No test asserts that the loop goes idle.

F8 (M05) `_read_docs` — not skipping inactive rows survives. Bucket B. A file deactivated between `_collect` and `_read_docs` gets tokenized needlessly, `_write` refuses it (counted skipped, `changed`), and one extra pass follows. Nothing ends up wrong.

F9 (M03) `_forget_after_rollback` — not popping the session flag survives. Bucket B. I2's "a rollback sends no request" still holds for the rollback itself. Only a later commit on the same Session object would send a spurious request, which costs one no-op pass. Every writer uses a per-transaction session context manager, so this cannot happen in normal use.

Summary: 60 mutation runs (M01–M60, plus full-suite re-runs of M44/M58/M59). 47 killed, 13 survived. 2 survivors are equivalent (M21, M45) and 2 were expected live (M54, M56); the other 9 are findings: 6 in bucket A (F1–F6), 3 in bucket B (F7–F9). Well covered: the gen check, the epoch/drop in-flight cache logic, the aggregate SQL filters, held/release, write-failure retry, the loop's exception and cancel paths, the rename-only mark, the whisper mark-first order, and the per-batch pause.

TOTAL: 9 findings
