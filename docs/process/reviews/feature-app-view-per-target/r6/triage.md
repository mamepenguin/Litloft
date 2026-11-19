# Triage: r6

## Trajectory

This run:
- claude-read: This round (b533c0999, knowledge cac96f1→f7bdf38) adds no new state. It does add conditions to the same URL-snapshot prediction that r4 introduced and r5 kept, the `switchedFrom` / `switchPending` check that 'the router has not yet shown the replaced URL'. In both Clips (clips.tsx:207) and Notes (NotesPage.tsx:173) the eager replace and the snapshot are now guarded by `next.toString() !== current`, so the prediction is only made when the URL will actually change. In Notes, `switchPending` is now also carried into the `latest` ref (NotesPage.tsx:53-56), and the older note-drop effect consults it (`&& !chosen`, NotesPage.tsx:68). That is one more consumer of the prediction, not a removal. The test harness gains a deferred-navigation mode (`deferNavigation`) that models the transition ordering r5's R3 asked for. The transient-flag design has now been adjusted in r2, r3, r4, r5 and r6. This round narrows it with guards and does not replace it, so the design is still being patched. The guards are small, and I could not find a new defect they introduce.

Earlier runs:
- r2 / claude-read: Only one fix round, 510de1aba, since r1. It removed things and added nothing. In ToolbarMenu's quiet branch it dropped the `truncateValue ? "whitespace-nowrap" : ...` ternary, so the quiet value is always `min-w-[2.5em] truncate` again (ToolbarMenu.tsx:231). It also deleted docs/specs/app-library-filters.md and its three INDEX rows. No new branch, state or prediction was added, so this round does not look like patching the design. The two defects reported below (Notes `switchingFor`, Clips `switchTo`) come from the original per-Target state machinery, not from this round.
- r3 / claude-read: One branch keeps coming back, so this part of the design is being patched. The original change added a branch to the quiet ToolbarMenu value (`truncateValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"`). The r1→r2 fix 510de1aba removed it. In this round, 6665d0c01 adds the same branch back under a new prop, `fullValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"` (ToolbarMenu.tsx:234), passed only by the two shelf-page sort menus. The r2 revision of I20 now asks for that behaviour. The round also inverted an e2e assertion (1a7329834) and then reverted it (7a816bbee), so the expected look of that value changed twice. In Clips, 1e83ebaba widens the predicate that clears `switchTo`: `switchedAway` becomes `switchSettled` and gains a disjunct, `view.view === "home"`. That adds one more condition to state that the original design introduced, not a new state. In Notes, 1e83ebaba only moves `setSwitchingFor(id)` inside the gated callback and adds no branch. Neither fix removed the transient `switchTo` / `switchingFor` flags.
- r4 / claude-read: Yes: the same piece of state is patched again. Clips `switchTo` has now been reshaped in three successive rounds. r2→r3 widened the predicate that clears it (`switchedAway` became `switchSettled`, with a `view.view === "home"` disjunct). This round (191990387 → knowledge b64999b) changes its type from a target id to `{ id, search }`. That adds a snapshot of the URL at the time of the choice, which acts as a prediction that the viewer is 'still on it'. A derived `switchPending` (`switchTo.search === search`) replaces the plain `switchTo !== null` in the effectiveParams, fill-in and switchHref conditions. The round also removed things: the `view.view === "home"` disjunct, and the setting of `switchTo` at all when the choice is made on Home (chooseTarget now sets it only off Home). On net it swaps one condition for another and does not reduce state. The transient flags (`switchTo` in Clips, `switchingFor` in Notes) are still in place. Notes is untouched this round.
- r5 / claude-read: This round removed more state than it added. In Clips, `switchTo: {id, search}` becomes `switchedFrom: string`. The round removes `switchHref`, the id comparison, the `target.status === "ready"` condition and the effect that replaced the URL after the Target became ready. In Notes it removes `switchingFor` and the whole `switchingFor === targetId` replace branch. Both pages now replace the URL eagerly, inside the choice handler, before `choose(id)`. However, the one piece of state left is the URL snapshot prediction that r4 added (`switchPending = snapshot === searchParams.toString()`, meaning "the router has not yet shown the replaced URL"). That prediction carries over unchanged and is now the only mechanism. It assumes the replaced URL always differs from the snapshot, and finding R2 shows a case where it does not. The transient-flag design has been reshaped in r2, r3, r4 and r5. It is simpler this round, but it still depends on commit ordering that the synchronous test router does not model. In Notes, the older note-drop effect (NotesPage.tsx:67-72) was not adapted to the eager replace, and finding R1 follows from that.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/knowledge/frontend/NotesPage.tsx — full: read whole file in repository
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — partial: changed hunks in the supplied diff (most of the file)
- addons/knowledge/frontend/clipsapp/requests.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — partial: rename diff hunks
- addons/knowledge/frontend/library/LibraryList.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/LibraryRail.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/NotesLibrary.tsx — partial: changed hunks in the supplied diff (sort resolution, fill-in, navigate, saveView)
- addons/knowledge/frontend/library/libraryUrl.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/messages/en.json — partial: changed hunks
- addons/knowledge/frontend/messages/ja.json — partial: changed hunks
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — partial: changed hunk
- addons/knowledge/frontend/pages/clips.tsx — partial: lines 120-269 in repository plus all diff hunks
- frontend/e2e-components/app-header-desktop.spec.ts — partial: changed hunk
- frontend/e2e-components/app-header.measure.ts — partial: changed hunks
- frontend/e2e-components/app-header.spec.ts — partial: changed hunks
- frontend/e2e-components/clips-primary-action-desktop.spec.ts — partial: changed hunk
- frontend/e2e-components/clips-primary-action.spec.ts — partial: changed hunk
- frontend/e2e-components/clips-view-menus-desktop.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/clips-view-menus.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/fixtures/appHeader.tsx — partial: changed hunks
- frontend/e2e-components/fixtures/clipsPage.tsx — partial: changed hunks
- frontend/e2e-components/fixtures/notesLibrary.tsx — partial: changed hunks
- frontend/e2e-components/fixtures/videoCardSpacing.tsx — partial: changed hunk
- frontend/e2e-components/notes-view-menus-desktop.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/notes-view-menus.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/projects.ts — partial: changed hunks
- frontend/e2e-components/spec-viewport.spec.ts — partial: changed hunks
- frontend/e2e-components/view-menus-desktop.spec.ts — full: new file, whole content in diff
- frontend/e2e-components/view-menus.spec.ts — full: new file, whole content in diff
- frontend/e2e-layout/fixtures/reading-video-faces.html — partial: changed hunks
- frontend/e2e-layout/fixtures/toolbar-menu.html — partial: changed hunk
- frontend/e2e-layout/fixtures/video-app.html — partial: changed hunks
- frontend/e2e-layout/reading-video-faces.spec.ts — partial: changed hunk
- frontend/src/components/ToolbarMenu.tsx — partial: changed hunks in the supplied diff
- frontend/src/components/appshell/ViewMenus.tsx — full: new file, whole content in diff
- frontend/src/components/readingapp/LibraryControls.tsx — partial: changed hunks
- frontend/src/components/readingapp/LibraryFace.tsx — partial: changed hunks
- frontend/src/components/readingapp/ReadingApp.tsx — partial: changed hunks
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: changed hunks
- frontend/src/components/readingapp/labels.ts — partial: changed hunks
- frontend/src/components/readingapp/useReadingApp.ts — partial: changed hunks
- frontend/src/components/videoapp/LibraryControls.tsx — partial: changed hunks
- frontend/src/components/videoapp/LibraryFace.tsx — partial: changed hunks
- frontend/src/components/videoapp/VideoApp.tsx — partial: changed hunks
- frontend/src/components/videoapp/VideoPagedGrid.tsx — full: new file, whole content in diff
- frontend/src/components/videoapp/VideoShelfPage.tsx — partial: changed hunks
- frontend/src/components/videoapp/labels.ts — partial: changed hunks
- frontend/src/components/videoapp/useVideoApp.ts — partial: changed hunks
- frontend/src/lib/appPrefs.ts — partial: changed hunks
- frontend/src/lib/formatMonth.ts — full: new file, whole content in diff
- frontend/src/messages-core/en.json — partial: changed hunks
- frontend/src/messages-core/ja.json — partial: changed hunks

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: changed hunks including the deferNavigation re-export
- addons/knowledge/frontend/__tests__/clipsFrame.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsPage.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsTargetChangeOnHome.test.tsx — full: whole content in diff, including this round's new case
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: new file in diff, read Target-change cases
- addons/knowledge/frontend/__tests__/notesApp.home.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesAppHarness.tsx — partial: changed hunks (deferNavigation)
- addons/knowledge/frontend/__tests__/notesFrame.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/notesTargetChangeWhileEditing.test.tsx — full: whole content in diff, including this round's deferred case
- addons/knowledge/frontend/__tests__/notesViewPerTarget.test.tsx — partial: new file in diff, read Target-change cases
- addons/knowledge/frontend/__tests__/viewMenusJa.test.tsx — partial: new file in diff, skimmed
- addons/knowledge/frontend/clipsapp/__tests__/clipsUrl.test.ts — partial: changed hunks
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — partial: changed hunks
- addons/knowledge/frontend/library/__tests__/NotesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/library/__tests__/libraryUrl.test.ts — partial: changed hunks
- frontend/src/components/__tests__/ToolbarMenu.test.tsx — partial: changed hunks
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: changed hunks
- frontend/src/components/__tests__/toolbarMenuHome.test.ts — partial: changed hunk
- frontend/src/components/__tests__/viewMenus.wording.test.tsx — partial: new file in diff, skimmed
- frontend/src/components/readingapp/__tests__/ReadingApp.library.test.tsx — partial: changed hunks
- frontend/src/components/readingapp/__tests__/ReadingApp.targetView.test.tsx — partial: new file in diff, skimmed
- frontend/src/components/readingapp/__tests__/ReadingShelfPage.continueOrder.test.tsx — partial: changed hunks
- frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx — partial: changed hunks
- frontend/src/components/videoapp/__tests__/VideoApp.targetView.test.tsx — partial: new file in diff, skimmed
- frontend/src/components/videoapp/__tests__/VideoApp.test.tsx — partial: changed hunks
- frontend/src/components/videoapp/__tests__/VideoApp.viewResolution.test.tsx — partial: new file in diff, skimmed
- frontend/src/components/videoapp/__tests__/VideoShelfPage.continueOrder.test.tsx — partial: changed hunks
- frontend/src/lib/__tests__/appPrefs.targetView.test.ts — partial: new file in diff, skimmed
- frontend/src/lib/__tests__/appPrefs.test.ts — partial: changed hunks

