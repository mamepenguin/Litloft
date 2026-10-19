# R2 review of 259189b (fix commit on b6eeaea)

Scope: only what 259189b changes. Threat model: personal home-LAN tool, single owner, no adversary.

## Check 1: every block switched to get_search_db_read() is read-only

Method: extracted the full body of each of the 39 `+ with get_search_db_read()` lines in
`git diff -U0 b6eeaea 259189b -- app` (script walks the with-block by indentation at 259189b),
read every body, and read every helper that receives the session.

Verified read-only (SELECT / ORM query only; no add/delete/attribute assignment/flush/DML):

- app/citations.py:1637 get_citations
- app/indexer.py:278 get_index_status (count() queries only)
- app/main.py:515 status_endpoint filename lookup
- app/rag/clue_generator.py:82 fetch_long_summaries
- app/rag/coarse_retriever.py:114 drive file count
- app/rag/context.py:139, 181, 256, 324, 387, 425, 472, 508, 536 (all SELECT / query().all())
- app/rag/retriever.py:236 _get_indexed_files_meta
- app/routers/admin.py:1068 _failed_jobs_page (aggregate + per-group queries)
- app/routers/chapter_suggestions.py:55, 152 (both `_read` closures, SELECT only; the approve write is a separate get_search_db block)
- app/routers/files.py:52, 87, 142, 156, 354, 489, 630, 682, 781, 840, 907
  - helper `_compute_provider_stats(db, ...)` (files.py:414): query/group_by/first only
  - helper `load_section_titles(db, ...)` (app/document_sections.py:36): SELECT only
- app/routers/summaries.py:112, 217, 552
- app/routers/vision.py:87, 105
- app/workers/summaries.py:405, 429, 450, 473, 821

No write found in any switched block. Note: `_SearchSession` is `expire_on_commit=False`
(database.py:128), so ORM rows returned out of a read block (vision.py:87 `_fetch_indexed_file`)
behave the same as before (no commit-expiry either way).

## Check 2: switched helpers used on write paths

Grepped callers of every switched helper. Every write path that calls one
(summaries.py edit/revert/regenerate, chapter approve, vision/video_visual starts, summary workers)
does its write in a separate `get_search_db()` block that re-reads under the lock where it
needs atomicity (e.g. summaries.py regenerate holds one session across check + clear). None of the
switched reads was inside an outer `get_search_db()` block before (the lock is a non-reentrant
`threading.Lock`, so nesting would have deadlocked), so no read-then-write sequence lost a
serialization it had. Post-write re-reads (summaries.py:1010, 1084) run after the write block
committed, and a new read session sees committed data. No finding.

## Check 3: the AST guard (tests/test_read_paths_skip_write_lock.py)

Mutation (each switched read put back to `get_search_db()`, guard run alone, in Docker on 259189b):
files.py:52, rag/context.py:139, rag/retriever.py:236, rag/clue_generator.py:82,
rag/coarse_retriever.py:114, citations.py:1637, workers/summaries.py:821, vision.py:105,
main.py:515, admin.py:1068, summaries.py:217 -> guard FAILS (caught). indexer.py:278 -> guard PASSES (missed), see F1.

### F1 [B] Guard misses reads reached through an instance method; `/status` is unprotected
- Where: tests/test_read_paths_skip_write_lock.py:42-55 (`_resolve_ref`); the route is app/main.py:458
  `status_endpoint`, which calls `manager = dependencies.get_index_manager(); manager.get_index_status()`
  (main.py:470-471) -> app/indexer.py:278.
- `_resolve_ref` only resolves bare names, `self.`/`cls.` attributes and module aliases. A method
  called on a local object (`manager.x()`, `dependencies._video_visual_worker.get_status()`) is
  dropped from the call graph, so nothing behind it is checked.
- Scenario: someone changes `IndexManager.get_index_status` back to `get_search_db()` (or adds a
  lock-taking call to it). The dashboard `/status`, one of the reads this commit names as its
  motivation, stalls behind every refine alignment window again and the guard stays green.
