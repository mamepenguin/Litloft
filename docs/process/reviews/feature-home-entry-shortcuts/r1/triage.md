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
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: The MCP `add_to_collection` output gains `on_home`; spec §7 discusses only `get_collection` and `list_collections`.
- claude-read: The MCP `add_to_collection` output gains `on_home`; spec §7 discusses only `get_collection` and `list_collections`.
- claude-verify: MCP add_to_collection output now includes on_home; not described in spec §7 or the touch points.

### unspecified_behavior

Note: MCP add_to_collection output now includes on_home; not described in spec §7 or the touch points.
- claude-read: The MCP `add_to_collection` output gains `on_home`; spec §7 discusses only `get_collection` and `list_collections`.
- claude-verify: MCP add_to_collection output now includes on_home; not described in spec §7 or the touch points.

## Findings

A: 0
B: 5
C: 0

### claude-read:R1-claude-read-1 — bucket B, LOW, open

Claim: The change reaches the MCP server's tool output, which is not in the touch-point list: both `get_collection` and `add_to_collection` now return an extra `on_home` field, and the spec's §7 mentions only `get_collection`.
Impact: An MCP client (an LLM agent) sees a new `on_home` field in two tool outputs. The spec accepts this for `get_collection` but never mentions `add_to_collection`, and neither tool's tests pin the shape. Nothing breaks for a user today; the reach is simply unplanned.
Evidence: backend/app/routers/collections.py:76 adds `on_home` to `_to_detail`, which also builds the add-items (collections.py:242) and reorder (collections.py:303) responses. mcp-server/src/tools/collections.ts:67-79 spreads `...rest` of the detail into its output, so `on_home` passes through. mcp-server/src/tools/write.ts:269-275 returns the raw `POST .../collections/{id}/items` response, which now carries `on_home`. Neither `mcp-server/` nor these tools appears under the spec's `## Touch points`.
Repro: not_reproduced (read-only). Calling the MCP `add_to_collection` tool against this build returns a JSON body that includes `on_home`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `mcp-server/src/tools/collections.ts` (get_collection) and `mcp-server/src/tools/write.ts` (add_to_collection) to the touch points as read-only pass-throughs, through a revision in invariants.md.

</details>

### claude-deep:TP-1 — bucket B, INFO, open

