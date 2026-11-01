# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

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

## Needs a human

### unspecified_behavior

Note: The first load of the open_clip or SigLIP text loader now also imports `sentence_transformers`, and the first load of the text embedder also imports `transformers`. The spec does not describe this coupling or its added cold time.; `clip._ensure_siglip_text_loaded` and `embedder._ensure_loaded` hold their own lock while waiting on the `ml_imports` lock. The `ml_imports` lock never takes another lock, so I see no deadlock, but one slow import now delays every cold loader.; A whitespace-only `q` in the URL passes the section's `query !== ""` check at `SceneCandidatesSection.tsx`, and the endpoint answers 422 after stripping, so the section would show the failure line rather than idle. I did not find a UI path that produces such a URL.
- claude-read: The first load of the open_clip or SigLIP text loader now also imports `sentence_transformers`, and the first load of the text embedder also imports `transformers`. The spec does not describe this coupling or its added cold time.
- claude-read: `clip._ensure_siglip_text_loaded` and `embedder._ensure_loaded` hold their own lock while waiting on the `ml_imports` lock. The `ml_imports` lock never takes another lock, so I see no deadlock, but one slow import now delays every cold loader.
- claude-read: A whitespace-only `q` in the URL passes the section's `query !== ""` check at `SceneCandidatesSection.tsx`, and the endpoint answers 422 after stripping, so the section would show the failure line rather than idle. I did not find a UI path that produces such a URL.
- claude-verify: The first encoder load in the process now imports both transformers and sentence_transformers under one lock, whichever encoder is requested (ml_imports.py:11,19-24). The spec does not describe this. It lengthens the route's cold time per decisions.md:78, still well inside the 30 s timeout on local data.

### unspecified_behavior

Note: The first encoder load in the process now imports both transformers and sentence_transformers under one lock, whichever encoder is requested (ml_imports.py:11,19-24). The spec does not describe this. It lengthens the route's cold time per decisions.md:78, still well inside the 30 s timeout on local data.
- claude-read: The first load of the open_clip or SigLIP text loader now also imports `sentence_transformers`, and the first load of the text embedder also imports `transformers`. The spec does not describe this coupling or its added cold time.
- claude-read: `clip._ensure_siglip_text_loaded` and `embedder._ensure_loaded` hold their own lock while waiting on the `ml_imports` lock. The `ml_imports` lock never takes another lock, so I see no deadlock, but one slow import now delays every cold loader.
- claude-read: A whitespace-only `q` in the URL passes the section's `query !== ""` check at `SceneCandidatesSection.tsx`, and the endpoint answers 422 after stripping, so the section would show the failure line rather than idle. I did not find a UI path that produces such a URL.
- claude-verify: The first encoder load in the process now imports both transformers and sentence_transformers under one lock, whichever encoder is requested (ml_imports.py:11,19-24). The spec does not describe this. It lengthens the route's cold time per decisions.md:78, still well inside the 30 s timeout on local data.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, MEDIUM, open

