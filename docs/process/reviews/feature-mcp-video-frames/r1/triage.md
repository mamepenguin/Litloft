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
B: 5
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The two new MCP tools live in a new module mcp-server/src/tools/video.ts. The touch-point list names mcp-server/src/tools/read.ts, which this change leaves alone.
Impact: A reviewer or later author who follows the list looks for get_video_frame and list_video_scenes in read.ts and does not find them. The behavior under I7 to I10 sits in a file the list does not name.
Evidence: The diff adds mcp-server/src/tools/video.ts (235 lines; getVideoFrame, listVideoScenes, fetchSceneFrames). mcp-server/src/tools/read.ts:343 still exports readTools with LitloftTool entries only, and Grep finds no video tool in read.ts.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Change the touch point from read.ts to mcp-server/src/tools/video.ts (new).

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: mcp-server/src/tools/index.ts is changed but is not in the touch-point list. allTools now has type LitloftMediaTool[] and includes videoTools.
Impact: Every tool that server.ts:56-64 registers now goes through the widened media-result type. The list does not name the registration point, so a reviewer would not check that existing text-only tools still register the same way.
Evidence: In the diff, mcp-server/src/tools/index.ts changes `allTools: LitloftTool[]` to `allTools: LitloftMediaTool[] = [...readTools, ...videoTools, ...writeTools, ...askTools]`. server.ts:56 iterates allTools.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add mcp-server/src/tools/index.ts (tool registration) to the touch points.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: mcp-server/src/tools/runTool.ts is changed but is not in the touch-point list. runTool becomes generic (`runTool<R extends ToolMediaResult = ToolTextResult>`, returning `R | ToolTextResult`), and the error-detail formatting moves into an exported apiErrorDetail.
Impact: runTool wraps every MCP tool, so a change here reaches every tool's error output. The list names neither runTool.ts nor this shared path.
Evidence: In the diff, runTool.ts:9-13 adds an exported apiErrorDetail, and runTool.ts:15-17 changes the signature. video.ts imports apiErrorDetail for per-scene reasons (failureReason).
Repro: Reading the change: the default type parameter keeps existing callers at ToolTextResult, and the error text `Litloft API error (<status>): <detail>` is built the same way as before. No behavior change was found.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add mcp-server/src/tools/runTool.ts (generic result type, apiErrorDetail extracted) to the touch points.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The MCP tool tests are in a new file mcp-server/src/__tests__/videoFrames.test.ts. The touch-point list names mcp-server/src/__tests__/read.test.ts, which this change does not touch.
Impact: Someone checking the tests for I7 to I10 by following the list would look in read.test.ts, find nothing, and could wrongly decide the tests are missing.
Evidence: The diff adds mcp-server/src/__tests__/videoFrames.test.ts (625 lines). Grep finds no get_video_frame or list_video_scenes in read.test.ts.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Change the touch point read.test.ts to videoFrames.test.ts (new).

</details>

### claude-read:TP-5 — bucket B, INFO, open

Claim: addons/intelligence/app/main.py is changed to register the new scenes router, and the touch-point list does not name it. The list does allow 'a new router module', which covers the new file app/routers/scenes.py.
Impact: Without the main.py include, GET /files/{file_id}/scenes would return 404. That route registration is in a file the list leaves out.
Evidence: In the diff, addons/intelligence/app/main.py adds `scenes` to the import from app.routers and `app.include_router(scenes.router)` after video_visual.router.
Repro: Mutation: remove `app.include_router(scenes.router)`. TestRouteDeclaration::test_spec_addon_031_handler_is_sync_so_it_runs_in_the_thread_pool (len(routes) == 1) and all endpoint tests would fail, so the tests cover this omission.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add addons/intelligence/app/main.py (router include) and name app/routers/scenes.py explicitly in the touch points.

</details>

## Not verified

- claude-read: I did not run any tests or the TypeScript compiler, so I did not confirm that the widened types compile for every tool.
- claude-read: I did not read the invariants.md revision file under docs/process/reviews/feature-mcp-video-frames/ to see whether it changes the touch-point list.
- claude-read: I did not check the actual contents of the submodule commit 76633de beyond the diff provided.
- claude-verify: Shell access was not available, so I did not read the diff against origin/develop with git. I inferred that index.ts, runTool.ts and main.py changed from the current file contents (the new imports and exports).
- claude-verify: I did not check invariants I1–I10 against the code.
- claude-verify: I did not run any tests.

TOTAL: 5 findings
