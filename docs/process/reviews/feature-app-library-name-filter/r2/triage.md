# Triage: r2

## Trajectory

This run:
- claude-read: Round r1 → fix commit 5c0a18297 changes documents only: it adds a revision of SPEC-CORE-099 I13 to invariants.md and records the r1 decision. The revision adds a branch to the invariant (listing-mode vs other shelf pages below 640px) that mirrors the `listing ? … : …` branch already in VideoShelfPage and ReadingShelfPage. No code branch, state or prediction was added or removed in this round. Only one fix round exists, so there is no repeating pattern of the design being patched. The new invariant branch has no test on its non-listing side (F1).

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- addons/knowledge/frontend/clipsapp/ClipShelfBlock.tsx — partial: Only the diff hunk (FilteredEmpty export and its imports).
- addons/knowledge/frontend/clipsapp/Library.tsx — partial: Only the diff hunks (imports, Menus conditionsKey name, removed local FilteredEmpty).
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — full: Opened the whole file.
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — partial: Only the diff hunks (ClipFilters.name, readClipFilters, hasClipFilters, clipFiltersKey, clipsHref).
- addons/knowledge/frontend/clipsapp/requests.ts — partial: Only the diff hunks (clipConditions search, loadShelfPage unverified filters).
- addons/knowledge/frontend/pages/clips.tsx — full: Opened lines 140-399, which contain every changed hunk with its enclosing code; the import hunk was read in the diff.
- frontend/e2e-components/app-header.spec.ts — partial: Opened lines 185-214 (the changed I13 test) and grepped for contentRight/contentLeft.
- frontend/e2e-components/name-filter-desktop.spec.ts — full: New file, read in full in the supplied diff.
- frontend/e2e-components/name-filter.measure.ts — full: New file, read in full in the supplied diff.
- frontend/e2e-components/name-filter.spec.ts — full: New file, read in full in the supplied diff.
- frontend/e2e-components/projects.ts — partial: Only the single added list entry in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Only the two added list entries in the diff.
- frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx — full: The supplied diff covers the whole component.
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — full: The supplied diff covers the whole component.
- frontend/src/components/PageTabs.tsx — partial: Only the diff hunks (props, class constants, nav className and trailing wrapper).
- frontend/src/components/appshell/AppTabs.tsx — full: The diff shows the props interface and the whole function body.
- frontend/src/components/appshell/NameFilter.tsx — full: Opened the whole file.
- frontend/src/components/appshell/libraryFilters.ts — partial: Only the diff hunks (name field, write, setName, return).
- frontend/src/components/readingapp/LibraryFace.tsx — partial: Only the diff hunks (name, query, filtersActive, link conditions).
- frontend/src/components/readingapp/ReadingApp.tsx — partial: Only the diff hunks (imports, filters, showName, trailing NameFilter).
- frontend/src/components/readingapp/ReadingShelfPage.tsx — partial: Only the diff hunks (props, urlFilters, requestedName, listing, filtersActive, fetchPage, empty state, actions).
- frontend/src/components/readingapp/shelfLinks.ts — full: The diff hunks show the interface and the enclosing readingShelfHref.
- frontend/src/components/videoapp/LibraryFace.tsx — partial: Only the diff hunks (name, query, filtersActive, link conditions).
- frontend/src/components/videoapp/VideoApp.tsx — full: Opened the whole file.
- frontend/src/components/videoapp/VideoShelfPage.tsx — full: Opened lines 85-344; the props hunk above was read in the diff.
- frontend/src/components/videoapp/shelfLinks.ts — full: The diff hunks show the interface and the enclosing videoShelfHref.
- frontend/src/messages-core/en.json — partial: Only the appFilters hunk in the diff.
- frontend/src/messages-core/ja.json — partial: Only the appFilters hunk in the diff.

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: Only the matchSearch hunks in the diff.
- addons/knowledge/frontend/__tests__/clipsNameFilter.test.tsx — full: New file, read in the supplied diff.
- addons/knowledge/frontend/clipsapp/__tests__/clipsUrl.test.ts — partial: Only the added hunks in the diff.
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — partial: Only the one changed line in the diff.
- frontend/src/__tests__/appTargetParam.test.tsx — partial: Only the added I4 cases in the diff.
- frontend/src/__tests__/ime-enter-guard.test.ts — partial: Only the two changed hunks in the diff.
- frontend/src/__tests__/nameFilterMemberTarget.test.tsx — full: New file, read in the supplied diff.
- frontend/src/__tests__/nameFilterRetention.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/__tests__/PageTabs.test.tsx — partial: Only the added trailing-slot block in the diff.
- frontend/src/components/__tests__/seeAllNameFilter.listing.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/__tests__/seeAllNameFilter.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/appshell/__tests__/NameFilter.normalise.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/appshell/__tests__/NameFilter.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.nameFilter.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/videoapp/__tests__/VideoApp.nameFilter.test.tsx — full: New file, read in the supplied diff.

## Findings

A: 0
B: 1
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The revised SPEC-CORE-099 I13 (invariants.md:7) promises that on any non-listing shelf page below 640px the sort menu stays on the header's last row at its right end, but no test checks that clause any more. The only phone-width I13 test (app-header.spec.ts:195-209) was rewritten to assert the listing-mode 'at its start' placement.
Impact: A later change could move the sort on a non-listing See all page at phone width (a provider entry page has no sort; a watch shelf without a profile, a Reading page with an unreadable key, or a page still looking up its Target do) to the left or onto another row. No test would fail, so the right-end promise the r1 revision kept would silently break.
Evidence: invariants.md:7 has a separate clause for 'any other shelf page below 640px … at its right end'. app-header.measure.ts:22 sets SHELF_PAGES = ['video-shelf','reading-shelf'], and the fixture opens those in listing mode. app-header.spec.ts:206 now asserts `Math.abs(sort.left - m.contentLeft) <= 1`. A grep for `contentRight` in e2e-components finds no remaining sort assertion against the right edge. The non-listing branch is VideoShelfPage.tsx:329-335 and ReadingShelfPage's equivalent `: (<ReadingSortMenu …/>)` branch.
Repro: Mutation: in VideoShelfPage.tsx:329-335, wrap the non-listing SortChoiceMenu in the same `flex-col items-start w-full` div that the listing branch uses. The sort on a watchBlocked page at 375px then moves to the left, and no unit or e2e test fails, because every I13 phone test opens a listing-mode page.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a 375px app-header e2e case that opens a non-listing shelf page (for example video-shelf with by=watch and no profile) and asserts that the sort's last svg right edge equals contentRight.

</details>

## Not verified

- claude-read: I did not run any unit, typecheck or Playwright test (read-only tools).
- claude-read: I did not read decisions.md in full; its long line matched only partially, so the recorded r1 decision text was not checked word for word.
- claude-read: I did not open the full bodies of LibraryFace (Video and Reading), ReadingShelfPage, Library.tsx, requests.ts, clipsUrl.ts, libraryFilters.ts or PageTabs.tsx in this round; they were read through the supplied diff hunks only.
- claude-read: I did not check whether the e2e fixture for SHELF_PAGES could be parameterised into a non-listing state without fixture changes.
- claude-verify: I did not read git history to confirm that the earlier version of app-header.spec.ts asserted the right-end placement. 'Any more' is inferred from the claim, not checked.
- claude-verify: I ran no tests and did not measure the actual rendered position of the non-listing sort menu.
- claude-verify: I did not check whether a vitest source-scanning test pins the non-listing branch's classes.

TOTAL: 1 findings
