# Triage: r5

## Trajectory

This run:
- claude-read: This round removed more state than it added. In Clips, `switchTo: {id, search}` becomes `switchedFrom: string`. The round removes `switchHref`, the id comparison, the `target.status === "ready"` condition and the effect that replaced the URL after the Target became ready. In Notes it removes `switchingFor` and the whole `switchingFor === targetId` replace branch. Both pages now replace the URL eagerly, inside the choice handler, before `choose(id)`. However, the one piece of state left is the URL snapshot prediction that r4 added (`switchPending = snapshot === searchParams.toString()`, meaning "the router has not yet shown the replaced URL"). That prediction carries over unchanged and is now the only mechanism. It assumes the replaced URL always differs from the snapshot, and finding R2 shows a case where it does not. The transient-flag design has been reshaped in r2, r3, r4 and r5. It is simpler this round, but it still depends on commit ordering that the synchronous test router does not model. In Notes, the older note-drop effect (NotesPage.tsx:67-72) was not adapted to the eager replace, and finding R1 follows from that.

Earlier runs:
- r2 / claude-read: Only one fix round, 510de1aba, since r1. It removed things and added nothing. In ToolbarMenu's quiet branch it dropped the `truncateValue ? "whitespace-nowrap" : ...` ternary, so the quiet value is always `min-w-[2.5em] truncate` again (ToolbarMenu.tsx:231). It also deleted docs/specs/app-library-filters.md and its three INDEX rows. No new branch, state or prediction was added, so this round does not look like patching the design. The two defects reported below (Notes `switchingFor`, Clips `switchTo`) come from the original per-Target state machinery, not from this round.
- r3 / claude-read: One branch keeps coming back, so this part of the design is being patched. The original change added a branch to the quiet ToolbarMenu value (`truncateValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"`). The r1→r2 fix 510de1aba removed it. In this round, 6665d0c01 adds the same branch back under a new prop, `fullValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"` (ToolbarMenu.tsx:234), passed only by the two shelf-page sort menus. The r2 revision of I20 now asks for that behaviour. The round also inverted an e2e assertion (1a7329834) and then reverted it (7a816bbee), so the expected look of that value changed twice. In Clips, 1e83ebaba widens the predicate that clears `switchTo`: `switchedAway` becomes `switchSettled` and gains a disjunct, `view.view === "home"`. That adds one more condition to state that the original design introduced, not a new state. In Notes, 1e83ebaba only moves `setSwitchingFor(id)` inside the gated callback and adds no branch. Neither fix removed the transient `switchTo` / `switchingFor` flags.
- r4 / claude-read: Yes: the same piece of state is patched again. Clips `switchTo` has now been reshaped in three successive rounds. r2→r3 widened the predicate that clears it (`switchedAway` became `switchSettled`, with a `view.view === "home"` disjunct). This round (191990387 → knowledge b64999b) changes its type from a target id to `{ id, search }`. That adds a snapshot of the URL at the time of the choice, which acts as a prediction that the viewer is 'still on it'. A derived `switchPending` (`switchTo.search === search`) replaces the plain `switchTo !== null` in the effectiveParams, fill-in and switchHref conditions. The round also removed things: the `view.view === "home"` disjunct, and the setting of `switchTo` at all when the choice is made on Home (chooseTarget now sets it only off Home). On net it swaps one condition for another and does not reduce state. The transient flags (`switchTo` in Clips, `switchingFor` in Notes) are still in place. Notes is untouched this round.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R1 is bucket A or BLOCKER
- open finding claude-read:R2 is bucket A or BLOCKER

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
- addons/knowledge/frontend/library/NotesLibrary.tsx — partial: changed hunks in the supplied diff (sort resolution, fill-in, navigate)
- addons/knowledge/frontend/library/libraryUrl.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/messages/en.json — partial: changed hunks
- addons/knowledge/frontend/messages/ja.json — partial: changed hunks
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — partial: changed hunk
- addons/knowledge/frontend/pages/clips.tsx — partial: lines 120-279 in repository plus all diff hunks
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
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/clipsFrame.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsPage.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsTargetChangeOnHome.test.tsx — full: whole content in diff
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: new file in diff, read Target-change cases
- addons/knowledge/frontend/__tests__/notesApp.home.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesFrame.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/notesTargetChangeWhileEditing.test.tsx — full: whole content in diff
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

A: 2
B: 1
C: 0

### claude-read:R1 — bucket A, MEDIUM, open