## Findings

A: 0
B: 1
C: 0

### claude-read:R1 — bucket B, LOW, open

Claim: The new deferred-navigation harness mode is used by only one Notes test, so no test exercises a Clips Target change, or Notes' no-op-replace path, under transition-like router ordering.
Impact: The Clips Target-change path (r4 R1/V1, fixed in r5) depends on the same ordering assumption that broke Notes in r5, and a regression there would not fail vitest. Notes' new `next !== current` guard is also tested only indirectly.
Evidence: clipsTargetChangeOnHome.test.tsx imports `deferNavigation` but only calls `deferNavigation(false)` in afterEach; no Clips test calls `deferNavigation(true)`. notesTargetChangeWhileEditing.test.tsx has the single deferred case (switching to All notes with `note` and `sort` in the URL). No Notes test chooses a Target from a Library URL with neither `sort` nor `note`, which is the r5 R2 path for Notes.
Repro: Mutation by reading: in clips.tsx, make `switchPending` false while the URL is still the snapshot, for example by clearing `switchedFrom` right after `router.replace` as r4 did. Under the synchronous harness every Clips test still passes, because the URL change and the flag change land in the same render. Second mutation: remove the `next.toString() !== current.toString()` guard in NotesPage.tsx:173. No Notes test starts from a URL without `sort`/`note`, so nothing fails.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Run the Clips Library Target-change test (clipsViewPerTarget I4) and a request-capturing variant under `deferNavigation(true)`, asserting that no shelves request carries the previous Target's group/sort. Add a Notes case that chooses a Target from `?view=all` after an empty Target.

</details>

## Not verified

- claude-read: I ran no tests or browsers. Every conclusion is traced by reading the code.
- claude-read: I did not confirm that `useEffect` callbacks in one component run in declaration order within a commit in this React version. The `!chosen` fix depends on the `latest` effect running before the Target effect.
- claude-read: I did not trace NotesLibrary's note-replacement effects under deferred navigation during a Target switch.
- claude-read: I did not confirm that the deferred harness's setTimeout ordering matches Next 16's action-queue ordering for two back-to-back replaces.
- claude-read: Most product files were read only through the supplied diff hunks.
- claude-verify: No tests were run; every conclusion comes from reading the code.
- claude-verify: I did not read clipsViewPerTarget.test.tsx, clipsLibrary.test.tsx, clipsPage.test.tsx or clipsFrame.test.tsx in full. The grep shows none of them calls deferNavigation(true), but I did not check whether any of them takes Clips' no-op-replace path under the synchronous harness.
- claude-verify: I did not trace pages/clips.tsx to confirm that the r5 R2 guard there matches the Notes one.

TOTAL: 1 findings
