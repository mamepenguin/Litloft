# Triage: r4

## Trajectory

This run:
- claude-read: Yes: the same piece of state is patched again. Clips `switchTo` has now been reshaped in three successive rounds. r2→r3 widened the predicate that clears it (`switchedAway` became `switchSettled`, with a `view.view === "home"` disjunct). This round (191990387 → knowledge b64999b) changes its type from a target id to `{ id, search }`. That adds a snapshot of the URL at the time of the choice, which acts as a prediction that the viewer is 'still on it'. A derived `switchPending` (`switchTo.search === search`) replaces the plain `switchTo !== null` in the effectiveParams, fill-in and switchHref conditions. The round also removed things: the `view.view === "home"` disjunct, and the setting of `switchTo` at all when the choice is made on Home (chooseTarget now sets it only off Home). On net it swaps one condition for another and does not reduce state. The transient flags (`switchTo` in Clips, `switchingFor` in Notes) are still in place. Notes is untouched this round.

Earlier runs:
- r2 / claude-read: Only one fix round, 510de1aba, since r1. It removed things and added nothing. In ToolbarMenu's quiet branch it dropped the `truncateValue ? "whitespace-nowrap" : ...` ternary, so the quiet value is always `min-w-[2.5em] truncate` again (ToolbarMenu.tsx:231). It also deleted docs/specs/app-library-filters.md and its three INDEX rows. No new branch, state or prediction was added, so this round does not look like patching the design. The two defects reported below (Notes `switchingFor`, Clips `switchTo`) come from the original per-Target state machinery, not from this round.
- r3 / claude-read: One branch keeps coming back, so this part of the design is being patched. The original change added a branch to the quiet ToolbarMenu value (`truncateValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"`). The r1→r2 fix 510de1aba removed it. In this round, 6665d0c01 adds the same branch back under a new prop, `fullValue ? "whitespace-nowrap" : "min-w-[2.5em] truncate"` (ToolbarMenu.tsx:234), passed only by the two shelf-page sort menus. The r2 revision of I20 now asks for that behaviour. The round also inverted an e2e assertion (1a7329834) and then reverted it (7a816bbee), so the expected look of that value changed twice. In Clips, 1e83ebaba widens the predicate that clears `switchTo`: `switchedAway` becomes `switchSettled` and gains a disjunct, `view.view === "home"`. That adds one more condition to state that the original design introduced, not a new state. In Notes, 1e83ebaba only moves `setSwitchingFor(id)` inside the gated callback and adds no branch. Neither fix removed the transient `switchTo` / `switchingFor` flags.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R1 is bucket A or BLOCKER
- open finding claude-verify:V1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/knowledge/frontend/NotesPage.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — partial: changed hunks in the supplied diff (most of the file)
- addons/knowledge/frontend/clipsapp/requests.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — partial: rename diff hunks
- addons/knowledge/frontend/library/LibraryList.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/LibraryRail.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/NotesLibrary.tsx — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/library/libraryUrl.ts — partial: changed hunks in the supplied diff
- addons/knowledge/frontend/messages/en.json — partial: changed hunks
- addons/knowledge/frontend/messages/ja.json — partial: changed hunks
- addons/knowledge/frontend/notesapp/RecentlyUpdatedSection.tsx — partial: changed hunk
- addons/knowledge/frontend/pages/clips.tsx — full: read whole file in repository
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
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: changed hunk; grep for navigation
- addons/knowledge/frontend/__tests__/clipsFrame.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsPage.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/clipsTargetChangeOnHome.test.tsx — full: whole content in diff, including this round's new case
- addons/knowledge/frontend/__tests__/clipsViewPerTarget.test.tsx — partial: new file in diff, skimmed
- addons/knowledge/frontend/__tests__/notesApp.home.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesFrame.test.tsx — partial: changed hunk
- addons/knowledge/frontend/__tests__/notesLibrary.test.tsx — partial: changed hunks
- addons/knowledge/frontend/__tests__/notesTargetChangeWhileEditing.test.tsx — full: whole content in diff
- addons/knowledge/frontend/__tests__/notesViewPerTarget.test.tsx — partial: new file in diff, skimmed
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

## Needs a human

### unspecified_behavior

Note: The spec does not say which view is shown when a chosen Clips Target falls back to `default` while the URL still holds the previous Target's `group`/`sort`. I13 says to leave the URL as it is, which by I3 shows the previous Target's view; I4 and I6 imply the `default` Target's view.
- claude-verify: The spec does not say which view is shown when a chosen Clips Target falls back to `default` while the URL still holds the previous Target's `group`/`sort`. I13 says to leave the URL as it is, which by I3 shows the previous Target's view; I4 and I6 imply the `default` Target's view.

## Findings

A: 2
B: 1
C: 0

### claude-read:R1 — bucket A, LOW, open

