# Triage: r3

## Trajectory

This run:
- claude-read: Yes: the r2 round repeats a branch that the round before it added, so the design is being patched. The r1 round wrapped the frame OCR worker's DB-backed 'is this frame task a re-read?' lookup (_is_outdated_frame_read) in its own try/except. The r2 round adds the same kind of guard on the same lookup at its other call site, the .loft gate (_native_frame_busy calling _outdated_frame_ids), and fails closed there. The prediction is still evaluated in several places and each failure path gets its own guard; nothing was restructured. Apart from that guard, r2 added tests only: the 8-bit threshold test, the failed-gate-lookup test and the no-frame re-read case. It removed nothing. The r1 round had removed state (_ReadResult.frame_gap) and the run.sh filter. The r2 docs commit 53c41b7e0 was not shown and was not assessed.

Earlier runs:
- r2 / claude-read: The r1 fix round adds branches in the same places the first round added state and predictions. It does not restructure them. Re-read tracking: round 1 added the _is_outdated_frame_read lookup and the _reread_running state; r1 wraps that lookup in a second try/except branch. Reindex raise: round 1 added the raise_reread prediction and used it in the all-queued short-circuit; r1 adds a second call site after the fresh-task enqueue. The re-read tracking is therefore being patched: the same DB-backed prediction ('is this frame task a re-read?') is evaluated in several places, and each failure path gets its own guard. The unguarded copy in _native_frame_busy is R1. r1 also removed state: _ReadResult.frame_gap and its assignment are deleted. In frame_ocr.py it fixed segment continuation with one condition (`open_segment is None`), not a new state. run.sh lost a filter and gained an explicit exit-status record.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/database.py — partial: Lines 1245-1304: the whole _migrate_frame_page_ocr_columns function containing the changed hunk.
- addons/intelligence/app/indexer.py — partial: Lines 55-69, 160-209, 296-307, 480-579, 915-1154, 1330-1399, 1489-1513 and 1998-2195: every changed hunk with its enclosing function.
- addons/intelligence/app/models.py — partial: Lines 95-114: the changed column and its neighbours.
- addons/intelligence/app/routers/files.py — partial: Lines 60-94 (_get_indexed_file_or_404), 1000-1199 (reindex_file from layer 2b on) and 1262-1291 (get_index_details status): every changed hunk; import line 20 seen via grep.
- addons/intelligence/app/workers/frame_ocr.py — full: Lines 1-793, the whole file.
- addons/intelligence/app/workers/frame_scan.py — partial: Lines 1-35: the changed docstring and its imports; the docstring is the only change.
- addons/intelligence/app/workers/ocr.py — partial: Lines 95-239: run_engine and every new function (all changed hunks).
- scripts/dev/frame_ocr_bench/i2_check.py — full: Whole file opened.
- scripts/dev/frame_ocr_bench/measure.py — full: Whole file opened.
- scripts/dev/frame_ocr_bench/reference.py — full: Whole file opened.
- scripts/dev/frame_ocr_bench/run.sh — full: Whole file opened.

Test files:
- addons/intelligence/tests/frame_box_doubles.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/loft_media_world.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/ocr_fixtures.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/test_frame_ocr_read_threshold.py — full: Whole file opened (lines 1-131).
- addons/intelligence/tests/test_frame_ocr_worker_reread.py — not_read: Not opened; seen only in the prompt's diff, including the r2 fix hunk.
- addons/intelligence/tests/test_frame_page_ocr_readers.py — partial: Opened lines 30-65 (_encode); the rest seen only in the prompt's diff.
- addons/intelligence/tests/test_picture_lines_frames.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/test_reindex_endpoint.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_outdated.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_reread.py — not_read: Not opened; seen only in the prompt's diff, including the r2 fix hunk.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_reread_text.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/test_spec_addon_122_frame_ocr_selection.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/test_spec_addon_122_loft_fetch_gate.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/test_spec_addon_122_loft_read_rule.py — not_read: Not opened; seen only in the prompt's diff.
- addons/intelligence/tests/test_spec_addon_123_frame_box_reuse.py — not_read: Not opened; seen only in the prompt's diff.

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The new 8-bit test only bounds READ_HASH_BITS from above. No test fixture has a change of 1-7 dHash bits that must not be read, so lowering the threshold below 8 passes the suite.
Impact: I1 says a later frame is read 'only when' its hash differs by at least 8 bits. If the threshold dropped to, say, 4, the reader would read noise-level changes (compression flicker, a blinking cursor) at every 3-second gap. It would stay silent in CI and the engine time per video hour would grow beyond the 15-minute gate that the bench measures only on the production host.
Evidence: tests/test_frame_ocr_read_threshold.py:121 asserts the clip's change is exactly 8 bits and :126 asserts it is read. That kills READ_HASH_BITS 9..16 and the `<` to `<=` mutant at frame_ocr.py:405. The other selection fixtures are static between changes (about 0 bits): test_frame_page_ocr_readers.py:37-65 _encode switches colour and moves the block once at 6 s, _encode_steady_text moves a block by about 60 px per second, test_spec_addon_122_frame_ocr_selection.py flips a full ramp, and frame_box_doubles.py flips a band. None has a sub-8-bit change between candidate frames at least 3 s apart, so the exact engine-call counts (e.g. test_frame_page_ocr_readers.py `engine.calls == [(320, 240), (320, 240)]`) hold for any threshold from 1 to 8.
Repro: Mutation (reasoned, not run): frame_ocr.py:55 `READ_HASH_BITS = 4`. The expected outcome is that it survives every frame-OCR test.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a clip whose change, at least 3 s after the first frame, moves the reader's dHash by 7 bits (assert the distance as the 8-bit test does), and assert that only the first frame is read.

</details>

## Not verified

- claude-read: No tests or mutants were run; all mutation outcomes are reasoned.
- claude-read: The diff of fix commit 53c41b7e0 (docs only, per its message) was not shown in the record and was not inspected.
- claude-read: RapidOCR internals were not inspected, so whether _detect_boxes reproduces engine(image)'s box order (I2) is unverified.
- claude-read: app/main.py and app/workers/loft_media.py were not read.
- claude-read: Apart from test_frame_ocr_read_threshold.py and part of test_frame_page_ocr_readers.py, the test files were seen only through the prompt's diff.
- claude-read: The exact SQLite version in the production image was inferred from the python:3.12-slim base, not checked.
- claude-verify: I did not run pytest or ffmpeg; the mutant results come from reading the code, not from runs.
- claude-verify: Whether H.264 keyframe-reconstruction noise in the static fixtures flips any dHash bit (relevant only to a threshold of 1).
- claude-verify: The other invariants (I2-I11) were outside the finding and were not reviewed.

TOTAL: 1 findings
