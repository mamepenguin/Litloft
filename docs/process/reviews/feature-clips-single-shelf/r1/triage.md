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
- open finding claude-verify:V-1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/knowledge/frontend/clipsapp/Library.tsx — full: Read the whole file.
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — full: Read the whole file.

Test files:
- addons/knowledge/frontend/__tests__/cardMenuHarness.tsx — full: Read the whole file.
- addons/knowledge/frontend/__tests__/clipsCardMenu.test.tsx — partial: Only the diff hunk at lines 726-752 (the new SPEC-ADDON-184 describe).
- addons/knowledge/frontend/__tests__/clipsHome.test.tsx — partial: Only the diff hunks around lines 216 and 441.
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — partial: Only the diff hunks around lines 191, 208, 235, 251, 482-511, 569 and 599.
- addons/knowledge/frontend/__tests__/clipsNameFilter.test.tsx — partial: Only the diff hunk around line 246.
- addons/knowledge/frontend/__tests__/clipsSingleShelf.test.tsx — full: New file, read in full in the diff.
- addons/knowledge/frontend/__tests__/clipsTargetChangeOnHome.test.tsx — partial: Only the diff hunk around line 148.
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: Only the diff hunks around lines 244-254 and 531-537.

## Unspecified behavior, recorded

- claude-read: With the single-shelf grid drawn, a refresh whose shelves request fails leaves the grid as drawn and never re-asks its pages, with no error shown, while None's grid re-asks its pages directly on a refresh.
  - F1 × I3 = 3, claude-read: A clip-ready event during a transient backend error leaves the newly added clip missing from the grid until the next change of conditions or a reload. The spec's failure cases cover only the first shelves request.
  - F1 × I3 = 3, claude-verify: With the grid drawn, a refresh (clip added or clip.ready) needs a failed shelves request on a home LAN to show this. The grid stays as drawn without the new clip and without an error until the next change of conditions or a reload.
- claude-read: With the single-shelf grid drawn, a refresh whose shelves answer reports 0 shelves replaces the grid with the empty state; the spec lists only grid→grid and grid→shelves.
  - F0 × I2 = 0, claude-read: It needs every clip to be removed elsewhere just before a refresh that only adds clips, so it does not occur in ordinary use.
  - F0 × I1 = 0, claude-verify: A refresh only adds clips, so with the grid drawn an answer of 0 needs every matching clip to be removed or changed elsewhere first. The user then sees the ordinary empty state, which is correct for 0 shelves.
- claude-read: With shelves drawn, the choice to keep the shelves is tied to the exact scope, so leaving the conditions and coming back (for example sort A→B→A) recomputes it and may draw the grid without any data change.
  - F1 × I1 = 1, claude-read: The spec says the grid appears on the next answer for changed conditions, so this matches its intent. It is listed only because 'returning to the same conditions' is not described.
  - F1 × I1 = 1, claude-verify: This needs the rare state of shelves kept while the answer reports 1 shelf, then a change and return of conditions. The user then sees the grid in place of the lone shelf, which is what the spec says the next answer for changed conditions should draw.

## Findings

A: 1
B: 3
C: 0

### claude-verify:V-1 — bucket A, LOW, open

Claim: When the Library is showing the 0-shelf empty state and a refresh returns total_shelves = 1 for the same conditions, the Library draws one headed shelf with a count and See all instead of the grid.
Impact: In this path the Library shows a shelf heading, a count and See all where I1 calls for the None grid. The clip can still be reached through See all, so nothing is lost; the Library just looks different from what the spec says.
Evidence: Library.tsx:170-175 runs on every ready answer and stores body.current = { scope, value: kept === "shelves" ? "shelves" : data.total === 1 ? "grid" : "shelves" }. A first answer with total 0 therefore stores value "shelves", and Library.tsx:191-196 draws the empty state. A refresh keeps the scope (useGroupedShelves.ts:50-53 keeps phase ready), so when its answer reports 1, kept is "shelves" and the value stays "shelves". Library.tsx:178 then skips the grid, and the code reaches Library.tsx:209-241, which draws a CoverShelf with title, count and seeAllHref. I8 exempts only the case "with shelves drawn". The empty state draws no shelves, so I1 governs this case. clips.tsx:397-423 keeps an empty drive or Target out of Library, so the path needs an active tag, trust or name filter that matches nothing, followed by an added clip that matches it. A second route is a grid that drops to 0 on one refresh and returns 1 on the next.
Repro: not_reproduced: traced in the code only, not executed. Steps: open ?view=all&group=tags with a filter that matches no clip (empty state drawn), add a clip through the page form that matches the filter, and the refresh's shelves answer reports 1, so a headed shelf is drawn.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Store "shelves" as kept only when the answer actually drew shelves (total >= 2), for example by recording null for total 0, so that a later answer of 1 in the same scope draws the grid.