Claim: The diff edits DESIGN.md and adds two project-wide rules to the 'Home entry row' section, but the touch-point list names DESIGN.md only under 'Rules passed through', not as a file the change rewrites.
Impact: There is no user-visible defect. The new rule says every entry tile, built-in, addon and Inbox included, is at most 16rem wide with a one-line truncated label at or above 36rem. It changes the design rule for tiles outside this feature. I13 guards it only for the two long-label fixtures, so later work on the existing tiles is checked against a rule that no invariant names as changed.
Evidence: DESIGN.md:693-703 (diff hunk @@ -678,7 +678,8 and the added bullets 'Home shortcuts come after the addon entries…' and 'Every tile's label follows one rule…'). docs/process/spec-and-design.md:41-43 defines touch points as including 'the rules and conventions it passes through'. The spec's touch list says 'Rules passed through: … DESIGN.md'. HomeAppEntries.tsx TILE/TILE_LABEL applies the rule to all entries.
Repro: not_reproduced. This is a static comparison of the diff's file list against the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record DESIGN.md as a place the change rewrites, or accept it explicitly in the review record.

</details>

### claude-deep:TP-2 — bucket B, INFO, open

Claim: Eight existing vitest files that host DriveHome gain `getHomeShortcuts` in their `@/lib/api` mock factory, and three unedited ones now reach the real `getHomeShortcuts`. The touch-point list enumerates only the files that mock `usePinnedFolders`.
Impact: There is no user-visible effect. DriveHome.loadPage now calls `getHomeShortcuts(drive).then(...)` synchronously. Any DriveHome host test whose strict `@/lib/api` factory lacks that export fails on a missing mock export, so the change reaches every such host test. In the three `importOriginal` tests the real wrapper calls `fetch`; the rejection is caught and becomes `[]`, so they still pass. A future host test that stubs fetch strictly could see an unexpected request.
Evidence: Edited: frontend/src/__tests__/DriveHome.test.tsx:95, accent-budget.test.tsx:114, driveHomeFailureState.test.tsx:52, driveHomeSectionOrder.test.tsx:44, driveHomeTreeClosable.test.tsx:27, uploadZoneHosts.test.tsx:40, components/__tests__/DriveHome.driveChange.test.tsx:15, DriveHome.icons.test.tsx:8. Reached but not edited (importOriginal): homeAppEntries.test.tsx:74, homeResumeRows.test.tsx:68, homeContinueDesk.test.tsx:54; none stubs fetch (grep for `fetch` finds only `refetch` identifiers). DriveHome.tsx loadPage starts `getHomeShortcuts` before the first await.
Repro: not_reproduced. I could not run vitest. The reach follows from reading the mock factories and DriveHome.loadPage.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add 'the vitest files that mock `@/lib/api` for a DriveHome host gain `getHomeShortcuts`' to the touch list, or accept the gap in the review record.

</details>

### claude-deep:TP-3 — bucket B, INFO, open

Claim: Existing assertions in CollectionDetail.test.tsx are rewritten: the overflow-menu count goes from 1 to 2, and the Escape test now selects the menuitem by its name instead of as the single menuitem. CollectionDetail.test.tsx is not a touch point; only CollectionDetail.tsx is.
Impact: There is no user-visible effect. A pre-existing guard ('the menu holds only Delete') is weakened to a count of two. Any future row added to the collection menu again requires rewriting the count, and the test no longer says which two rows are expected.
Evidence: frontend/src/components/__tests__/CollectionDetail.test.tsx:387-389 (getByRole('menuitem') → getByRole('menuitem', { name: 'Delete collection' })) and :407 (toHaveLength(1) → toHaveLength(2)).
Repro: not_reproduced. Read the diff hunk.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Assert the two expected row names (Put on Home / Remove from Home, then Delete collection) instead of a bare count.

</details>

### claude-deep:TP-4 — bucket B, INFO, open

Claim: The MCP server's `get_collection` tool output gains `on_home` because the tool spreads every top-level field of the collection detail. No mcp-server file is in the touch-point list; the spec mentions this only in item 7 prose.
Impact: The output that MCP clients (an AI) receive from `get_collection` gains a field. No file is edited and nothing breaks, but this is a change to an external-facing interface that the touch list does not name.
Evidence: mcp-server/src/tools/collections.ts:67 (`const { items: allItems, ...rest } = detail;`) and :76 (`...rest,` in the returned object). backend/app/routers/collections.py:76 now sets `on_home=collection.on_home` in `_to_detail`.
Repro: not_reproduced. Static read of the spread in collections.ts.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name `mcp-server` `get_collection` output in the touch-point list as an accepted reach.

</details>

## Not verified

- claude-deep: I could not run the backend pytest suite, vitest or the Playwright e2e-components cases, so whether they pass was not checked.
- claude-deep: I did not open commit 11bb85da6 on its own (git is unavailable to me); I reviewed the provided branch diff against origin/develop.
- claude-deep: Submodule sources were only grepped for /pins, smart-folders, home-shortcuts and collections/ paths, not read in full.
- claude-deep: I did not grep the whole frontend tree for every DriveHome host beyond the 17 files that import DriveHome or the drive layout/page.
- claude-read: I did not run any tests (backend pytest, vitest, Playwright e2e-components).
- claude-read: I did not check addon repositories or packages outside backend/, frontend/ and mcp-server/ for consumers of the pin, Smart Folder or collection-detail responses.
- claude-read: I did not confirm that the working tree is exactly at commit 11bb85da6; I relied on the diff in the prompt and the files as they are in the worktree.
- claude-verify: I could not view git diffs, so I did not confirm the exact prior content of DESIGN.md or CollectionDetail.test.tsx.
- claude-verify: I did not run any tests to see whether the importOriginal test files actually issue network requests or log errors.
- claude-verify: I did not check invariants I1-I13 against the implementation.

TOTAL: 5 findings
