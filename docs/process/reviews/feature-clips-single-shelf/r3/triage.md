# Triage: r3

## Trajectory

This run:
- claude-read: There have been two fix rounds, and both edited the same one-line body prediction in Library.tsx. Round 1 (32908cbe1) added a state: the body value went from grid | shelves to grid | shelves | empty, and the formula gained a `total >= 2` term. Round 2 (1f9d8d32d) adds no new branch, state or prediction. It reorders the existing formula so that `total === 0` outranks the 'kept shelves' override, which narrows that override rather than adding to it. The route R2-1 named (shelves → 0 → 1) now reaches the grid, and a new test covers it. No state was removed: the 'kept' override remains and still governs the shelves → 1 case. Each round so far has patched one refresh route, but this round converges rather than adds.

Earlier runs:
- r2 / claude-read: One fix round (32908cbe1) since r1. It adds a state: the body value grows from two values (grid | shelves) to three (grid | shelves | empty), and the prediction formula gains a `total >= 2` term next to the existing 'kept shelves' override. No branch or state was removed. The round patches the route V-1 named (empty → 1) but keeps the 'kept' override, which still outranks total 0. The shelves → 0 → 1 route therefore still violates I1 (R2-1). The design is being patched state by state rather than deriving the body from what is actually drawn.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/knowledge/frontend/clipsapp/Library.tsx — full: Read the whole file.
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — full: Read the whole file.

Test files:
- addons/knowledge/frontend/__tests__/cardMenuHarness.tsx — partial: Only the diff hunk around choose() (lines 71-78), which is unchanged since r1.
- addons/knowledge/frontend/__tests__/clipsCardMenu.test.tsx — partial: Only the diff hunk at lines 726-752.
- addons/knowledge/frontend/__tests__/clipsHome.test.tsx — partial: Only the diff hunks around lines 216 and 441.
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — partial: Only the diff hunks around lines 191, 208, 235, 251, 482-511, 569 and 599.
- addons/knowledge/frontend/__tests__/clipsNameFilter.test.tsx — partial: Only the diff hunk around line 246.
- addons/knowledge/frontend/__tests__/clipsSingleShelf.test.tsx — full: New file, shown in full in the diff, including this round's added test at lines 555-579.
- addons/knowledge/frontend/__tests__/clipsTargetChangeOnHome.test.tsx — partial: Only the diff hunk around line 148.
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: Only the diff hunks around lines 244-254 and 531-537.

## Unspecified behavior, recorded

- claude-read: With the single-shelf grid drawn, a refresh whose shelves request fails leaves the grid as drawn and never re-asks its pages, and shows no error, while None's grid re-asks its pages directly on a refresh.
  - F1 × I3 = 3, claude-read: A clip-ready event during a transient backend error leaves the new clip missing from the grid until the conditions change or the page reloads.
  - F1 × I2 = 2, claude-verify: I confirmed this in the code. If the shelves request of a refresh fails while the single-shelf grid is drawn, useGroupedShelves.ts:71-73 keeps the held answer and does not bump `answer`, so the grid (Library.tsx:187, refresh={data.answer}) does not ask for its pages again and shows no error. The user sees the old grid until the next refresh, and that only happens on a rare LAN failure.
- claude-read: A later-shelves page answer (loadMore) rewrites `total`, and Library recomputes the body from it on the next render, so a loadMore answer reporting 0 while shelves are drawn records "empty" while the shelves stay drawn; the next refresh answering 1 then draws the grid in their place.
  - F0 × I1 = 0, claude-read: It needs every matching clip removed elsewhere between the first page and a scroll that asks for more shelves, and the user then sees the grid, which is the single-shelf presentation anyway.
  - F0 × I2 = 0, claude-verify: The chain in Library.tsx:170-177 is real, but ordinary data can't start it. loadMore only runs when shelves.length < total, and an empty loadMore answer sets total to prev.shelves.length at useGroupedShelves.ts:96, which is at least 12. A total of 0 therefore needs a server answer with shelves but total_shelves=0, which is inconsistent and outside normal use.
- claude-read: Leaving the conditions and returning to them (for example sort A→B→A) recomputes the grid/shelves choice, so shelves kept for a one-shelf answer turn into the grid without any data change.
  - F1 × I1 = 1, claude-read: It needs the rare kept-shelves-with-one-shelf state followed by a change and return of conditions, and the user then sees the grid, which the spec intends for the next answer.
  - F1 × I1 = 1, claude-verify: I confirmed this in the code: body.current holds only one scope (Library.tsx:169-176), so after the conditions change away and back, a one-shelf answer draws the grid. This only shows up after the data has shrunk to a single shelf while shelves were drawn, and then the user gets the grid I1 asks for, so the change is harmless.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: The test suites were not run; pass or fail is not known.
- claude-read: Whether backend/app/routers/shelves.py computes total_shelves the way the test harness does.
- claude-read: The full bodies of the edited existing test files beyond their diff hunks; this round's fix touched only clipsSingleShelf.test.tsx and Library.tsx.
- claude-read: That the submodule checkout in the worktree matches a340ad163; the files read are assumed to be at that commit.
- claude-read: usePagedClips.ts was read only around its refresh handling, to confirm that a freshly mounted grid with a non-zero refresh value asks page 1 once.
- claude-verify: Test files and test results (I cannot run commands)
- claude-verify: Backend shelves.py total_shelves semantics
- claude-verify: Documentation changes in docs/addons/knowledge.md and docs/user-guide/notes.md
- claude-verify: The I4 menu, URL and stored-grouping persistence path in clips.tsx

TOTAL: 0 findings
