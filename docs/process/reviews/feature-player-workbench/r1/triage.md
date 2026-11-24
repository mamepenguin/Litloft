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

Note: App-wide provider hydration no longer remounts the page subtree (Sidebar, Theme and Profile providers). Neither the spec nor its invariants describe this.; SlotEntryRenderer's onRendered signal is a new pending state for addon entries. Revised I1 states the rule for player-side, but the shared component now carries it for any caller that passes onRendered.
- claude-read: App-wide provider hydration no longer remounts the page subtree (Sidebar, Theme and Profile providers). Neither the spec nor its invariants describe this.
- claude-read: SlotEntryRenderer's onRendered signal is a new pending state for addon entries. Revised I1 states the rule for player-side, but the shared component now carries it for any caller that passes onRendered.
- claude-verify: The app-wide provider changes (Sidebar/Theme/Profile) change hydration behaviour for every page, not only the file detail page.

### unspecified_behavior

Note: The app-wide provider changes (Sidebar/Theme/Profile) change hydration behaviour for every page, not only the file detail page.
- claude-read: App-wide provider hydration no longer remounts the page subtree (Sidebar, Theme and Profile providers). Neither the spec nor its invariants describe this.
- claude-read: SlotEntryRenderer's onRendered signal is a new pending state for addon entries. Revised I1 states the rule for player-side, but the shared component now carries it for any caller that passes onRendered.
- claude-verify: The app-wide provider changes (Sidebar/Theme/Profile) change hydration behaviour for every page, not only the file detail page.

## Findings

A: 0
B: 5
C: 0

### claude-read:TP-1 — bucket B, MEDIUM, open

Claim: The change rewrites the app-wide SidebarProvider, ThemeProvider and ProfileProvider so they no longer render bare children before hydration, and none of the three is in the touch-point list.
Impact: These providers wrap every page, not only player files. The diff removes the post-hydration remount of the whole app subtree. Any component that relied on that remount now keeps its first-render state. The r5fix review records one such effect: an attribute-only hydration mismatch now stays stale. So the change reaches every route, outside the declared scope of SPEC-CORE-085..090.
Evidence: frontend/src/components/SidebarProvider.tsx:100-117 drops `if (!hydrated) return <>{children}</>` and exposes `hydrated && isOpen` and `hydrated && isOverlay`. ThemeProvider.tsx drops the `mounted` state and its bare-children branch. ProfileProvider.tsx replaces `mounted` with a `wroteNickname` ref so a child's mount-effect write is not overwritten. A new test, frontend/src/components/__tests__/SidebarProviderHydration.test.tsx, covers this. None of these paths appears in Touch points, and r1/classification.json lists all four among zones_touched.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the three providers and their hydration test to the touch points, with the reason (the remount broke I4 single-mount on first load), or split them into their own change.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The shared `SlotEntryRenderer` in AddonSlot.tsx gains an `onRendered` prop and a `RenderedSignal` child, and AddonSlot.tsx is not in the touch-point list.
Impact: `SlotEntryRenderer` renders entries for every slot that uses it, not only `player-side`. The new signal decides whether a pending `player-side` entry counts as available (revised I1). An entry whose module fails to load never signals, so it never gets a toggle. That rule now lives in a shared component that the declared scope does not name.
Evidence: frontend/src/components/AddonSlot.tsx:59-118 adds `onRendered` and `RenderedSignal` inside `<Suspense>`. useSlotAvailability.ts adds `isPending`/`renderedFor`; that file is listed, but AddonSlot.tsx is not.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List frontend/src/components/AddonSlot.tsx (SlotEntryRenderer `onRendered`) in the touch points.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: docs/addons/media-import.md is changed, and it is not among the nine documents the touch points and §9 list.
Impact: No user-facing defect. The doc now says the `.loft` panel is in the Info tab under the title, which follows the D-14 revision of I7. The touch-point list did not anticipate this doc.
Evidence: The diff changes the media-import.md heading from 'Below the player' to 'Where the details are'. r1/classification.json lists docs/addons/media-import.md. The Touch points 'Docs, all as §9 lists' omits it.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add docs/addons/media-import.md to the touch-point docs list.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: The `loft-metadata` slot moves from under the player into the Info tab on the canonical page, through a new `loftMetadata` prop on FileMetaBlock, a new `showMetadataAside` prop on MediaPlayerBlock, a new `-mx-4 md:mx-0` inset on the collection aside, and a new globals.css grid rule. The touch points' descriptions of those files do not mention any of this.
Impact: A `.loft` file's channel, date and description move to a different place on every surface. The commit under review, 7f2b9ae52, changes this aside's inset on the collection surface. The work is covered by the D-14 revision of I7, but the touch-point descriptions of FileDetailContainer, MediaPlayerBlock and FileMetaBlock list other items: description, layoutToggle, preview-actions and the clamp.
Evidence: FileDetailContainer.tsx builds `loftMetadata` (ridesShell && loft && hasSlot). FileMetaBlock.tsx renders it under `data-inspector-header-loft-metadata`. MediaPlayerBlock.tsx adds `showMetadataAside` and, when framed, the `-mx-4 md:mx-0` aside class. globals.css adds a `[data-inspector-header-loft-metadata]` grid-area rule. The new LoftMetadataPlacement.test.tsx and collection-workbench-metrics-desktop.spec.ts (the 390px inset) test it. The ADDON-DEVELOPMENT.md changelog adds a third row, while §9 says two.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Extend the touch points: the `loft-metadata` placement in FileDetailContainer, FileMetaBlock, MediaPlayerBlock and globals.css, plus LoftMetadataPlacement.test.tsx.

</details>

### claude-read:TP-5 — bucket B, INFO, open

Claim: Several test and test-registration files are added or changed outside the touch-point list: e2e-components/projects.ts, spec-viewport.spec.ts, componentFixtureParity.test.tsx, src/__tests__/mediaLayoutRemoved.test.ts, and the new FileDetail tests Workbench, WorkbenchCollection, WorkbenchPendingEntry, LoftMetadataPlacement and workbenchHelpers.ts.
Impact: None for users. These are scaffolding for the planned new real-browser and unit cases, and the list simply does not name them. FileDetailContent.test.tsx, which the list names under scaffolding, is also changed.
Evidence: r1/classification.json zones_touched includes all of these paths. The Touch points name only the generic 'new real-browser cases' and the harness/setup files.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the new test files and the e2e project registrations in the touch points.

</details>

## Not verified

- claude-read: I could not run git, so I could not isolate the files touched by commit 7f2b9ae52 alone from the whole-branch diff provided. My findings are against the diff as given.
- claude-read: I ran no tests (unit or e2e).
- claude-read: I did not check whether the listed but unchanged e2e scenes-section specs still pass now that scenes has moved to player-side.
- claude-read: I did not check consumers of ThemeProvider and ProfileProvider for behaviour that depends on the old bare-children first render.
- claude-verify: The base (origin/develop) side of each diff. I cannot run git, so the removed code was inferred from comments and review docs.
- claude-verify: Whether the tests pass.
- claude-verify: The full contents of ProfileProvider.tsx and of the new test files.

TOTAL: 5 findings
