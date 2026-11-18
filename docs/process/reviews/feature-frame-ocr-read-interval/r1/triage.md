# Triage: r1

## Warnings

- R-5 ran at 03e28cccd8a0a5ebc332a3f4bdbc4a1eb3631fea, and these files changed since: docs/addons/intelligence.md, scripts/dev/frame_ocr_bench/i2_check.py; run R-5 again if any of them changes what a user sees

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

## Read coverage

Product files:
- addons/intelligence/app/database.py — partial: Lines 1240-1284: the changed hunk and most of _migrate_frame_page_ocr_columns; the function's tail was not read.
- addons/intelligence/app/indexer.py — partial: Lines 160-209, 440-579, 915-1204, 1330-1399, 1440-1519 and 1995-2179: every changed hunk with most of its enclosing function.
- addons/intelligence/app/models.py — partial: Lines 90-114: the changed column and its neighbours.
- addons/intelligence/app/routers/files.py — partial: Lines 56-105, 990-1140, 1240-1289 and 1700-1729: every changed hunk; the start of reindex_file before line 990 was not read.
- addons/intelligence/app/workers/frame_ocr.py — full: Read lines 1-797, the whole file.
- addons/intelligence/app/workers/frame_scan.py — full: The only change is the module docstring; read lines 1-40 including it.
- addons/intelligence/app/workers/ocr.py — full: Read lines 100-239, which cover run_engine and all new functions (the changed hunks with their enclosing functions).
- scripts/dev/frame_ocr_bench/i2_check.py — full: Whole file opened.
- scripts/dev/frame_ocr_bench/measure.py — full: Whole file opened.
- scripts/dev/frame_ocr_bench/reference.py — full: Whole file opened.
- scripts/dev/frame_ocr_bench/run.sh — full: Whole file opened.

Test files:
- addons/intelligence/tests/frame_box_doubles.py — not_read: Not opened; reviewed only through the full new-file diff in the prompt.
- addons/intelligence/tests/loft_media_world.py — not_read: Not opened; reviewed only through the diff hunk in the prompt.
- addons/intelligence/tests/ocr_fixtures.py — partial: Opened lines 340-430 (_SEARCH_DB_MODULES and build_search_db); the WholeImageBoxShim hunk was seen in the diff only.
- addons/intelligence/tests/test_frame_page_ocr_readers.py — not_read: Not opened; reviewed only through the diff hunks in the prompt.
- addons/intelligence/tests/test_picture_lines_frames.py — not_read: Not opened; reviewed only through the diff hunk in the prompt.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_outdated.py — not_read: Not opened; reviewed only through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_reread.py — not_read: Not opened; reviewed only through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_reread_text.py — not_read: Not opened; reviewed only through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_selection.py — not_read: Not opened; reviewed only through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_loft_fetch_gate.py — not_read: Not opened; reviewed only through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_loft_read_rule.py — not_read: Not opened; reviewed only through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_123_frame_box_reuse.py — not_read: Not opened; reviewed only through the full new-file diff in the prompt.

## Needs a human

### unspecified_behavior

Note: _ReadResult.frame_gap is computed but never used (R3).; _collect_incomplete's SQL selects every outdated native video under any mode, including manual and false. These rows pass through the inapplicable-flag loop on each resume and are filtered only in the Python queueing loop.; _frame_ocr_worker performs an extra DB lookup per frame task before running it (R2).; run.sh pipes every harness output through `grep -v -i warn`, which also removes DIFF lines from i2_check whose recognised text contains 'warn'. run.sh also discards i2_check's exit status with `|| true`.
- claude-read: _ReadResult.frame_gap is computed but never used (R3).
- claude-read: _collect_incomplete's SQL selects every outdated native video under any mode, including manual and false. These rows pass through the inapplicable-flag loop on each resume and are filtered only in the Python queueing loop.
- claude-read: _frame_ocr_worker performs an extra DB lookup per frame task before running it (R2).
- claude-read: run.sh pipes every harness output through `grep -v -i warn`, which also removes DIFF lines from i2_check whose recognised text contains 'warn'. run.sh also discards i2_check's exit status with `|| true`.
- claude-verify: _ReadResult.frame_gap is computed on every decoded frame and never read (frame_ocr.py:126,404).
- claude-verify: If the _is_outdated_frame_read lookup raises in _frame_ocr_worker (indexer.py:2014-2016), the frame task is dropped without running index_frame_ocr.

