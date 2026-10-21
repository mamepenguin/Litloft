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
- needs_human_record claude-read:TP-4
- unspecified_behavior
- unspecified_behavior

## Needs a human

### needs_human_record (claude-read:TP-4)

Question: The diff adds a second known-issues row ("An Ask whose answer the LLM fails to generate never finishes"). It has nothing to do with this change, and the touch points allow exactly one row, the one about personal-history trimming.
Impact: No user-facing effect. It is a docs edit outside the planned scope, about a different defect (the SSE stream never closes after the LLM fails).
Evidence: docs/developer-guide/known-issues.md:616-620. The touch points read "one row under Addons for the personal-history Ask trimming before intersecting".
Recommendation: Either add this row to the touch points or move it to its own docs change.
Note: The row exists at docs/developer-guide/known-issues.md:616-620, right after the personal-history row at :609-614 that the touch points allow. With Read/Grep only I cannot diff against origin/develop (base 750874542), so I cannot confirm that this branch added the row rather than inheriting it. The branch reflog (.git/logs/refs/heads/feature/search-knn-partition) has no commit that names this row. decisions.md:17 calls it 'a known defect from before this change (docs/developer-guide/known-issues.md)', which fits either reading. A human needs to run `git diff origin/develop...5b63f2d -- docs/developer-guide/known-issues.md`.

### unspecified_behavior

Note: GET /search/compare now drive-filters and gates its CLIP channel per drive. Spec §7 does not describe this, and no test covers it.; With a drive, the CLIP channel can run up to four KNNs (k up to 4096) plus a large IN query on search.db per search. Spec §10 does not describe this cost.
- claude-read: GET /search/compare now drive-filters and gates its CLIP channel per drive. Spec §7 does not describe this, and no test covers it.
- claude-read: With a drive, the CLIP channel can run up to four KNNs (k up to 4096) plus a large IN query on search.db per search. Spec §10 does not describe this cost.
- claude-verify: execute_search_compare with no drive (drive=None) takes the unfiltered single-KNN path. The spec does not state this for compare.
- claude-verify: _drive_thumbnail_neighbours stops after the first KNN that returns fewer rows than asked (partition exhausted), and returns [] as soon as one KNN returns nothing.

### unspecified_behavior

Note: execute_search_compare with no drive (drive=None) takes the unfiltered single-KNN path. The spec does not state this for compare.; _drive_thumbnail_neighbours stops after the first KNN that returns fewer rows than asked (partition exhausted), and returns [] as soon as one KNN returns nothing.
- claude-read: GET /search/compare now drive-filters and gates its CLIP channel per drive. Spec §7 does not describe this, and no test covers it.
- claude-read: With a drive, the CLIP channel can run up to four KNNs (k up to 4096) plus a large IN query on search.db per search. Spec §10 does not describe this cost.
- claude-verify: execute_search_compare with no drive (drive=None) takes the unfiltered single-KNN path. The spec does not state this for compare.
- claude-verify: _drive_thumbnail_neighbours stops after the first KNN that returns fewer rows than asked (partition exhausted), and returns [] as soon as one KNN returns nothing.

## Findings

