# Triage: r1

## Warnings

- ran_in_app is yes but the R-5 commit is unknown (no usable at: in docs/process/reviews/fix-refine-alignment-failure/decisions.md); run R-5 again if this change alters what a user sees

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
- addons/intelligence/app/extraction.py — full: I read the changed hunk with its enclosing function store_original_if_absent and snapshot_transcript (lines 150-239), and grepped its callers.
- addons/intelligence/app/main.py — full: I read the changed hunk and its surrounding logging setup (lines 45-69).
- addons/intelligence/app/workers/aligner.py — full: I read the changed table and _normalise_lang, plus its callers _load_align_model_detailed and align_segment (lines 96-295), and the table in the diff.
- addons/intelligence/app/workers/refine.py — partial: I read lines 225-500 (realign_words_for_chunk, rechunk_from_words) and lines 780-1039 (_run_refine_job). The module docstring and refine_chunks docstring hunks I read only in the diff, not the enclosing refine_chunks body.

Test files:
- addons/intelligence/tests/refine_align_rig.py — full: New file; the whole content is in the diff.
- addons/intelligence/tests/test_refine_speaker_id_clearing.py — partial: Only the changed hunk around line 193, in the diff.
- addons/intelligence/tests/test_spec_addon_068_protection_redo.py — partial: Only the changed hunk around line 132, in the diff.
- addons/intelligence/tests/test_spec_addon_127_language_codes.py — full: New file; the whole content is in the diff.
- addons/intelligence/tests/test_spec_addon_128_refine_alignment_failure.py — full: New file; the whole content is in the diff.

## Needs a human

### unspecified_behavior

Note: The pdfminer logger is raised to ERROR process-wide (main.py:63). Nothing in the spec covers it.; _normalise_lang now also splits on `_`. Spec item 5 covers this, but every caller of the aligner is affected, including followup._realign_utterance through align_span (also stated in the spec).
- claude-read: The pdfminer logger is raised to ERROR process-wide (main.py:63). Nothing in the spec covers it.
- claude-read: _normalise_lang now also splits on `_`. Spec item 5 covers this, but every caller of the aligner is affected, including followup._realign_utterance through align_span (also stated in the spec).
- claude-verify: The pdfminer logger is raised to ERROR in addons/intelligence/app/main.py:63. Nothing in the spec covers it.
- claude-verify: refined_count in intelligence.refine.completed now counts persisted chunks rather than LLM-refined chunks. The spec does not state this.

### unspecified_behavior

Note: The pdfminer logger is raised to ERROR in addons/intelligence/app/main.py:63. Nothing in the spec covers it.; refined_count in intelligence.refine.completed now counts persisted chunks rather than LLM-refined chunks. The spec does not state this.
- claude-read: The pdfminer logger is raised to ERROR process-wide (main.py:63). Nothing in the spec covers it.
- claude-read: _normalise_lang now also splits on `_`. Spec item 5 covers this, but every caller of the aligner is affected, including followup._realign_utterance through align_span (also stated in the spec).
- claude-verify: The pdfminer logger is raised to ERROR in addons/intelligence/app/main.py:63. Nothing in the spec covers it.
- claude-verify: refined_count in intelligence.refine.completed now counts persisted chunks rather than LLM-refined chunks. The spec does not state this.

## Findings

