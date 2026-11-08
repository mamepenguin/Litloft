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

Note: FilterField.tsx maps `epub` to the `type.document` label and the Files icon, so a `type:epub` filter chip would read "Document".; ParsedQuery gains a `kinds` getter that aliases `types`; spreading the object copies it as a value.
- claude-read: FilterField.tsx maps `epub` to the `type.document` label and the Files icon, so a `type:epub` filter chip would read "Document".
- claude-read: ParsedQuery gains a `kinds` getter that aliases `types`; spreading the object copies it as a value.
- claude-verify: Video now keeps a stale saved target id in storage rather than replacing it with default, which differs from the SPEC-CORE-055 failure-case text.

### unspecified_behavior

Note: Video now keeps a stale saved target id in storage rather than replacing it with default, which differs from the SPEC-CORE-055 failure-case text.
- claude-read: FilterField.tsx maps `epub` to the `type.document` label and the Files icon, so a `type:epub` filter chip would read "Document".
- claude-read: ParsedQuery gains a `kinds` getter that aliases `types`; spreading the object copies it as a value.
- claude-verify: Video now keeps a stale saved target id in storage rather than replacing it with default, which differs from the SPEC-CORE-055 failure-case text.

## Findings

A: 0
B: 6
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The diff edits the shared component frontend/src/components/PageTabs.tsx to add a `wrap` prop, and no touch point names this file.
Impact: PageTabs is also used by app/admin/settings/page.tsx. The default `wrap=false` keeps the old `overflow-x-auto` class there, so no user-visible regression was found. The edit still reaches a page outside the plan.
Evidence: frontend/src/components/PageTabs.tsx: the className changes from a fixed `overflow-x-auto` to `${wrap ? "flex-wrap" : "overflow-x-auto"}`. Grep for `<PageTabs` finds appshell/AppTabs.tsx and app/admin/settings/page.tsx.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add PageTabs.tsx to the touch points, or keep the wrapping inside AppTabs.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: The diff adds a new module, frontend/src/lib/readingAppTarget.ts (target resolution, kind intersection, rejection of negated operators), that no touch point names.
Impact: This module decides which `type` values are sent and which smart folders are usable, so it carries I12, I12a and I12b. A reviewer who uses the touch-point list to choose where to look for mutation review could miss it.
Evidence: frontend/src/lib/readingAppTarget.ts is new. It holds `resolveReadingTarget`, `intersect`, and `NEGATED_OPERATOR` with the operator list tag|type|path|in|size|duration|is.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add lib/readingAppTarget.ts to the touch points.

</details>

### claude-read:TP-5 — bucket B, LOW, open

Claim: The diff changes the allowlists and counts of several repository guard tests that no touch point names: card-grid.test.ts (6→8 sites), section-rows.test.tsx (the scrollbar allowlist swaps videoapp/ShelfBlock for readingapp/LibraryFace), popup-dismissal.test.ts (three new popups registered), and toolbarMenuHome.test.ts.
Impact: Each guard's exemption list now includes the new reading files. The section-rows exemption allows the Reading chip row's `overflow-x-auto`. Under I22 that is acceptable only because the mouse media query switches it off. A future edit to the chip row would pass this guard unchecked.
Evidence: frontend/src/__tests__/section-rows.test.tsx adds "frontend/src/components/readingapp/LibraryFace.tsx". frontend/src/__tests__/card-grid.test.ts expects 8 sites. frontend/src/__tests__/popup-dismissal.test.ts adds appshell/ManageTargetsDialog, appshell/TargetMenu and readingapp/LibraryControls.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the guard tests whose registries the change updates in the touch points.

</details>

### claude-read:TP-6 — bucket B, LOW, open

Claim: useVideoApp.ts drops Video's repair of a stale saved target: it no longer rewrites a deleted folder's id to `default`. The touch point says Video behavior outside the three item-7 changes stays as it is, and this is not one of those changes.
Impact: In Video, a stored target id for a deleted smart folder now stays in localStorage permanently. If that folder (the same id) comes back, it becomes the target again. The existing SPEC-CORE-055 test was rewritten from "repairs" to "keeps" to match.
Evidence: frontend/src/components/videoapp/useVideoApp.ts removes the `stale` useEffect that called `updatePrefs({ target: "default" })`. frontend/src/components/videoapp/__tests__/VideoApp.test.tsx now expects `readAppPrefs(DRIVE).target` to be "deleted-id".
Repro: Store a target id for a smart folder that does not exist and open the Video app. Before the change, storage became `default`. After it, the id stays (the rewritten test asserts this).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> State in the touch points (item 7) that Video also keeps a stale saved target id, or restore the repair for Video.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: The diff edits the Video shelf route frontend/src/app/drive/[name]/apps/video/shelf/page.tsx to pass `initialSort` and `from`, but the touch points list only the new Reading routes.
Impact: Video's See all URLs now accept `sort` and `from`. Spec item 6 requires this, so the behavior is intended, but the route file is not on the list.
Evidence: The diff of apps/video/shelf/page.tsx adds `initialSort={search.get("sort")}` and `from={search.get("from")}`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the Video shelf route to the touch points.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The diff edits an existing layout spec, frontend/e2e-layout/spec-viewport.spec.ts (the FIXTURES list and FIXTURE_COUNT 22→23), but the touch point names only a new spec file and its fixture.
Impact: An existing layout guard is changed, which the touch point did not announce. No loss of coverage was found, because the new fixture is only added to the list.
Evidence: frontend/e2e-layout/spec-viewport.spec.ts: `"reading-video-faces.html"` is added and `FIXTURE_COUNT = 23`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name spec-viewport.spec.ts in the layout touch point.

</details>

## Not verified

- claude-read: I did not run any test or build.
- claude-read: I did not check whether the sidebar or the layout route checks need edits to driveViews.ts or libraryRowActive.ts for I13.
- claude-read: I did not check whether the commit ef9797b06 alone, as opposed to the branch diff shown, contains these files.
- claude-verify: I could not diff against origin/develop (no git access), so the earlier values (card-grid 6 sites, ShelfBlock in the section-rows allowlist, the removed stale useEffect) are inferred from the current tree and the spec text.
- claude-verify: toolbarMenuHome.test.ts was not inspected.
- claude-verify: Whether smart-folder ids can be reused after deletion was not checked.

TOTAL: 6 findings