Claim: The change edits the encoder loaders `app/workers/clip.py` and `app/workers/embedder.py` and adds `app/workers/ml_imports.py`, none of which is in the touch-point list, and no declared invariant covers concurrent cold loading.
Impact: These loaders serve `/search`, `/search/scenes` and indexing as well as the new route, so a process-wide load path changed without a plan. Without the change, turning on Scene search on a cold process made `/search` answer 502 and silently shortened the file list (D1 in decisions.md). The first load of either CLIP loader now also imports `sentence_transformers`, and a failure importing either library now fails every encoder loader. No invariant states that `/search` and the route must both answer on a cold process, so a regression here would break no declared check; I8 speaks of results and is the nearest fit.
Evidence: `addons/intelligence/app/workers/clip.py:111` and `:230`, and `addons/intelligence/app/workers/embedder.py:113-115`, call `ml_imports.import_ml_libraries()`; `addons/intelligence/app/workers/ml_imports.py:11` imports both libraries under one lock. The spec's Touch points name only `routers/search.py`, a new segment-logic module, `manifest.json`, `schemas.py` and the frontend on the addon side, and the spec never mentions `transformers`, `sentence_transformers` or `embedder`. `decisions.md` records D1 and a cold route time of 5.33 and 5.55 s against 3.58 s before this fix, the difference being measured on one setup.
Repro: Read the diff against the spec's Touch points. For the missing invariant, mutation in the head: remove `ml_imports.import_ml_libraries()` from `clip._ensure_siglip_text_loaded`; `tests/test_ml_imports.py` should fail on the loader-order case, but that is a structural check that stubs the import, and no test runs a real concurrent cold import. Mutation not executed (read-only reviewer).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the three worker modules to the spec's touch points and declare the cold-concurrency invariant in invariants.md under Revisions.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The change edits two existing repository-wide guard tests outside the touch-point list: `frontend/src/__tests__/coarseNeedleSources.test.ts` and `frontend/src/__tests__/section-rows.test.tsx`.
Impact: No user can hit this; the production code is unaffected. Both edits widen an existing guard: the count of required fixture CSS needles goes from 61 to 64, and the allow-list of `overflow-x-auto` files gains `SceneCandidatesSection.tsx`. A reader of the touch points would not expect shared guards to move.
Evidence: `frontend/src/__tests__/coarseNeedleSources.test.ts:155` now expects 64, matching the three classes added in `frontend/e2e-layout/build-fixture-css.ts`. `frontend/src/__tests__/section-rows.test.tsx:90` adds the section to the set. Each edit corresponds directly to a listed touch point (the row measurement and the section), and neither loosens a check for any other file.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, INFO, open

Claim: The change adds test files that the touch-point list does not name: `addons/intelligence/tests/test_search_scene_segments_endpoint.py`, `addons/intelligence/tests/test_ml_imports.py`, `addons/intelligence/frontend/SceneCandidatesSection.test.tsx`, `addons/intelligence/frontend/sceneSegments.api.test.ts`, `addons/intelligence/frontend/sceneSegmentsSlot.test.ts`, and `frontend/src/components/__tests__/{FolderBrowser.sceneUrl,GlobalSearch.sceneFlag,SearchPage.sceneSlot,sceneCandidatesFixtureParity}.test.tsx`.
Impact: No user-visible effect. The list stays incomplete only in the literal sense: the spec's Checked section expects acceptance tests, so these are planned in substance. `test_ml_imports.py` is the exception and belongs with TP-1.
Evidence: The spec's Touch points name `frontend/e2e-layout/` as the only test location, and the addon frontend line enumerates the section, `api.ts`, `slots.ts` and the messages. The spec's 'Items held by the acceptance tests' entry assumes tests exist.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I ran no tests, mutations or application code; this reviewer has read-only tools, and repro statements describe expected results only.
- claude-read: The R-5 figures and observations in decisions.md were read, not reproduced.
- claude-read: I did not check whether anything imports `transformers` indirectly on a thread outside the loaders I read, beyond a direct-import search of `addons/intelligence/app`.
- claude-read: I did not check whether the import race can still occur if CLIP embedding fails before a BLIP load during indexing.
- claude-read: I did not read the proxy implementation behind I9, or the rest of `FolderBrowser.tsx` and `GlobalSearch.tsx` beyond the diff.
- claude-verify: No test or command was run, and no git diff was available, so before and after states (including the previous REQUIRED count and the changes to clip.py and embedder.py) were inferred from the tree, classification.json and decisions.md.
- claude-verify: That the addons/intelligence working tree is exactly at the pinned submodule commit 52d2a51d.
- claude-verify: The timing figures and the D1 run results in decisions.md, which were read as recorded and not reproduced.
- claude-verify: Whether every indexing path embeds an image before BLIP loads, including the case where every frame in a batch fails.

TOTAL: 3 findings