Claim: After a Target change, Clips and Notes clear their transient switch flag in the same effect that calls `router.replace`. In the real Next.js app router the replace is a transition and commits after the flag update, so one render shows the new Target with the previous Target's URL `group`/`sort` and sends a Library request with them.
Impact: The viewer chooses another Target on the Clips Library, or on the Notes Library. The Library briefly redraws with the old Target's grouping and sort, sends a shelves or list request with them, and then switches to the new Target's view when the URL update lands. That is a flicker plus one wasted request under a view that is not the one finally shown.
Evidence: clips.tsx:213-221: `router.replace(switchHref); setSwitchTo(null);`. On the next commit `switchTo` is null, so `switchPending` (clips.tsx:154) is false and `effectiveParams` (155-162) keeps the old URL's `group`/`sort`. `readClipsView` (163) then yields the previous Target's view. `bodyDrawn` is true, and `Library` (293-303) mounts `useGroupShelves` with that view, which fires a request. `fillHref` (256-259) stays null because the old URL is readable. Notes has the same pattern: NotesPage.tsx `setSwitchingFor(null); router.replace(...)`, after which `ignoreUrlSort` is false and NotesLibrary reads the URL's old sort for its list request. The test harness hides this. notesAppHarness.tsx:44-79 implements replace as a synchronous `useSyncExternalStore` update, so the search change and the flag change land in the same render.
Repro: not_reproduced. Traced under Next.js semantics, where app-router push/replace run inside startTransition and a plain setState in the same effect commits first. Store {"sf-work":{"group":"none"}}, open `?view=all&group=folder&sort=title`, choose Work. Expected requests are by=all/none only. By the trace, one `by=folder&sort=title` shelves request under Work's conditions goes out between the switch render and the URL commit.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep the flag until the URL actually reflects the replacement: clear `switchTo` only when `search` changes, which the `!switchPending` branch of `switchSettled` already does. Drop the eager `setSwitchTo(null)` after `router.replace`. Do the same for `switchingFor` in NotesPage.

</details>

### claude-verify:V1 — bucket A, LOW, open

Claim: Take a Clips Library whose Target is a member Smart Folder that evaluates to tooLarge or failed. On the commit where that Target first becomes ready as `default`, `switchTo` is still set and the URL is unchanged, so `switchPending` is true. `effectiveParams` therefore strips `group`/`sort`, and `Library` mounts with the `default` Target's stored view and sends a grouped-shelves request with it. The effect then clears `switchTo` without a rewrite. The next render reads the old URL's `group`/`sort`, aborts that request and sends another with the previous Target's values. The first request carries a grouping or sort that is not the one finally shown.
Impact: An extra Library request goes out with a grouping or sort that is never the one shown, and a loading or wrong-view frame can flash. This is an I8 violation in normal use: picking a member Target that turns out to be too large while on the Library.
Evidence: useNotesTarget.ts:127,138,162-166: when the member is unusable, the target is `{status:'ready', key:'default'}` and `selectedId` is 'default'. clips.tsx:154: `switchPending` is true while `switchTo.search === search`. clips.tsx:155-163: `group`/`sort` are stripped, so `view` is the `default` Target's resolved view. clips.tsx:254-255,289-303: `bodyDrawn` is true and `Library` renders, because a new `useScopedLoad` scope gives null data (useScopedLoad.ts:33-37), so `targetHasNone` is false. useGroupedShelves.ts:44-66: the request is sent in an effect keyed on the scope, which includes `by` and `sort`. clips.tsx:211-216: `switchSettled` is true because `targetId` ('default') !== `switchTo.id`. The effect only calls `setSwitchTo(null)`, so the next render reads the old URL's `group`/`sort` (clips.tsx:154-163) and the scope changes again.
Repro: Traced in code, not run. On drive D, on Target P (not `default`), choose group=folder. The URL is ?view=all&group=folder&sort=added_desc. The `default` Target's stored group is tag. Choose a member Smart Folder M that evaluates to tooLarge. While M is evaluated the body is a skeleton. When the evaluation answers, the first committed render mounts GroupShelves with by=tag and sends that request. The next render switches to by=folder from the URL, aborts the first request and sends a second. This happens only when P is not `default` and the URL's view differs from the `default` Target's stored view.
Introduced: unverified
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> When the switch settles because a different Target came into force, decide which values apply in the same render that first shows that Target, before Library mounts. One way is to compute `switchSettled` for the fallback case during render and stop stripping the URL then. Another is to rewrite the URL to the `default` Target's view, if I13 is revised.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: When a Clips Target is chosen on the Library and the chosen member Target then evaluates to `tooLarge`/`failed`, `default` is put in force and `switchTo` is cleared without a rewrite. The URL keeps the previous Target's `group`/`sort`.
Impact: The viewer on Target Y picks member Target X, and X turns out unusable. The page shows `default`, but with Y's grouping and sort from the URL instead of default's stored view. Back and forth then mixes Y's view into default's Library.
Evidence: useNotesTarget.ts:162-166: `selectedId` becomes 'default' once `unusableMember` is true. clips.tsx:211-212: `switchSettled` is true when `target.status === "ready" && targetId !== switchTo.id`, so the effect at 213-217 only clears `switchTo`. effectiveParams then keeps the old `group`/`sort`.
Repro: not_reproduced. Traced: store {"default":{"group":"month"}}, URL `?view=all&group=folder&sort=title` under sf-work. Choose a member Target whose evaluation answers tooLarge. By the trace the page shows default with group=folder.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I ran no tests. R1 depends on the Next.js app router committing router.replace in a transition after a plain setState, which I did not confirm in this repository's Next version.
- claude-read: I did not re-read NotesPage.tsx in the repository this round; the Notes half of R1 relies on the supplied diff.
- claude-read: I read most product files only through the supplied diff hunks; only clips.tsx and useNotesTarget.ts (lines 100-197) were read in the repository.
- claude-verify: The real Next.js commit ordering (transition vs. default-lane update) was traced in source, not observed in a browser.
- claude-verify: Did not check whether an e2e suite exercises Target switching on the Clips or Notes Library with the real router.
- claude-verify: Did not diff against origin/develop, so whether R1/R2/V1 were introduced by this branch is unverified.
- claude-verify: Did not review the Video and Reading apps for the same pattern.

TOTAL: 3 findings