</details>

### claude-read:TP-1 — bucket B, INFO, open

Claim: The shared card-menu test harness `choose()` now also fires `pointerUp` on the chosen row, a change to a file no touch point names that alters how every card-menu test in the addon drives a menu.
Impact: No user impact. The harness is imported by five suites (clipsCardMenu, clipsCardMenuStates, notesCardMenuStates, notesHomeCardMenu, notesLibraryCardMenu). The added pointerup clears DismissScrim's module-level `pressInFlight`, so a menu opened after `choose()` is no longer treated as opened during a press that never ended. The event sequence is more realistic, but the Notes suites now run on it without the spec saying so.
Evidence: addons/knowledge/frontend/__tests__/cardMenuHarness.tsx:74-76 adds `fireEvent.pointerUp(row)` between pointerDown and click. frontend/src/components/DismissScrim.tsx:69-83 sets `pressInFlight` on capture pointerdown and clears it only on pointerup or pointercancel. The new clipsCardMenu.test.tsx:727-751 case opens the Sort By menu right after `choose("Move to Trash")`, which appears to be why the line was needed.
Repro: not_reproduced; static reading. Removing the line would presumably leave `pressInFlight` set to the stale pointerdown when the Sort By menu mounts in the new clipsCardMenu case.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `addons/knowledge/frontend/__tests__/cardMenuHarness.tsx` (choose(): pointerup ends the press) to the touch points in the review's invariants.md.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: Seven existing test files that no touch point names were edited: fixtures gained a second tag, folder or month so that tests written for multi-shelf drawing still see shelves instead of the new single-shelf grid, and one expected value changed.
Impact: No user impact. The edits keep those tests about shelves. Without them, those tests would now hit the grid. The one changed assertion (clipsViewPerTarget `shelfHeadings()` from ["web"] to ["web","news"]) still checks that every folder ask carries the Target's tag. The new clipsSingleShelf.test.tsx is also not named, though it follows directly from the spec.
Evidence: clipsHome.test.tsx:216 and :441, clipsLibrary.test.tsx:191, 208, 235, 251, 511, 569, 599, clipsNameFilter.test.tsx:246, clipsTargetChangeOnHome.test.tsx:148, clipsViewPerTarget.test.tsx:247-252 and :534. Each adds a clip that makes a second shelf. The touch-point list in docs/specs/clips-single-shelf-flat.md names only product files and docs.
Repro: not_reproduced; static reading of the diff hunks.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the edited Clips test files (fixtures given a second shelf) and clipsSingleShelf.test.tsx among the touch points in invariants.md.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: Within the touched files, the change reaches further than the stated touch point: useGroupShelves exposes a new `answer` counter that drives the grid's refresh, beyond the stated `total_shelves`, and the None grid (`Ungrouped`) is renamed to `ClipsGrid` with the extra `paging` element in its scope string, while spec item 7 says None is unchanged.
Impact: No observable user impact found. The None grid's scope gains a constant "none" segment, so its paging, merging and retry behave as before. The `answer` counter is what makes I8 grid→grid hold (the grid re-asks only after a shelves answer).
Evidence: addons/knowledge/frontend/clipsapp/useGroupedShelves.ts:19-20, 24, 66 and 110 add `answer` to Held and the return value. addons/knowledge/frontend/clipsapp/Library.tsx:245-271 renames Ungrouped to ClipsGrid and builds the scope from `[drive, target.key, sort, "grid", paging, filters]`. Library.tsx:311-319 renders it with paging="none".
Repro: not_reproduced; static reading.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Extend the useGroupedShelves touch point to 'expose total_shelves and a first-page answer counter', and note that the None grid component is shared with paging="none".

</details>

## Not verified

- claude-read: That backend/app/routers/shelves.py computes total_shelves the way the test harness does (for example tag exclusion for the Target's own tag, or a root-folder shelf).
- claude-read: The test suites were not run. Pass or fail is not known.
- claude-read: Whether the harness pointerUp change is required by, or alters the outcome of, the Notes card-menu suites.
- claude-read: The submodule commit range beyond the shown diff, and the docs/user-guide wording against the actual UI labels.
- claude-verify: No test or app run was executed; every claim comes from reading the code.
- claude-verify: The pre-change code (origin/develop) was not seen, so 'added', 'renamed' and 'gained' rest on the r1 file lists and on the code as it now reads.
- claude-verify: Several cited test lines (clipsHome:441, clipsLibrary:511/569/599, clipsTargetChangeOnHome:148) and the test bodies of clipsSingleShelf.test.tsx were not read.
- claude-verify: The docs changes (docs/addons/knowledge.md, docs/user-guide/notes.md) were not checked.

TOTAL: 4 findings