Claim: In Notes, under the real Next.js router a Target change made while a note is in the URL ends on the previous Target's `sort`. The note-drop effect at NotesPage.tsx:67-72 still reads the old URL and issues a second replace that carries the old sort, and that replace lands after the eager sort-less one.
Impact: At 1024px and wider the Notes Library almost always has `note` in the URL, because the first row is filled in. Choosing another Target that is ready at once (All notes, a filter Smart Collection, a collection) leaves the list and the 並び順 menu on the previous Target's sort, and a list request goes out with it. Switching back and forth does not show each Target's own sort. This is the r2 R1 symptom again, now on the ungated path.
Evidence: NotesPage.tsx:166-176: inside the handler, `setSwitchedFrom(old)`, then `router.replace(?…without sort and note)`, then `notesTarget.choose(id)`. In Next 16 `router.replace` runs in `startTransition` (confirmed by the r4 verifier, app-router-instance.js:339-341). The plain updates therefore commit first: `targetId` is new, while `searchParams` is still the old URL with `note` and `sort`. The effect at NotesPage.tsx:54-56 sets `latest.current` to the old params. The effect at 57-73 then sees `previous !== targetId && inLibrary && current.has("note")` and calls `router.replace(libraryHref(..., {note:null}, isLibrarySort(raw) ? raw : …))`. Here `raw` is the old Target's sort. This second navigation is queued after the first and wins, so the final URL is `?view=all&…&sort=<old>`. `switchPending` becomes false (NotesPage.tsx:45), `ignoreUrlSort` is false, and NotesLibrary.tsx:76-78 takes the URL's old sort. The harness hides this: notesAppHarness applies replace synchronously, so by the time the effect runs `current` no longer has `note`. That is why notesViewPerTarget's I4 Target-change test and notesTargetChangeWhileEditing pass.
Repro: not_reproduced. Traced under transition semantics. Store {"sf-trip":{"sort":"title"}}, open `?view=all&folder=Journal&note=n1&sort=created` on default at 1440px, choose Trip (a filter smart folder, ready at once). The URL first becomes `?view=all&folder=Journal`, then `?view=all&folder=Journal&sort=created`. The list shows Date Created, not Title.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Skip the note-drop replace while a switch is pending: the eager replace already drops `note`. Or compute it from the replaced URL rather than from `latest.current`.

</details>

### claude-read:R2 — bucket A, LOW, open

Claim: In Clips and Notes, a Target chosen on a Library URL that already lacks the view parameters replaces the URL with an identical one. The `switchedFrom` snapshot then equals the current search and stays pending, which suppresses the fill-in until the URL changes for another reason.
Impact: Example: the viewer is on a Clips Library reached by the Library tab (`?view=all`) while the Target is empty, so no fill-in ran. They choose a non-empty Target. The Library body is drawn with the new Target's view, but the URL never gains `group`/`sort`, so Back after the next menu choice does not return to this view. Notes behaves the same way at the phone list layout when the previous Target was empty (`?view=all` with no `sort` and no `note`): the URL keeps no `sort`.
Evidence: clips.tsx:203-208: `next` deletes `group` and `sort`. If neither was present, `${pathname}?${next}` equals the current URL, and `switchedFrom = search`. clips.tsx:154: `switchPending` stays true while the search is unchanged. The clearing effect at :215-218 never fires. clips.tsx:253-256: `fillHref` requires `!switchPending`, so it stays null. In Notes, NotesPage.tsx:168-173 deletes `sort` and `note` in the same way. `ignoreUrlSort={switchPending}` (:127) stays true, and NotesLibrary's `fillHref` requires `!ignoreUrlSort`. Clips' body is drawn in this state because `bodyDrawn` (:251-252) depends only on the Target being ready and non-empty.
Repro: not_reproduced. Traced: Clips under Target X with no clips, Library tab (`?view=all`, empty state, no fill-in). Choose Target Y, which has clips. The Library draws Y's stored view, and the URL stays `?view=all` indefinitely.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Set `switchedFrom` and replace only when `next.toString() !== search`. Otherwise let the normal fill-in run.

</details>

### claude-read:R3 — bucket B, LOW, open

Claim: No test models the transition ordering that this round's design depends on (the replace landing after the new Target is in force), so R1 and any regression in that ordering stay invisible to vitest.
Impact: A switch that is correct under the synchronous harness can still send a request or show a view from the previous Target in the real app.
Evidence: The comments at clips.tsx:134-135 and NotesPage.tsx:41-42 state the ordering assumption. notesAppHarness and clipsAppHarness implement replace synchronously (r4 verifier). The new tests in clipsTargetChangeOnHome.test.tsx and notesTargetChangeWhileEditing.test.tsx assert only the final URL under that harness.
Repro: Mutation by reading: delete the note-drop branch condition `current.has("note")` change, or swap the order of `router.replace` and `notesTarget.choose`. The harness result is the same, so no test fails.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Give the harness an option that defers router.replace to a later act (a transition-like queue), and run the Target-change tests under it.

</details>

## Not verified

- claude-read: I ran no tests or browsers. R1 relies on the r4 verifier's reading of Next 16's startTransition-wrapped router.replace and on React flushing discrete-lane passive effects before the transition renders.
- claude-read: I did not confirm that useNotesTarget.choose makes a filter Smart Collection or collection ready in the same commit. If it goes through lookingUp, R1 does not occur for that Target.
- claude-read: I did not check whether Next treats a replace to an identical URL as a no-op that could change useSearchParams identity.
- claude-read: Most product files were read through the supplied diff hunks only.
- claude-verify: R1 was not reproduced in a real browser running Next 16. I relied on reading app-router-instance.js and on how React schedules passive effects after a discrete event.
- claude-verify: The Next action queue's ordering of two back-to-back same-route replaces was not traced in its source.
- claude-verify: Member-evaluation Targets (lookingUp after choose) were not traced for R1; there the replace may commit first and avoid the bug.

TOTAL: 3 findings