### unspecified_behavior

Note: _ReadResult.frame_gap is computed on every decoded frame and never read (frame_ocr.py:126,404).; If the _is_outdated_frame_read lookup raises in _frame_ocr_worker (indexer.py:2014-2016), the frame task is dropped without running index_frame_ocr.
- claude-read: _ReadResult.frame_gap is computed but never used (R3).
- claude-read: _collect_incomplete's SQL selects every outdated native video under any mode, including manual and false. These rows pass through the inapplicable-flag loop on each resume and are filtered only in the Python queueing loop.
- claude-read: _frame_ocr_worker performs an extra DB lookup per frame task before running it (R2).
- claude-read: run.sh pipes every harness output through `grep -v -i warn`, which also removes DIFF lines from i2_check whose recognised text contains 'warn'. run.sh also discards i2_check's exit status with `|| true`.
- claude-verify: _ReadResult.frame_gap is computed on every decoded frame and never read (frame_ocr.py:126,404).
- claude-verify: If the _is_outdated_frame_read lookup raises in _frame_ocr_worker (indexer.py:2014-2016), the frame task is dropped without running index_frame_ocr.

## Findings

A: 0
B: 5
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The diff changes two shared test fixtures, tests/ocr_fixtures.py and tests/loft_media_world.py. The touch-point list does not name them: it covers only tests citing SPEC-ADDON-122/123 and existing frame-OCR tests that assert the 10 s / 16-bit selection, pending counts or the reindex answer.
Impact: About 25 test modules use build_search_db, including picture OCR, PDF text, frame scan SPEC-ADDON-111, .loft SPEC-ADDON-117/119/121 and index details. They now eagerly import app.database, app.indexer, app.workers.ocr, app.workers.frame_ocr, app.workers.metadata, app.routers.files and app.main, and the search.db accessors are also patched into app.workers.frame_ocr. Every LoftWorld test now replaces detect_boxes/recognise_boxes with WholeImageBoxShim. That shim answers each line as one whole-image box, so box matching is all-or-nothing in those suites: the IoU of the boxes it returns depends only on the line count, and the real split engine path is never exercised. Suites outside the planned scope changed behaviour without being listed.
Evidence: addons/intelligence/tests/ocr_fixtures.py:354-362 adds "app.workers.frame_ocr" to _SEARCH_DB_MODULES; ocr_fixtures.py:425-428 imports every module before patching; ocr_fixtures.py WholeImageBoxShim (diff hunk at @@ -236). addons/intelligence/tests/loft_media_world.py (diff hunk at @@ -109) patches both seams for every LoftWorld. Grep: build_search_db / LoftWorld( appear in 27 test files, e.g. test_pdf_text_rules.py, test_image_ocr_worker.py, test_spec_addon_111_frame_scan_index.py, test_spec_addon_117_loft_media_queue.py.
Repro: not_reproduced (read-only review; the effect on the unrelated suites was not run)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add tests/ocr_fixtures.py and tests/loft_media_world.py to the touch-point list as shared fixtures, or confine the shim to the frame-OCR tests that need it.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: The diff changes indexer.py's _frame_ocr_worker and adds _reread_running state on IndexManager. The touch-point list does not name them: for indexer.py it lists _collect_incomplete, _resume_incomplete, get_status/IndexStatus, prioritize, raising a queued task's priority and the .loft download gate. The new DB lookup _is_outdated_frame_read sits in the same try as index_frame_ocr.
Impact: If the pre-check lookup raises (search.db busy or locked), the worker logs 'Frame OCR indexing failed' and drops the task without running index_frame_ocr; it is not queued again until the next resume or prioritize. More importantly, the _reread_running half of I11 is untested. After a re-read's store step, the row is (true, false, 2), which is no longer outdated. Only _reread_running keeps that build phase from holding the .loft backlog, and no test would notice if this tracking were removed.
Evidence: addons/intelligence/app/indexer.py:2013-2026: `if await asyncio.to_thread(_is_outdated_frame_read, task.file_id): self._reread_running.add(...)` inside the same try/except as `index_frame_ocr`. indexer.py:2171-2178 subtracts _reread_running. tests/test_spec_addon_122_loft_fetch_gate.py covers only a queued re-read (`_queue_native_frame_task` with priority BACKLOG); no test has a re-read running or past its store step while a .loft is enqueued.
Repro: Mutation: delete `self._reread_running.add(task.file_id)` at indexer.py:2017. No test in the diff exercises a running re-read against the loft gate, so the mutant is expected to survive (not run).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name _frame_ocr_worker in the touch points. Move the _is_outdated_frame_read lookup into its own try so that a failed lookup still runs the task. Add a test where a re-read is processing, including after its store step, while a backlog .loft is enqueued.

</details>

### claude-read:R5 — bucket B, LOW, open

Claim: reindex_file raises a queued re-read to 100 only in the branch where every requested task is already queued. A request that names frame_ocr together with a fresh task, or with clip, answers 'accepted' and leaves the queued re-read at -10.
Impact: A multi-task reindex from the API or the failed-jobs modal does not move the re-read ahead of the backlog, so the video waits behind the whole re-read backlog, which can take days. The UI's per-task Regenerate sends one task, so the common path is fine.
Evidence: addons/intelligence/app/routers/files.py:1072-1083 computes raise_reread; it is used only at :1106-1108 inside `if fresh == [] and not rescan and not loft_updates and not loft_running`. For a request {tasks:[frame_ocr, text]} with text fresh, the code falls through to the flag reset and does not raise or reset frame_ocr (it is in already_queued).
Repro: not_reproduced (reasoned from code: outdated video with a queued -10 frame task; POST reindex {tasks:["frame_ocr","text"]} → accepted, frame task stays at -10)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Call manager.raise_task_priority whenever raise_reread is true, not only in the short-circuit branch.

</details>

### claude-read:R3 — bucket B, INFO, open

Claim: frame_ocr.py adds `_ReadResult.frame_gap`, written on every decoded frame. No code in the addon reads it, and no spec item or touch point describes it.
Impact: Dead state with a docstring ('a key-frame read's GOP') that suggests a behaviour nobody implements. A later reader may assume the 3-second gap or the key-frame path depends on it.
Evidence: Grep for frame_gap in addons/intelligence: only addons/intelligence/app/workers/frame_ocr.py:126 (field) and :404 (assignment); no reader.
Repro: Mutation: remove the field and line 404. Nothing references it, so the mutant is expected to survive (not run).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the frame_gap field and its assignment at frame_ocr.py:403-404.

</details>

### claude-read:R4 — bucket B, INFO, open

Claim: The shared helper _get_indexed_file_or_404 now returns frame_ocr_read and frame_ocr_rule. This reaches callers outside the planned files.py endpoints: scenes.py:87, which the touch points list as read only, and the image routes through files.py:1719.
Impact: No behaviour change was observed: the callers read named keys. It is an unlisted reach of a helper used by about 14 call sites.
Evidence: addons/intelligence/app/routers/files.py:88-89 adds the keys; callers at routers/scenes.py:87 and files.py:229,282,341,585,627,775,1377,1513,1671,1719,1892,1929.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: No tests were run; mutation outcomes are reasoned, not executed.
- claude-read: The real RapidOCR path (_detect_boxes/_recognise_boxes) was not exercised, so I2 equality with engine(image) is unchecked.
- claude-read: app/main.py was not read, so the status endpoint's pending.total and indexed.frame_ocr wiring is unverified.
- claude-read: app/workers/loft_media.py and the full reindex_file preamble (before line 990) were not read.
- claude-read: The test files were reviewed only through the diff hunks in the prompt; except for part of ocr_fixtures.py, they were not opened.
- claude-read: The SQLite version in the production container (relevant to the IN-clause size) was not checked.
- claude-verify: I did not run any tests. The tools available to me are read-only.
- claude-verify: I did not check whether any test covers a running or post-store re-read against the .loft gate (part of R2).
- claude-verify: I did not count the test files that depend on build_search_db or LoftWorld (part of R1).
- claude-verify: I did not check whether the task dropped after a lookup exception is re-collected by _collect_incomplete on restart.

TOTAL: 5 findings
