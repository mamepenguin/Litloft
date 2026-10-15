# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The after_commit/after_rollback listeners fire for every SQLAlchemy Session in the process, including the core DB, not only the search DB writers.; The 'Rebuilding corpus IDF' INFO log line no longer appears.
- claude-read: The after_commit/after_rollback listeners fire for every SQLAlchemy Session in the process, including the core DB, not only the search DB writers.
- claude-read: The 'Rebuilding corpus IDF' INFO log line no longer appears.
- claude-verify: Session event listeners are process-global and also fire on core-DB sessions. They are inert unless mark_idf_terms_stale sets the session.info key.

### unspecified_behavior

Note: Session event listeners are process-global and also fire on core-DB sessions. They are inert unless mark_idf_terms_stale sets the session.info key.
- claude-read: The after_commit/after_rollback listeners fire for every SQLAlchemy Session in the process, including the core DB, not only the search DB writers.
- claude-read: The 'Rebuilding corpus IDF' INFO log line no longer appears.
- claude-verify: Session event listeners are process-global and also fire on core-DB sessions. They are inert unless mark_idf_terms_stale sets the session.info key.

## Findings

A: 0
B: 5
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The backfill pass, the loop, the request flag and the after-commit/after-rollback hooks live in a new module `app/idf_backfill.py`, which the touch-point list does not name; the list places the backfill in `app/tfidf.py` and the after-commit hook in `app/database.py`.
Impact: No user-visible defect. A reader who follows the touch-point list to check I2/I6/I7 looks in tfidf.py and database.py and does not find the code there, so the review scope is wider than declared.
Evidence: addons/intelligence/app/idf_backfill.py:1-408 (new file); indexer.py:30, workers/whisper.py:32 and workers/refine.py:37 import from it; main.py:374 starts `idf_backfill_loop` from it. database.py gains only `check_idf_term_rules` and the migration, not the hook.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `addons/intelligence/app/idf_backfill.py` to the touch points as the home of the backfill pass, the loop and the after-commit hook.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The after-commit and after-rollback hooks are registered on the global `sqlalchemy.orm.Session` class, so they run for every session in the addon process, including core-DB (`_HomevaultSession`) sessions, not only on the writer's search-DB session that the touch point describes.
Impact: Today the listeners only pop a key from `session.info`, so there is no wrong result. Every commit and rollback of every session in the process now passes through this module, and a later edit to these listeners would affect all of them.
Evidence: addons/intelligence/app/idf_backfill.py:76-84 `@event.listens_for(Session, "after_commit")` / `"after_rollback"` with `Session` imported from sqlalchemy.orm; database.py:21,128,1956 create separate sessionmakers for the search DB and the core DB.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either list the process-wide listener as a touch point or register it on the search sessionmaker (`_SearchSession`) only.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: `IndexManager` gains a new public method `is_paused()`. The touch point only says the existing pause/resume state is read by the backfill.
Impact: No defect. It adds an API surface on IndexManager that the touch-point list does not mention.
Evidence: addons/intelligence/app/indexer.py:248-250 new `is_paused`; read by idf_backfill.py:114 `_queue_paused`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name `IndexManager.is_paused()` under the indexer.py touch point.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The test change reaches beyond the listed three rewritten tests plus new SPEC-ADDON-021 tests. The shared `index` fixture of test_z_auto_tag_drive_scope.py is modified for every test in that file. The existing helper `tests/idf_doubles.py` is extended. New non-test helper modules `tests/idf_backfill_api.py` and `tests/idf_term_db.py` are added. test_idf_term_marks.py imports private helpers from `tests/test_refine_fts_reindex.py`.
Impact: Every other test in test_z_auto_tag_drive_scope.py now runs with `app.database._search_engine`, `_SearchSession` and `dependencies._index_manager` patched. An unrelated test there could change behavior without the reviewers expecting it. A refactor of test_refine_fts_reindex.py's private helpers now breaks the SPEC-ADDON-021 mark tests.
Evidence: tests/test_z_auto_tag_drive_scope.py:147-151 (fixture `index` patches database engine/session and the index manager); tests/idf_doubles.py adds MarkerTokenizer/ExplodingTokenizer; tests/test_idf_term_marks.py:17-24 imports `_FAILING_TRANSCRIPT_DDL, FILE, _llm, _make_db, _patch_job, _seed_file` from tests.test_refine_fts_reindex.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the fixture change, the helper modules and the dependency on test_refine_fts_reindex.py helpers as test touch points.

</details>

### claude-read:TP-5 — bucket B, INFO, open

Claim: `_rebuild` in tfidf.py drops the INFO line "Rebuilding corpus IDF for TF-IDF keyword extraction (drive=...)" and removes `_count_document_frequencies` / `_load_child_tokenizer`. The touch points say `_get_corpus_idf` keeps its contract and list no change to the rebuild's logging.
Impact: The operator no longer sees when a drive's IDF is rebuilt, a log signal they had before this change. Nothing else in the addon referenced the removed helpers (grep finds no caller).
Evidence: addons/intelligence/app/tfidf.py `_rebuild` (diff hunk at ~728): the logger.info call is deleted; grep for `_count_document_frequencies|_load_child_tokenizer|_tokenizer_process` in addons/intelligence finds no remaining reference.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either keep the rebuild INFO line or list its removal under the tfidf.py touch point.

</details>

## Not verified

- claude-read: Did not run any test or import; circular-import safety of app.idf_backfill was not checked.
- claude-read: Did not read the addon repository's own rule/process documents (.claude/rules) in full.
- claude-read: Did not verify the per-invariant correctness of the backfill (I1–I10); scope was limited to unplanned touch points.
- claude-read: Did not check whether other tests in test_z_auto_tag_drive_scope.py behave differently under the modified fixture.
- claude-verify: Could not diff against origin/develop (no git or shell access), so I did not prove that is_paused, the fixture changes and the idf_doubles additions are new in this commit rather than already in the base.
- claude-verify: Did not run the test suite.
- claude-verify: Did not verify invariants I1-I10 beyond what the five findings touch.

TOTAL: 5 findings
