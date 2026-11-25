# Triage: r2

## Trajectory

This run:
- claude-read: One fix round (32908cbe1) since r1. It adds a state: the body value grows from two values (grid | shelves) to three (grid | shelves | empty), and the prediction formula gains a `total >= 2` term next to the existing 'kept shelves' override. No branch or state was removed. The round patches the route V-1 named (empty → 1) but keeps the 'kept' override, which still outranks total 0. The shelves → 0 → 1 route therefore still violates I1 (R2-1). The design is being patched state by state rather than deriving the body from what is actually drawn.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R2-1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/knowledge/frontend/clipsapp/Library.tsx — full: Read the whole file.
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — full: Read the whole file.

Test files:
- addons/knowledge/frontend/__tests__/cardMenuHarness.tsx — partial: Only the diff hunk around choose() at lines 71-78; unchanged since r1.
- addons/knowledge/frontend/__tests__/clipsCardMenu.test.tsx — partial: Only the diff hunk at lines 726-752.
- addons/knowledge/frontend/__tests__/clipsHome.test.tsx — partial: Only the diff hunks around lines 216 and 441.
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — partial: Only the diff hunks around lines 191, 208, 235, 251, 482-511, 569 and 599.
- addons/knowledge/frontend/__tests__/clipsNameFilter.test.tsx — partial: Only the diff hunk around line 246.
- addons/knowledge/frontend/__tests__/clipsSingleShelf.test.tsx — full: New file, shown in full in the diff. Lines 537-553 of the new test were confirmed with Grep.
- addons/knowledge/frontend/__tests__/clipsTargetChangeOnHome.test.tsx — partial: Only the diff hunk around line 148.
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: Only the diff hunks around lines 244-254 and 531-537.

## Unspecified behavior, recorded

- claude-read: With the single-shelf grid drawn, a refresh whose shelves request fails leaves the grid as drawn and never re-asks its pages, and shows no error, while None's grid re-asks its pages directly on a refresh.
  - F1 × I3 = 3, claude-read: A clip-ready event during a transient backend error leaves the new clip missing from the grid until the conditions change or the page reloads.
  - F1 × I2 = 2, claude-verify: A shelves request has to fail during a refresh while the single-shelf grid is drawn, which is rare on a home LAN; the user then sees a stale grid with no error until the next refresh or change of conditions.
- claude-read: With shelves drawn, a refresh answering 0 draws the empty state, but the Library still records the body as shelves for that scope, which governs what the next answer of 1 draws.
  - F0 × I2 = 0, claude-read: It needs every matching clip moved away elsewhere while shelves are drawn. The user then sees a headed single shelf where the grid would be expected (R2-1).
  - F1 × I3 = 3, claude-verify: Triggered when a refresh empties a grouping whose shelves were drawn (for example, the last matching clips are removed or verified) and a later refresh brings back exactly one shelf; the user then sees a headed shelf with See all instead of the flat grid until the conditions change.
- claude-read: Leaving the conditions and returning to them (for example sort A→B→A) recomputes the grid/shelves choice, so kept shelves for a one-shelf answer turn into the grid without any data change.
  - F1 × I1 = 1, claude-read: It needs the rare kept-shelves-with-one-shelf state followed by a change and return of conditions. The user then sees the grid, as the spec intends for the next answer.
  - F2 × I1 = 2, claude-verify: Changing sort or a filter and changing it back recomputes the body, so shelves that were kept for a one-shelf answer become the grid, which is the specified single-shelf presentation; the user sees only a layout change.

## Findings

A: 1
B: 0
C: 0

### claude-read:R2-1 — bucket A, LOW, open

Claim: The fix for V-1 closes the empty→1 route only when the empty state was reached from a fresh scope or from the grid. When shelves were drawn and a refresh answers 0, the body stays "shelves" while the empty state is drawn, so a later refresh answering 1 still draws a headed shelf with a count and See all.
Impact: In this path the Library shows one heading, a count and See all where I1 calls for the None grid, until the conditions change. No clip is lost, because See all reaches it. Reaching the path takes shelves drawn under a filter, every matching clip moved or removed elsewhere, a refresh, and then a matching clip added. In ordinary use that almost never happens.
Evidence: Library.tsx:171-175: `kept === "shelves" || data.total >= 2 ? "shelves" : ...`. With kept="shelves" and total=0, value stays "shelves". Library.tsx:192-197 then draws the empty state, because data.shelves is empty, but body.current.value is still "shelves". On the next refresh in the same scope (useGroupedShelves.ts:50-53 keeps phase ready and the scope unchanged), total=1 and kept="shelves" keep the value at "shelves". Library.tsx:179 skips the grid, and Library.tsx:210-243 draws a CoverShelf with title, count and seeAllHref. I8's exception covers only 'with shelves drawn', and here the empty state is drawn. The new test (clipsSingleShelf.test.tsx:537-553) starts from a fresh empty state, so it does not cover this route.
Repro: not_reproduced; static trace. Steps: ?view=all&group=tags&trust=verified with verified clips in two tags (shelves drawn). Mark them unverified elsewhere and emit knowledge.clip.ready: the shelves answer reports 0 and the empty state is drawn. Add one verified clip and emit knowledge.clip.ready: the answer reports 1 and one headed shelf is drawn.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Compute the stored value from what is drawn: when total is 0, store "empty" whatever was kept, i.e. `data.total === 0 ? "empty" : kept === "shelves" || data.total >= 2 ? "shelves" : "grid"`.

</details>

## Not verified

- claude-read: The test suites were not run; pass or fail is not known.
- claude-read: Whether backend/app/routers/shelves.py computes total_shelves the way the test harness does.
- claude-read: The full bodies of the edited existing test files beyond their diff hunks.
- claude-read: That the R2-1 route is reachable through clips.tsx: whether the page keeps Library mounted when the filtered Target becomes empty was not re-read.
- claude-verify: I did not run the test suite or reproduce R2-1 in a browser or test; the confirmation rests on reading the code.
- claude-verify: I did not read requests.ts, usePagedClips.ts or the backend shelves router at this commit.
- claude-verify: I did not check whether the addons/knowledge submodule checkout in the worktree matches the pointer recorded in commit 32908cbe1, beyond the clean git status.

TOTAL: 1 findings