A: 0
B: 4
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff edits the call site inside `search()` (it now passes `drive=drive` to `_vector_search_clip`), but the touch-point list names only `_vector_search_clip` and `coarse_retrieve` in the app code.
Impact: The hybrid search behind `GET /search`, Ask, Find and `search_files` now drive-filters the CLIP channel before its score gates. That is a behavior change on every Scene-search-off search with a drive, and the touch-point list never mentions it, so a reader planning from that list misses that `search()` changed.
Evidence: addons/intelligence/app/search.py:282 `mode=mode, include_scene_clip=include_scene_clip, drive=drive,`. The touch points list only `_vector_search_clip (the KNN query and the branch on include_scene_clip)` and `coarse_retrieve`.
Repro: Mutation: drop `drive=drive` at search.py:282. Then test_spec_addon_025_search_with_scene_off_finds_the_drives_thumbnails_behind_a_crowd_of_another_drive should fail, because the other drive's flat crowd fills the 50 candidates and the drive filter in _build_results removes them. So the edit is tested, but it is outside the planned list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `search()` (the CLIP channel submit) to the touch points.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The diff changes `execute_search_compare` so that it passes `drive=drive` to `_vector_search_clip`. The function is not in the touch-point list, and no test covers the change.
Impact: The CLIP matches and the `clip_vector` source count in `GET /search/compare` are now limited to the requested drive and to active files, and the gates now judge that filtered set. If someone later dropped this argument, compare would quietly go back to drive-agnostic gating and nothing would catch it.
Evidence: addons/intelligence/app/search.py:2478 `_vector_search_clip(clip_vector, candidates, drive=drive)`. No test references `execute_search_compare` (grep over addons/intelligence/tests finds nothing). Spec §7 still says compare uses the default `include_scene_clip=False`, "so it changes the same way", and says nothing about the drive.
Repro: Mutation: revert search.py:2478 to `_vector_search_clip(clip_vector, candidates)`. Reading the tests, none of them should fail (not run).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `execute_search_compare` to the touch points, and add a test in which another drive's crowd hides the requested drive's thumbnails from compare's `clip_vector` count.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: The diff adds a new helper, `_drive_thumbnail_neighbours`, with the constants `_CLIP_DRIVE_FETCH_MAX`/`_CLIP_DRIVE_FETCH_FACTORS` and a new `drive` parameter on `_vector_search_clip`. The helper runs up to four widening KNNs (k up to 4096) and reads `embeddings`/`indexed_files` inside the CLIP channel. The touch points describe only "the KNN query and the branch on include_scene_clip".
Impact: With a drive, the CLIP channel no longer runs a single KNN of k=rrf_candidates. It can run up to four KNNs plus an `IN` lookup of up to 4,096 ids in search.db, and the drive and active filter now runs before the gates rather than only in `_build_results`. Spec §6 still says "The drive filter after the KNN stays where it is: `_build_results`", which could lead a reader to strip the new filter from the channel as if it were redundant.
Evidence: addons/intelligence/app/search.py:565-610 (the new helper and constants) and search.py:674-675 (`if drive and not include_scene_clip: rows = _drive_thumbnail_neighbours(...)`). docs/specs/search-knn-partition.md §6 and the Touch points section.
Repro: not_reproduced (this is about planning scope). The behavior itself is exercised by test_spec_addon_025_scene_off_reaches_the_drives_thumbnails_only_within_the_4096_nearest and the I3/I9 (r5) tests.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `_drive_thumbnail_neighbours` and the `drive` parameter to the touch points. Delete the §6 sentence saying the drive filter stays only in `_build_results`, or revise it so it does not contradict the code.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The diff adds a second known-issues row ("An Ask whose answer the LLM fails to generate never finishes"). It has nothing to do with this change, and the touch points allow exactly one row, the one about personal-history trimming.
Impact: No user-facing effect. It is a docs edit outside the planned scope, about a different defect (the SSE stream never closes after the LLM fails).
Evidence: docs/developer-guide/known-issues.md:616-620. The touch points read "one row under Addons for the personal-history Ask trimming before intersecting".
Repro: not_reproduced (docs only).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either add this row to the touch points or move it to its own docs change.

</details>

## Not verified

- claude-read: I did not run any tests, so the mutation outcomes are inferred from reading the code.
- claude-read: I did not read the submodule's git history to confirm that the diff shown matches commit 5b63f2d exactly.
- claude-read: I did not check whether other callers of _vector_search_clip exist outside addons/intelligence/app.
- claude-read: I did not read the .claude/rules files in full.
- claude-verify: Whether the 'An Ask whose answer the LLM fails to generate never finishes' known-issues row was added by this branch or already on origin/develop (no git diff available).
- claude-verify: I did not read the new SPEC-ADDON-025/026 tests and did not run any test.
- claude-verify: I did not check coarse_retrieve or the INDEX.md change.

TOTAL: 4 findings
