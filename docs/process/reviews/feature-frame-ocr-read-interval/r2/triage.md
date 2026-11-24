# Triage: r2

## Trajectory

This run:
- claude-read: The r1 fix round adds branches in the same places the first round added state and predictions. It does not restructure them. Re-read tracking: round 1 added the _is_outdated_frame_read lookup and the _reread_running state; r1 wraps that lookup in a second try/except branch. Reindex raise: round 1 added the raise_reread prediction and used it in the all-queued short-circuit; r1 adds a second call site after the fresh-task enqueue. The re-read tracking is therefore being patched: the same DB-backed prediction ('is this frame task a re-read?') is evaluated in several places, and each failure path gets its own guard. The unguarded copy in _native_frame_busy is R1. r1 also removed state: _ReadResult.frame_gap and its assignment are deleted. In frame_ocr.py it fixed segment continuation with one condition (`open_segment is None`), not a new state. run.sh lost a filter and gained an explicit exit-status record.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Read coverage

Product files:
- addons/intelligence/app/database.py — partial: Lines 1245-1304: the whole _migrate_frame_page_ocr_columns function containing the changed hunk.
- addons/intelligence/app/indexer.py — partial: Lines 160-209, 470-579, 915-1154, 1340-1399, 1460-1519, 1990-2184 and 2448-2473: every changed hunk with its enclosing function; the tail of _native_frame_busy was seen in the diff.
- addons/intelligence/app/models.py — partial: Lines 95-114: the changed column and its neighbours.
- addons/intelligence/app/routers/files.py — partial: Lines 60-104, 960-1199 and 1255-1294: every changed hunk with its enclosing function (reindex_file from its lookup onwards).
- addons/intelligence/app/workers/frame_ocr.py — full: Lines 1-793, the whole file.
- addons/intelligence/app/workers/frame_scan.py — partial: Lines 1-35: the changed docstring and its imports; the only change is the docstring.
- addons/intelligence/app/workers/ocr.py — partial: Lines 95-239: run_engine and every new function (all changed hunks).
- scripts/dev/frame_ocr_bench/i2_check.py — full: Whole new file in the diff.
- scripts/dev/frame_ocr_bench/measure.py — full: Whole new file in the diff.
- scripts/dev/frame_ocr_bench/reference.py — full: Whole new file in the diff.
- scripts/dev/frame_ocr_bench/run.sh — full: Whole new file in the diff, plus the r1 fix diff.

Test files:
- addons/intelligence/tests/frame_box_doubles.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.
- addons/intelligence/tests/loft_media_world.py — not_read: Not opened; reviewed through the diff hunk only.
- addons/intelligence/tests/ocr_fixtures.py — not_read: Not opened; reviewed through the diff hunks only.
- addons/intelligence/tests/test_frame_ocr_worker_reread.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.
- addons/intelligence/tests/test_frame_page_ocr_readers.py — partial: Opened lines 30-65 (_encode); the rest seen through the diff hunks.
- addons/intelligence/tests/test_picture_lines_frames.py — not_read: Not opened; reviewed through the diff hunk only.
- addons/intelligence/tests/test_reindex_endpoint.py — not_read: Not opened; reviewed through the diff hunks only.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_outdated.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_reread.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_reread_text.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_selection.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_loft_fetch_gate.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_122_loft_read_rule.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.
- addons/intelligence/tests/test_spec_addon_123_frame_box_reuse.py — not_read: Not opened; reviewed through the full new-file diff in the prompt.

## Needs a human

### unspecified_behavior

Note: The spec does not say what should happen to a backlog `.loft` task taken from the queue when the outdated-read lookup fails. The current behaviour is to drop it with an error log (R1).
- claude-verify: The spec does not say what should happen to a backlog `.loft` task taken from the queue when the outdated-read lookup fails. The current behaviour is to drop it with an error log (R1).

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: _native_frame_busy now runs a search.db query (_outdated_frame_ids via asyncio.to_thread), so an exception from that query propagates out of the .loft worker loop after the backlog task was already taken from the queue, and that task is dropped.
Impact: A backlog .loft fetch can be lost if the read fails when the gate is checked, for example a transient SQLite error during the multi-day re-read backlog. It is not queued again until the next resume_incomplete. Before this change the gate was pure in-memory state and could not raise. r1 fixed this same class of fault for the frame OCR worker's lookup (R2) but not for this gate.
Evidence: indexer.py:2094-2106: the task is taken by _collect_batch and then `if task.priority == -10 and await self._native_frame_busy()` runs. indexer.py:2179-2186: `rereads = await asyncio.to_thread(_outdated_frame_ids, frame_ids)` with no try. indexer.py:2151-2155: the outer `except Exception` only logs 'Loft media worker error' and sleeps; the task is neither re-enqueued nor deferred. indexer.py:182-200: _outdated_frame_ids opens get_search_db_read and queries IndexedFile.
Repro: not_reproduced. Reasoned mutation-style scenario: monkeypatch app.indexer._outdated_frame_ids to raise, queue one native first-read FRAME_OCR id and one BACKLOG loft_media task, then start _loft_media_worker. The loft task is consumed and never fetched or re-queued.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Wrap the _outdated_frame_ids call in _native_frame_busy in try/except and treat a failure as busy (return True), so the task is re-enqueued by the existing branch.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: No test distinguishes the frame reader's 8-bit hash threshold from the old 16-bit one, so restoring READ_HASH_BITS to 16 (or anything between 9 and about 100) would pass the suite.
Impact: I1's '8 bits' half could regress silently, and with it most of the recall gain the spec measured. Every selection test uses picture changes that move the dHash far past both thresholds: ramp flips, a large rectangle move and a colour switch. Identical frames stay below any threshold of 1 or more.
Evidence: tests/test_spec_addon_122_frame_ocr_selection.py docstring: 'every flip moves the difference hash far past both thresholds and only the gap decides'. tests/frame_box_doubles.py: FLIP_BAND ramp reversal on every state. tests/test_frame_page_ocr_readers.py:37-65: _encode moves a 40%-wide white rectangle and switches red to blue at 6 s. Grep for READ_HASH_BITS or 'bits' in frame tests finds only the frame-scan test (16 bits).
Repro: Mutation (reasoned, not run): frame_ocr.py:55 `READ_HASH_BITS = 16`. The expected outcome is that the mutant survives every frame-OCR test.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a clip whose consecutive read candidates differ by between 8 and 15 dHash bits (assert the difference in the test, as test_spec_addon_111_frame_scan_task.py:218-219 does) and assert that the frame is read.

</details>

## Not verified

- claude-read: No tests were run; the mutation outcomes are reasoned.
- claude-read: The RapidOCR source was not inspected, so whether _detect_boxes reproduces engine(image)'s box sorting (I2) is unverified.
- claude-read: Most test files were reviewed only through the diff in the prompt, not opened.
- claude-read: app/workers/loft_media.py was not read.
- claude-verify: I did not run the test suite or any mutant. Both records come from reading the code.
- claude-verify: I did not compute how many dhash bits the ramp flips change, so the exact upper bound on surviving thresholds is unknown.
- claude-verify: I did not check whether a dropped `.loft` backlog task is re-queued by the next startup resume pass.
- claude-verify: I did not check how likely `get_search_db_read` is to raise in normal use.

TOTAL: 2 findings
