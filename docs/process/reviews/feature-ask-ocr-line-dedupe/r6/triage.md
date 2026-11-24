# Triage: r6

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
- addons/intelligence/app/exact_search.py — partial: Read lines 75-184 (_frame_segments, _matching_lines, _text_hits, _section_titles, start of _transcript_hits), which contain every changed hunk with its enclosing function; the import hunk was read in the diff.
- addons/intelligence/app/file_find.py — partial: Read lines 95-244 (_frame_occurrences whole, _overlapped_quads, _text_occurrences), which contain the changed function; the import and removal hunks were read in the diff.
- addons/intelligence/app/frame_text_lines.py — full: Read the whole new module.
- addons/intelligence/app/rag/file_question.py — partial: Read lines 360-469 of load_material, which hold the changed hunk; _filter_frame_text and the import were read in the diff.

Test files:
- addons/intelligence/tests/frame_repeat_doubles.py — full: Read the whole new file in the diff.
- addons/intelligence/tests/test_spec_addon_136_frame_hit_lines.py — partial: Read lines 1-120 (fixtures and _segment) and 570-613 (the changed test).
- addons/intelligence/tests/test_spec_addon_171_file_ask.py — full: Read the whole new file in the diff.
- addons/intelligence/tests/test_spec_addon_171_merge_chunks.py — full: Read the whole new file in the diff.
- addons/intelligence/tests/test_spec_addon_172_find.py — full: Read the whole new file in the diff.
- addons/intelligence/tests/test_spec_addon_173_exact_search.py — full: Read the whole new file in the diff.

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The diff edits the acceptance test of another spec, addons/intelligence/tests/test_spec_addon_136_frame_hit_lines.py (SPEC-ADDON-136 failure 2), which the touch-point list does not name: it lists `addons/intelligence/tests/` only as "acceptance tests for this spec", and SPEC-ADDON-136 is not among the Revises entries.
Impact: No user-facing defect. The edit moves the second segment from 30–40 s to 90–100 s so that its line 'warehouse moved to Osaka' is no longer a repeat of the 10–20 s segment (it is 70 s later, outside the 60 s window). Under the new rule, the old fixture would have dropped the 30 s find row, and the test would then fail with a KeyError on rows[30.0]. The test still checks that a row whose lines JSON has another shape gets no boxes and no frame_size. However, a reader of the touch points would not expect an existing spec's test to change, and the failure-2 path for a segment that falls inside the window is no longer tested by the SPEC-ADDON-136 test.
Evidence: addons/intelligence/tests/test_spec_addon_136_frame_hit_lines.py:599-610: segment 0 at 10–20 s holds LINES (including 'warehouse moved to Osaka'); the diff changes segment 1 from (30.0, 40.0) to (90.0, 100.0) and the asserts from rows[30.0] to rows[90.0]. app/frame_text_lines.py:103-107 marks a line repeated when start − latest_end ≤ 60, and 30 − 20 = 10 ≤ 60, so at the old times the occurrence would be skipped at app/file_find.py:135-137.
Repro: not_reproduced (read only). Mutation in thought: revert the test to 30.0/40.0; _frame_occurrences skips the 30 s occurrence because 'warehouse moved to Osaka' is in segment.repeated, so rows has no 30.0 key and the assert raises KeyError.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name tests/test_spec_addon_136_frame_hit_lines.py in the touch points as an existing test whose fixture moves outside the repeat window, or keep the 30 s fixture with a second-segment line that is not in the first segment.

</details>

## Not verified

- claude-read: I did not run any test; the KeyError outcome of reverting the 136 fixture is reasoned, not executed.
- claude-read: I did not read FrameLineReader in app/search.py to confirm the types of its segment keys.
- claude-read: I did not read mcp-server sources beyond confirming they call the HTTP route.
- claude-read: I did not check whether files outside the shown diff in the addon commit (for example addons/intelligence/.flash/spec.md) are part of the submodule commit.
- claude-verify: I did not run the tests and could not see the git diff, so the old values (30.0, 40.0) are taken from the finding.
- claude-verify: I did not check whether any other non-171/172/173 test files changed their behaviour without being edited.

TOTAL: 1 findings
