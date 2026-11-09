# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-verify:V1

## Needs a human

### open_c (claude-verify:V1)

Question: Invariant I1 says an `accepted` reindex answer is a 202. The route actually answers `accepted` with HTTP 200, because it returns ReindexResponse and the decorator sets no status_code. Only `already_queued` is a 202. The code is not wrong; the invariant's wording is.
Impact: There is no runtime defect. The spec text does not match the route's real status code, which could mislead a later reader or a test author. The SPEC-ADDON-085 tests assert 200 for `accepted`, which matches the code and differs from the invariant text.
Evidence: addons/intelligence/app/routers/files.py:877 `@router.post("/files/{file_id}/reindex")` sets no status_code. files.py:1030-1038 returns JSONResponse(status_code=202) only for already_queued. files.py:1075 returns ReindexResponse, which is 200. tests/test_spec_addon_085_storyboard_retry.py:170-171 asserts 200 together with accepted(...).
Note: Invariant I1 says an `accepted` reindex answer is a 202. The route actually answers `accepted` with HTTP 200, because it returns ReindexResponse and the decorator sets no status_code. Only `already_queued` is a 202. The code is not wrong; the invariant's wording is.

## Findings

A: 0
B: 0
C: 1

### claude-verify:V1 — bucket C, INFO, open

Claim: Invariant I1 says an `accepted` reindex answer is a 202. The route actually answers `accepted` with HTTP 200, because it returns ReindexResponse and the decorator sets no status_code. Only `already_queued` is a 202. The code is not wrong; the invariant's wording is.
Impact: There is no runtime defect. The spec text does not match the route's real status code, which could mislead a later reader or a test author. The SPEC-ADDON-085 tests assert 200 for `accepted`, which matches the code and differs from the invariant text.
Evidence: addons/intelligence/app/routers/files.py:877 `@router.post("/files/{file_id}/reindex")` sets no status_code. files.py:1030-1038 returns JSONResponse(status_code=202) only for already_queued. files.py:1075 returns ReindexResponse, which is 200. tests/test_spec_addon_085_storyboard_retry.py:170-171 asserts 200 together with accepted(...).
Repro: Read files.py:877 and 1075 and test line 170. A POST with {"tasks":["clip"]} to a queued-free file is answered with 200 and status `accepted`.
Introduced: pre-existing
Reviewer bucket: C | Author bucket: 

## Not verified

- claude-read: Whether addon commit 4f7e09869c70575e5d0383b9432fd71bb0f74fc4 is merged on the addon's origin/main, as the CLAUDE.md addon-first order requires. I could not resolve submodule refs without git.
- claude-read: I did not run the test suite.
- claude-read: I did not read the full addon diff beyond the hunks shown, for example other files in the addon commit range 2984ff5..4f7e098, if any exist outside the shown diff.
- claude-verify: I could not run the test suite (no shell available), so I did not confirm that the tests pass at this commit.
- claude-verify: I did not confirm that the addon gitlink in the core repo points to the addon commit that contains these changes.
- claude-verify: I did not review the docs/addons/intelligence.md sentence or the docs/specs/INDEX.md row.
- claude-verify: I did not trace every caller of `_index_clip_loft` (resume, reconciliation, startup recovery) to confirm they all reach the guard.

TOTAL: 1 findings
