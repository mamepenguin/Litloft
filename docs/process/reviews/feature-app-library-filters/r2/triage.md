# Triage: r2

## Trajectory

This run:
- claude-read: Fix round ae05085 patches rather than redesigns. The earlier round blanked the See all label and added a label-first branch for folder titles. This round adds a matching fallback branch for tags (`shelf.label || shelf.key`) instead of passing the key as the label again. In ToolbarMenu it removes the `changeOpen` callback path and restores the functional toggle, but it adds a ref (`reported`) and an effect that track the last reported open state, which is new state. Commit 10bcd9ce5 only records the review run and adds no code.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:R1 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: Diff hunks only.
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — partial: Diff hunks only.
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — full: Read the whole file.
- addons/knowledge/frontend/clipsapp/requests.ts — full: Read the whole file.
- addons/knowledge/frontend/clipsapp/useGroupedShelves.ts — partial: Diff hunks only.
- addons/knowledge/frontend/clipsapp/useShelfData.ts — partial: Diff hunks only.
- addons/knowledge/frontend/messages/en.json — partial: Diff hunk.
- addons/knowledge/frontend/messages/ja.json — partial: Diff hunk.
- addons/knowledge/frontend/pages/clips.tsx — full: Read the whole file.
- backend/app/routers/drives.py — partial: Diff hunks: TagCountsQuery and the full tag-counts routes and _tag_counts.
- backend/app/routers/shelves.py — partial: Lines 80-545, which hold every changed hunk and the _shelves function.
- backend/app/services/watch_state.py — full: New file, whole content in the diff.
- frontend/e2e-components/library-filters-desktop.spec.ts — full: New file in the diff.
- frontend/e2e-components/library-filters.spec.ts — full: New file in the diff.
- frontend/e2e-components/projects.ts — partial: Diff hunk.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Diff hunks.
- frontend/e2e-layout/fixtures/reading-video-faces.html — partial: Diff hunks.
- frontend/e2e-layout/reading-video-faces.spec.ts — partial: Diff hunk.
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — full: Read the whole file.
- frontend/src/components/ToolbarMenu.tsx — partial: Lines 160-309 (the whole ToolbarMenu function) and the props hunk.
- frontend/src/components/appshell/FilterMenus.tsx — full: New file in the diff.
- frontend/src/components/appshell/ViewMenus.tsx — partial: LibraryControlRow hunk.
- frontend/src/components/appshell/libraryFilters.ts — full: New file in the diff.
- frontend/src/components/readingapp/LibraryControls.tsx — partial: Removal hunk.
- frontend/src/components/readingapp/LibraryFace.tsx — partial: Diff hunks.
- frontend/src/components/readingapp/useReadingApp.ts — partial: Diff hunks.
- frontend/src/components/videoapp/LibraryFace.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/VideoPagedGrid.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/VideoShelfPage.tsx — full: Read the whole file.
- frontend/src/components/videoapp/labels.ts — full: Read the whole file.
- frontend/src/components/videoapp/shelfLinks.ts — full: Whole file in the diff.
- frontend/src/components/videoapp/useVideoApp.ts — partial: Diff hunks and the grep of chooseTarget.
- frontend/src/lib/api.ts — partial: getTagCounts hunk.
- frontend/src/lib/memberTarget.ts — partial: Diff hunks.
- frontend/src/messages-core/en.json — partial: Diff hunks and the watch keys grep.
- frontend/src/messages-core/ja.json — partial: Diff hunks.
- frontend/src/test/setup.ts — partial: Diff hunks.

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: Diff hunk.
- addons/knowledge/frontend/__tests__/clipsLibraryFilters.test.tsx — full: New file in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — partial: Diff hunk.
- backend/tests/test_tag_counts.py — full: New file in the diff.
- backend/tests/test_tag_counts_order.py — full: New file in the diff.
- backend/tests/test_watched_ranges.py — partial: Diff hunk.
- frontend/src/__tests__/popup-dismissal.test.ts — partial: Diff hunk.
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: Diff hunks.
- frontend/src/components/__tests__/toolbarMenuHome.test.ts — partial: Diff hunk.
- frontend/src/components/__tests__/viewMenus.wording.test.tsx — partial: Diff hunk.
- frontend/src/components/appshell/__tests__/FilterMenus.loading.test.tsx — full: New file in the diff.
- frontend/src/components/appshell/__tests__/FilterMenus.test.tsx — full: New file in the diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.library.test.tsx — partial: Diff hunks.
- frontend/src/components/readingapp/__tests__/ReadingApp.libraryFilters.test.tsx — full: New file in the diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.targetView.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.libraryFilters.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.memberTargetTagCounts.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoApp.states.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.targetView.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoApp.viewResolution.test.tsx — partial: Diff hunks.
- frontend/src/components/videoapp/__tests__/VideoShelfPage.filters.test.tsx — full: New file in the diff.
- frontend/src/components/videoapp/__tests__/VideoShelfPage.test.tsx — partial: Diff hunk adding the tag title test.

## Needs a human

### unspecified_behavior

