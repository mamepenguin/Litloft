# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/intelligence/app/database.py — full: Read the whole enclosing function `_migrate_frame_page_ocr_columns` (lines 1250-1312) containing the changed hunk.
- addons/intelligence/app/indexer.py — full: Read all of `_purge_file` (lines 3034-3179), which contains the changed hunk, and grepped its callers.
- addons/intelligence/app/models.py — full: Read lines 850-900, covering VideoFrameText and the new VideoFrameLines class.
- addons/intelligence/app/workers/frame_ocr.py — full: Read the whole file (lines 1-846).

Test files:
- addons/intelligence/tests/frame_line_doubles.py — full: New file; the diff shows its whole content.
- addons/intelligence/tests/test_frame_ocr_worker_reread.py — partial: Only the diff hunk around line 138.
- addons/intelligence/tests/test_spec_addon_133_frame_ocr_outdated.py — partial: Only the diff hunks (lines ~189-380).
- addons/intelligence/tests/test_spec_addon_133_frame_ocr_reread.py — partial: Only the diff hunks (lines ~193-307).
- addons/intelligence/tests/test_spec_addon_133_frame_ocr_reread_text.py — partial: Only the diff hunks (docstring and lines ~101-271).
- addons/intelligence/tests/test_spec_addon_133_loft_read_rule.py — partial: Only the diff hunks (docstring and lines 25-43).
- addons/intelligence/tests/test_spec_addon_134_frame_lines_kept.py — full: New file; the diff shows its whole content.
- addons/intelligence/tests/test_spec_addon_134_frame_lines_schema.py — full: New file; the diff shows its whole content.
- addons/intelligence/tests/test_spec_addon_134_frame_lines_store.py — full: New file; the diff shows its whole content.

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, INFO, open

Claim: The diff adds a new module-level helper `_normalised_quad` in frame_ocr.py, which the touch-point list does not name; the list names only `_Segment`, `_read_video`, `_chunks_for_segments`, `_store_read`, the callers and `FRAME_OCR_RULE`.
Impact: No user impact. The helper is called only from `_read_video` when a segment opens, and it implements item 1.2/I2 (dividing by the size of `ocr_image`, clamping, rounding to 4 places, None for a size other than 8 or a non-finite value). It sits inside a touch-point file and serves a planned behaviour, so it is an unnamed sub-place, not an unplanned area.
Evidence: addons/intelligence/app/workers/frame_ocr.py:166-177 defines `_normalised_quad`; its only caller is frame_ocr.py:454-456 inside `_read_video`. The `_read_boxes` call site was also split into `ocr_image = _ocr_image(image)` (frame_ocr.py:426-427), still inside `_read_video`, so `_read_boxes` itself is unchanged as the touch points require.
Repro: not_reproduced; found by comparing the diff against the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F2 — bucket B, INFO, open

Claim: The diff renames test functions from 'rule two' to 'current rule' and rewrites module docstrings in test_spec_addon_133_frame_ocr_reread_text.py and test_spec_addon_133_loft_read_rule.py. The touch-point list allows renaming only in the three named files (outdated, reread, worker_reread). For these two files it covers only the 2→3 expectation change ('existing tests that assert a stored or kept read writes 2 now expect 3').
Impact: No user impact. Test IDs change in two files outside the explicitly listed rename scope, so a history or CI filter on the old names would no longer match. Every assertion is the same apart from the planned 2→3 change.
Evidence: tests/test_spec_addon_133_frame_ocr_reread_text.py: the module docstring at line 1, the section comment at line ~104, `test_spec_addon_133_i6_a_first_read_is_stored_under_the_current_rule` and `test_spec_addon_133_failure_a_first_read_that_ended_early_keeps_its_frames_under_the_current_rule` are renamed. In tests/test_spec_addon_133_loft_read_rule.py, the module docstring and `test_spec_addon_133_section_3_a_loft_read_is_stored_under_the_current_rule` are renamed.
Repro: not_reproduced; found by comparing the diff against the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I ran no tests. Whether the tests pass, or whether a mutation (for example dropping the `video_frame_lines` delete in `_store_read`) would be killed, was judged by reading only.
- claude-read: I did not open the modified test files on disk; for those I read only the diff hunks.
- claude-read: I did not check the content of the gitlink target commit beyond the submodule diff shown.
- claude-read: I did not verify the docs/addons/intelligence.md wording against the code.
- claude-verify: The actual diff against origin/develop (no git access), so 'newly added' and 'renamed' rest on the current file contents and prior review docs
- claude-verify: Whether `_read_boxes` filters non-finite quads before `_normalised_quad` sees them
- claude-verify: The rest of the invariants I1-I7 beyond the two findings

TOTAL: 2 findings
