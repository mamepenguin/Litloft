# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-verify:V1 is bucket A or BLOCKER

## Findings

A: 1
B: 0
C: 0

### claude-verify:V1 — bucket A, MEDIUM, open

Claim: The Visual Index gate in the new router fails OPEN when the drive policy cannot be read. `_visual_index_open` calls `is_feature_enabled(drive, "video_visual_index")` without `default_on_failure=False`. The spec requires the fail-closed check the Visual Index routes use.
Impact: Suppose the core policy endpoint is unreachable, or answers something other than 200 or 404, or returns non-JSON. Then `/search/exact` includes scene segments, and `/search/scenes` returns ranked scenes instead of 404, even for a drive whose `video_visual_index` policy is off. That breaks I9 and spec items 3 and 1 ("policy is off or cannot be read" means no scenes or 404) without any error. The tests pass anyway, because they model an unreadable policy as a raised exception, which the real client never raises on this path.
Evidence: addons/intelligence/app/routers/exact_search.py:52-58: `return await is_feature_enabled(drive, "video_visual_index")` with a bare `except Exception: return False`. addons/intelligence/app/policy_client.py:124 defaults to `default_on_failure: bool = True`. On httpx errors (l.157-170) and non-JSON responses (l.178-182), `_resolve_failure(True, ...)` returns True (l.111-112) instead of raising, so the router's except branch never runs. By contrast, addons/intelligence/app/routers/video_visual.py:46-51 (the Visual Index routes the spec cites) passes `default_on_failure=False`. Spec docs/specs/intelligence-exact-and-scene-search.md:61-63 and 101-102 require fail-closed. The test fixture addons/intelligence/tests/search_endpoint_db.py:162ff replaces `is_feature_enabled` and raises `RuntimeError` for the unreadable case (test_search_exact_endpoint.py:260). That masks the real client's fail-open return.
Repro: Traced statically, not run. Make the internal policy API unreachable after the addon has observed a healthy backend, or let it answer 500. Do this for a drive whose video_visual_index policy is off and whose cached entry has expired, with features.video_visual_index set to "manual". Then GET /search/exact?q=<text in a scene label>&sources=scene. policy_client returns True, so include_scenes is True and the scene segments are returned. GET /search/scenes answers 200 with results instead of 404.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Call `is_feature_enabled(drive, "video_visual_index", default_on_failure=False)` in `_visual_index_open`, keeping the except for TransientError, or reuse the Visual Index router's wrapper. Change the test double so that it returns the client's actual fail value rather than raising, or so that it asserts `default_on_failure=False` is passed.

</details>

## Not verified

- claude-read: I could not run git, so I could not confirm that commit eeaf9cb59 by itself touches only the files shown in the supplied diff (its message suggests it records only the R-5 run under docs/process/reviews/). I took the supplied diff as authoritative.
- claude-read: I did not check whether the submodule range ed3f3ee..a4acca5 contains commits that touch addons/intelligence files beyond those shown in the diff.
- claude-read: I did not assess the correctness of the code against the invariants (I1-I10), only the touch-point question asked.
- claude-read: I did not run any tests.
- claude-verify: I did not run any test or the mutation suite. All conclusions come from static reading.
- claude-verify: I did not read the MCP tests, toolMetadata.test.ts, SERVER_INSTRUCTIONS or the README/docs edits.
- claude-verify: I did not verify that schemas.py's ExactSearchResponse/SceneSearchResponse field types accept every value produced (e.g. section as int).
- claude-verify: I did not check whether search.py and Ask callers stay byte-for-byte unchanged (I6) beyond confirming that include_video_visual_scene still defaults to False.
- claude-verify: I did not verify the client.request query serialisation for undefined values in mcp-server.

TOTAL: 1 findings