Note: The Video and Reading See all pages keep applying URL filters after a Target choice made on that page (R1).; Clips chooseTarget may issue two consecutive router.replace calls (clips.tsx:253-258) when both the filters and the view change. The first is superseded by the second.
- claude-read: The Video and Reading See all pages keep applying URL filters after a Target choice made on that page (R1).
- claude-read: Clips chooseTarget may issue two consecutive router.replace calls (clips.tsx:253-258) when both the filters and the view change. The first is superseded by the second.
- claude-verify: Target choice made on a Video/Reading See all page: the spec does not say whether the URL's tag/watch filters should then be dropped or kept.

### unspecified_behavior

Note: Target choice made on a Video/Reading See all page: the spec does not say whether the URL's tag/watch filters should then be dropped or kept.
- claude-read: The Video and Reading See all pages keep applying URL filters after a Target choice made on that page (R1).
- claude-read: Clips chooseTarget may issue two consecutive router.replace calls (clips.tsx:253-258) when both the filters and the view change. The first is superseded by the second.
- claude-verify: Target choice made on a Video/Reading See all page: the spec does not say whether the URL's tag/watch filters should then be dropped or kept.

## Findings

A: 1
B: 2
C: 0

### claude-read:R1 — bucket A, MEDIUM, open

Claim: On the Video See all page, choosing another Target empties the in-memory filter store but the page keeps applying the tag and watch values in its URL to the new Target's shelf.
Impact: A user opens See all from a filtered Library, then picks another Target in the page header. The shelf for the new Target is still narrowed by the old tags and state. The page has no filter control that shows this. Going back to the Library then shows no filters, so the two pages disagree.
Evidence: VideoShelfPage.tsx:97-103 builds the request from the `urlTags` and `urlWatch` props, which come from the route's URL (page.tsx:18-19). VideoAppHeader.tsx:67 wires `onChoose: state.chooseTarget`. useVideoApp.ts:273-280 `chooseTarget` calls `resetLibraryFilters("video", drive)` and `updatePrefs`, but does not touch the URL. So after a Target choice, `query` still merges the URL tags and `fetchPage` still sends `watch`. Reading's See all page reads tag and state from its URL in the same way.
Repro: not_reproduced. Code reasoning: open /drive/main/apps/video/shelf?by=folder&key=Movies&from=library&tag=Trip&watch=finished, then choose another Target in the header. The next shelves request is for the new Target and still carries tag=[Trip] and watch=finished. VideoShelfPage.filters.test.tsx has no Target-choice case.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> When a Target is chosen on the See all page, drop tag and watch from its URL with a replace. Or have the See all page ignore URL filters once a Target choice has been made there.

</details>

### claude-read:R2 — bucket B, LOW, rejected

Claim: The Video See all route builds a new `tags` array on every render, so any re-render of the route resets the shelf's paging.
Impact: When the route component re-renders without a URL change, `fetchPage` changes and usePaged starts over at page 1. The same happens when `tag` is absent, because `[].filter(Boolean)` is also a new array. Pages already loaded by infinite scroll are dropped and the skeleton shows again. Before this change, every prop was a primitive.
Evidence: page.tsx:18 passes `tags={search.getAll("tag").filter(Boolean)}`. VideoShelfPage.tsx:97-101 has `useMemo(..., [params, urlTags])` and :105-131 has `fetchPage` depending on `query`. usePaged.ts:32-58 restarts on a new `fetchPage`, and :60 drops `held` when `fetchPage` differs.
Repro: not_reproduced. I did not confirm how often Next.js re-renders the page component without a URL change.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Memoise the tags on the joined string, for example `useMemo(() => tags, [tags.join("\u0000")])` inside VideoShelfPage, or pass a string and split it there.

</details>

### claude-read:R3 — bucket B, LOW, rejected

Claim: The tag menu's `conditionsKey` does not include the member ids of a Smart Collection Target, so a member re-evaluation while the menu is open neither reloads nor drops the answer.
Impact: Under a member Target, if the members change while the tag menu is open, the menu keeps showing counts for the old members until the next toggle or reopen.
Evidence: videoapp/LibraryFace.tsx and readingapp/LibraryFace.tsx set `conditionsKey = JSON.stringify(query)`, where `query` holds the listing params only. The members live in `requests` (memberTarget.ts appRequests). Clips Library.tsx builds `conditionsKey` from `target.key`, tags and trust, without `target.fileIds`. FilterMenus.tsx reloads only on `[open, conditionsKey, attempt]`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Fold the member ids, or a version of them, into `conditionsKey`.

</details>

## Not verified

- claude-read: I ran no tests or e2e specs.
- claude-read: I did not read drives.py beyond the diff hunk, or filtered_drive_files.
- claude-read: I did not confirm how often Next.js re-renders the shelf route without a URL change.
- claude-read: I did not see the content of commit 10bcd9ce5 itself. The commit message says it only records a review run.
- claude-verify: Did not observe at runtime whether Next 16.2.1 re-renders the See all route component without a URL change (R2).
- claude-verify: Did not run any tests or a browser.
- claude-verify: Did not read the Clips Library mount conditions in full to confirm FilterMenus unmounts while the target is lookingUp.
- claude-verify: Backend tag-counts invariants (I1, I2, I13) were not examined.

TOTAL: 3 findings
