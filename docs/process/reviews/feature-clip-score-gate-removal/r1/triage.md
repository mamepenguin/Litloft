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

## Findings

A: 0
B: 1
C: 0

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff adds addons/intelligence/tests/test_search_clip_score_gates.py, a file the touch-point list does not name; the list's only edited test file is test_search_knn_partition.py, and it names test_search.py and test_search_file_kind_filter.py as read-only.
Impact: No user-visible behaviour is affected. The file holds the checks for I1-I9 except I10, and it imports fixtures and helpers from test_search_knn_partition.py, so an unlisted file now depends on helpers in a listed one. No invariant is missing because of it: the file only writes tests and adds no production path.
Evidence: The diff creates addons/intelligence/tests/test_search_clip_score_gates.py (367 lines). Its imports at lines 14-29 take _far_scene_rows, _far_thumbnails_of_other_files, _rows, _use_search_config, clip_index and others from tests.test_search_knn_partition. Spec item 7 says removed tests are 'replaced by tests of the opposite' under the heading for test_search_knn_partition.py, while the diff only deletes them from that file and puts the replacements in the new file.
Repro: Compare the file list of the diff with the spec's '## Touch points': every other path in the diff is listed or is an implicit touch point (spec, INDEX.md, review records); this one is not.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the new test file to the touch-point list, or record it as a revision in invariants.md.

</details>

## Not verified

- claude-read: I ran nothing: no test run, no mutation, and no observed behaviour against a real index.
- claude-read: The checked-out addons/intelligence tree was read as the state of submodule commit 9b58ec5c4; I could not confirm its HEAD with the available tools, only that its files match the diff where I read them.
- claude-read: benchmark.py and decisions.md, including I10 and the measured numbers, were not read or checked.
- claude-read: I searched the MCP tools only for mentions of semantic_search and did not read how they call GET /search or which mode they send.
- claude-read: Frontend ranking through computeHybridScore was not read, so the spec's statement that CLIP-only hits usually rank low is not checked.
- claude-read: The _combine_scores_cosine and _combine_scores_rrf code that produces match_types was not read.
- claude-verify: Whether the addons/intelligence working tree is exactly the tree pinned by the gitlink at 5407999f0; git cannot be run with the available tools, so the addon files were read as checked out.
- claude-verify: The actual diff of the addon, including the 367-line count and the prior presence of the deleted tests; the deletion was inferred from their absence in the current file.
- claude-verify: No test suite was run, so no test outcome is confirmed.
- claude-verify: benchmark.py and invariant I10 were not read.
- claude-verify: The docs edits in docs/user-guide/search.md and docs/addons/intelligence.md, and the comment on score_gap_threshold in config.py, were not checked.
- claude-verify: search.py:614-694 (the KNN part of _vector_search_clip) was not read line by line.

TOTAL: 1 findings