A: 0
B: 4
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The submodule bump changes the intelligence addon's process-wide logging configuration in addons/intelligence/app/main.py. It raises the `pdfminer` logger to ERROR, which is unrelated to Refine or alignment and is not in the touch-point list.
Impact: Every WARNING from pdfminer is now dropped for every PDF the addon extracts, not only the per-glyph FontBBox noise the comment names. If pdfminer reports a PDF problem only at WARNING level (degraded or partial text on a page that does not raise), it no longer appears in the addon log. This touches PDF extraction (the area of SPEC-ADDON-122), which this spec does not cover, and no invariant or test of this change looks at it.
Evidence: addons/intelligence/app/main.py:61-63 adds `logging.getLogger("pdfminer").setLevel(logging.ERROR)` straight after `logging.basicConfig`. The spec's Touch points list only aligner.py, refine.py, tests/, docs/addons/intelligence.md and the submodule pointer. No test in the change covers this line.
Repro: not_reproduced (reading only). Check: run PDF extraction on a PDF whose font lacks a FontBBox, or that makes pdfminer warn; before the bump the addon log shows pdfminer WARNING lines, after it shows none.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Move the pdfminer log-level change into its own change with its own spec or touch point, or add main.py (logging) to this spec's touch points with a note on the scope.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The change edits the shared helper `extraction.store_original_if_absent` in addons/intelligence/app/extraction.py, adding a keyword-only `snapshot` parameter. This file and function are not in the touch-point list.
Impact: There is no behaviour change for the existing callers in routers/files.py:381 and :654, because they omit the argument and `snapshot or snapshot_transcript(...)` falls back as before. The kept-original API is shared by correction, redo and refine, though, and this reach into it is not recorded where the spec says the change goes. A non-empty `(str, str)` tuple is always truthy, so the `or` fallback cannot misfire for the refine caller.
Evidence: addons/intelligence/app/extraction.py:192-219 adds `snapshot: tuple[str, str] | None = None` and uses `row.chunks_json, row.words_json = snapshot or snapshot_transcript(session, file_id)`. The callers are refine.py:927 (new kwarg) and routers/files.py:381 and :654 (unchanged).
Repro: not_reproduced (reading only).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `addons/intelligence/app/extraction.py: store_original_if_absent (optional pre-read snapshot)` to the touch points.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: The change redefines the counts in the `intelligence.refine.completed` WebSocket event payload. `refined_count` now counts applied chunks, and `skipped_count` now includes chunks whose alignment failed. The touch-point list does not name this event, although the process asks touch points to list the events a change alters.
Impact: Anything that reads `refined_count` or `skipped_count` now sees different numbers for the same run. I found no consumer outside the addon's own tests (grep for refine.completed outside docs only hits refine.py and tests), so nothing a user can see changes. Spec §8 does describe the new meaning.
Evidence: addons/intelligence/app/workers/refine.py:872 no longer adds result.refined_count. Lines 948-949 add `len(applied_ids)` and `len(refined_window) - len(applied_ids)`. The payload is emitted at 1002-1014. docs/process/spec-and-design.md:41-43 says touch points include the 'endpoints and events it adds or changes'.
Repro: not_reproduced. tests/test_spec_addon_128_refine_alignment_failure.py asserts the new counts, for example refined_count 0 and skipped_count 3 in the failure cases.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `intelligence.refine.completed` (meaning of refined_count/skipped_count) to the touch points.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: refine.py edits the module docstring and the `refine_chunks` docstring. These are prose in functions outside the listed refine.py touch points (`_run_refine_job`, `realign_words_for_chunk`, `rechunk_from_words`).
Impact: None for users. The new text matches the code: a window is applied only when the LLM answers for every chunk, and refine_chunks only mutates the in-memory snapshots. It would not lead a reader to a wrong code change.
Evidence: addons/intelligence/app/workers/refine.py module docstring (lines ~3-7) and the refine_chunks docstring (~145-151), per the diff hunks.
Repro: not_reproduced (prose only).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Whether the submodule range 3096c40..f462493 contains commits other than this fix (I cannot run git log). The pdfminer change may come from an unrelated addon commit swept in by the pointer bump.
- claude-read: Whether any frontend or core consumer reads refined_count or skipped_count under a name my grep did not match.
- claude-read: The body of refine_chunks beyond its docstring hunk.
- claude-read: I did not run the tests.
- claude-verify: I could not run git, so I did not see the actual diff hunks. Whether the module docstring of refine.py changed is unverified.
- claude-verify: I did not check the full tests directory for coverage of the new snapshot keyword or the event counts.
- claude-verify: I did not confirm that the submodule checkout in the worktree matches the bumped pointer at dfc99c7.

TOTAL: 4 findings