- Verified: mutation indexer.py:278 `get_search_db_read()` -> `get_search_db()`; guard file
  `9 passed`. Enumerated every GET route's calls to class methods: the only uncovered ones are in
  `status_endpoint` (`get_index_status`, `get_queue_status`, `get_queue_breakdown`, each worker's
  `get_status`); all are lock-free today (video_visual.get_status uses get_search_db_read), so nothing
  is wrong now; it is a detector hole.

### F2 [B] Read-only POST routes still take the write lock and are outside `_READ_POSTS`
- Where: app/routers/summaries.py:504 (`/batch/summaries` `_classify`), app/routers/files.py:1011
  (`/batch/suggested-tags` `_read_eligibility`), app/routers/refine.py:113 (`/refine/files/{id}` `_read`)
  and :167 (`/refine/folders` `_filter`). Each block only SELECTs (helpers `refine_chunk_ids`,
  `filter_transcript_file_ids` checked: no writes) and then enqueues / starts a job outside the block.
- Scenario: while a refine is aligning one file, the owner clicks "refine" on a second file or
  "summarize folder"; the request waits out the alignment window before it even queues. Latency only,
  nothing silently wrong, and outside the commit's stated scope (GET + /ask, /find), hence B.
- Verified: read the four blocks at 259189b; the guard's `_READ_POSTS = {"/ask", "/find"}`
  (test file line 27) does not name them.

## Check 4: fixture changes

`read_session_from` rolls back on exit, so in real-SQLite fixtures a write placed in a read block is
discarded as in production. Mutations that moved real writes onto `get_search_db_read()`:
summaries.py:377 (edit) -> 4 failures in test_summaries_edit.py; summaries.py:954 (detailed edit)
-> 4 failures in test_detailed_edit_endpoints.py; chapter_suggestions.py:187 (approve) -> 1 failure.
So the doubles do surface a lost write. (files.py:944 suggested-tags dismiss -> full suite green, but
that endpoint has no test at all at the parent either; not introduced by 259189b.)

### F3 [B] Dead read-double line in the chapter fixture leaves a committing read double in place
- Where: tests/test_chapter_suggestions.py:61 sets `app.database.get_search_db_read` to
  `read_session_from(db)`; the pre-existing line 62 immediately overwrites it with `db`, the
  committing write factory.
- Effect: code that imports `get_search_db_read` from `app.database` at call time
  (app/workers/chapter_suggestions.py:273, 293, 336) gets a session that commits in this fixture, so a
  write accidentally placed in one of those read blocks would persist in tests and not show up as lost.
  Line 61 has no effect.
- Verified: read the fixture at 259189b; second setattr on the same target wins.

## Check 5: executor change (app/main.py:66-72)

- `asyncio.to_thread` / `run_in_executor(None, ...)` use the new 64-thread pool; no app code calls
  `run_in_executor` with an explicit executor. FastAPI sync `def` routes and `run_in_threadpool` use
  anyio's own limiter, not this pool, so they are unaffected either way.
- Set before the first `to_thread` in lifespan (main.py:113), so no earlier default executor is
  orphaned. Shutdown: the loop's `shutdown_default_executor()` (asyncio.run / uvicorn) joins it.
- SQLAlchemy QueuePool (5+10) can make >15 concurrent lock-free reads wait for a connection; reads are
  short and single-user bursts are small, and lock-free worker reads already existed at the parent.
  No finding.
- Full suite at 259189b: 3568 passed, 2 skipped.

## Check 6: other mutations

- frame_cache.py:80 temp name made shared again -> `test_concurrent_extractions_of_one_frame_both_succeed`
  fails. Caught.
- refine.py start_refine_job: restored `try/except RuntimeError: pass` -> full suite 3568 passed. See F4.

### F4 [B] Nothing pins that start_refine_job fails loudly off the loop
- Where: app/workers/refine.py:881-888; tests/test_refine_endpoints.py new tests stub
  `start_refine_job` entirely.
- The new router tests do catch the realistic regression (moving the call into a `to_thread`
  closure makes the stub's `asyncio.get_running_loop()` raise). Only the combination "router moves the
  call off-loop AND the swallow comes back" would silently drop jobs again, so this is a low-value gap.
- Verified: mutation above, full suite green.

## Summary

All 39 switched blocks are read-only, including the two helpers that receive the session; no switched
helper lost a serialization a writer relied on. No A findings.

TOTAL: 4 findings
