# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-read:F1
- unspecified_behavior
- unspecified_behavior

## Read coverage

Product files:
- addons/knowledge/frontend/clipsapp/ClipShelfBlock.tsx — full: Opened the whole file.
- addons/knowledge/frontend/clipsapp/Library.tsx — full: Opened lines 1-160, which contain every changed hunk (imports, Menus conditionsKey, removed FilteredEmpty) and their enclosing functions.
- addons/knowledge/frontend/clipsapp/ShelfPage.tsx — full: Opened the whole file.
- addons/knowledge/frontend/clipsapp/clipsUrl.ts — full: Opened the whole file.
- addons/knowledge/frontend/clipsapp/requests.ts — full: Opened the whole file.
- addons/knowledge/frontend/pages/clips.tsx — full: Opened the whole file.
- frontend/e2e-components/app-header.spec.ts — full: Read the changed hunk with its enclosing test (lines 193-209) in the supplied diff, and checked it against addon-app-header.md:334-336.
- frontend/e2e-components/name-filter-desktop.spec.ts — full: New file, read in full in the supplied diff.
- frontend/e2e-components/name-filter.measure.ts — full: New file, read in full in the supplied diff.
- frontend/e2e-components/name-filter.spec.ts — full: New file, read in full in the supplied diff.
- frontend/e2e-components/projects.ts — full: Read the single changed hunk in the supplied diff; it adds one list entry.
- frontend/e2e-components/spec-viewport.spec.ts — full: Read both changed hunks (list entries) in the supplied diff.
- frontend/src/app/drive/[name]/apps/reading/shelf/page.tsx — full: The supplied diff covers the whole component (imports, replaceQuery, effects, callbacks, JSX).
- frontend/src/app/drive/[name]/apps/video/shelf/page.tsx — full: The supplied diff covers the whole component.
- frontend/src/components/PageTabs.tsx — full: Opened the whole file.
- frontend/src/components/appshell/AppTabs.tsx — full: The supplied diff shows the props interface and the whole AppTabs function body.
- frontend/src/components/appshell/NameFilter.tsx — full: Opened the whole file.
- frontend/src/components/appshell/libraryFilters.ts — full: Opened the whole file.
- frontend/src/components/readingapp/LibraryFace.tsx — partial: Opened lines 80-219, covering the name, query, filtersActive and conditions hunks. Did not read the rest of the component's JSX below line 219.
- frontend/src/components/readingapp/ReadingApp.tsx — full: Opened the whole file.
- frontend/src/components/readingapp/ReadingShelfPage.tsx — full: Opened lines 85-299, which contain every changed hunk; the props hunk was read in the diff.
- frontend/src/components/readingapp/shelfLinks.ts — full: Read both changed hunks with the enclosing readingShelfHref in the supplied diff.
- frontend/src/components/videoapp/LibraryFace.tsx — partial: Opened lines 55-184, covering the name, query, filtersActive and conditions hunks. Did not read the JSX below line 184.
- frontend/src/components/videoapp/VideoApp.tsx — full: Opened the whole file.
- frontend/src/components/videoapp/VideoShelfPage.tsx — full: Opened the whole file.
- frontend/src/components/videoapp/shelfLinks.ts — full: Read the changed hunks with the enclosing videoShelfHref in the supplied diff.
- frontend/src/messages-core/en.json — partial: Only the appFilters hunk in the supplied diff.
- frontend/src/messages-core/ja.json — partial: Only the appFilters hunk in the supplied diff.

Test files:
- addons/knowledge/frontend/__tests__/clipsAppHarness.tsx — partial: Only the changed hunks in the supplied diff (matchSearch field, filter, init).
- addons/knowledge/frontend/__tests__/clipsNameFilter.test.tsx — full: New file, read in the supplied diff.
- addons/knowledge/frontend/clipsapp/__tests__/clipsUrl.test.ts — partial: Only the changed hunks in the supplied diff.
- addons/knowledge/frontend/clipsapp/__tests__/requests.test.ts — partial: Only the one changed line in the supplied diff.
- frontend/src/__tests__/appTargetParam.test.tsx — partial: Only the added I4 cases in the supplied diff.
- frontend/src/__tests__/ime-enter-guard.test.ts — partial: Only the two changed hunks in the supplied diff.
- frontend/src/__tests__/nameFilterMemberTarget.test.tsx — full: New file, read in the supplied diff.
- frontend/src/__tests__/nameFilterRetention.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/__tests__/PageTabs.test.tsx — partial: Only the added trailing-slot describe block in the supplied diff.
- frontend/src/components/__tests__/seeAllNameFilter.listing.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/__tests__/seeAllNameFilter.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/appshell/__tests__/NameFilter.normalise.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/appshell/__tests__/NameFilter.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/readingapp/__tests__/ReadingApp.nameFilter.test.tsx — full: New file, read in the supplied diff.
- frontend/src/components/videoapp/__tests__/VideoApp.nameFilter.test.tsx — full: New file, read in the supplied diff.

## Needs a human

### open_c (claude-read:F1)

Question: The diff edits frontend/e2e-components/app-header.spec.ts, which the touch-point list does not name, and rewrites the SPEC-CORE-099 I13 assertion from 'sort at the header's right end' to 'sort at the content's start' on 375px shelf pages, while the spec's Revises section does not revise SPEC-CORE-099 I13.
Impact: On a phone, every listing-mode Video/Reading See all page now draws the sort at the left under the name field. This contradicts the implemented SPEC-CORE-099 I13 ('on the header's last row at its right end'), which still stands unrevised in docs/specs/addon-app-header.md:334-336. The only test that guarded that invariant was changed to match the new placement, so nothing now checks SPEC-CORE-099 I13 as written for those pages. Non-listing shelf pages keep the old placement, so one implemented invariant now holds on some shelf pages and not on others.
Evidence: frontend/e2e-components/app-header.spec.ts:196,206 (diff): the test title changed to 'at its start' and the assertion changed to `Math.abs(sort.left - m.contentLeft) <= 1`. The cause is frontend/src/components/videoapp/VideoShelfPage.tsx:315 and frontend/src/components/readingapp/ReadingShelfPage.tsx:274: in listing mode `actions` is a `flex-col items-start` wrapper below sm. docs/specs/addon-app-header.md:334-336 still says right end. app-library-name-filter.md 'Revises' lists SPEC-CORE-147 I10/I5/I12, SPEC-CORE-145 I11/I14 and SPEC-CORE-063 I16b, but not SPEC-CORE-099 I13. Touch points list neither app-header.spec.ts nor addon-app-header.md.
Recommendation: Add 'SPEC-CORE-099 I13' to the Revises section, worded for listing-mode shelf pages: below 640px the sort is on its own line under the name field, at the start. List frontend/e2e-components/app-header.spec.ts in the touch points.
Note: The diff edits frontend/e2e-components/app-header.spec.ts, which the touch-point list does not name, and rewrites the SPEC-CORE-099 I13 assertion from 'sort at the header's right end' to 'sort at the content's start' on 375px shelf pages, while the spec's Revises section does not revise SPEC-CORE-099 I13.

### unspecified_behavior

Note: On phone-width listing-mode See all pages the sort moves from the header's right end to the start of its own row. This contradicts SPEC-CORE-099 I13, which the spec does not revise (F1). Non-listing shelf pages keep the right-end placement.; Clips: the q normalisation effect (clips.tsx:197-205) and the fillHref replace (clips.tsx:363-371) can both fire on one render when q is untrimmed and group/sort are missing. The last replace wins, and both carry the normalised q, so the end URL looks right, but two replaces are issued.
- claude-read: On phone-width listing-mode See all pages the sort moves from the header's right end to the start of its own row. This contradicts SPEC-CORE-099 I13, which the spec does not revise (F1). Non-listing shelf pages keep the right-end placement.
- claude-read: Clips: the q normalisation effect (clips.tsx:197-205) and the fillHref replace (clips.tsx:363-371) can both fire on one render when q is untrimmed and group/sort are missing. The last replace wins, and both carry the normalised q, so the end URL looks right, but two replaces are issued.
- claude-verify: The sort menu's position on shelf pages below 640px has moved from the right end to the start, which goes beyond what the spec revises (F1).

### unspecified_behavior

Note: The sort menu's position on shelf pages below 640px has moved from the right end to the start, which goes beyond what the spec revises (F1).
- claude-read: On phone-width listing-mode See all pages the sort moves from the header's right end to the start of its own row. This contradicts SPEC-CORE-099 I13, which the spec does not revise (F1). Non-listing shelf pages keep the right-end placement.
- claude-read: Clips: the q normalisation effect (clips.tsx:197-205) and the fillHref replace (clips.tsx:363-371) can both fire on one render when q is untrimmed and group/sort are missing. The last replace wins, and both carry the normalised q, so the end URL looks right, but two replaces are issued.
- claude-verify: The sort menu's position on shelf pages below 640px has moved from the right end to the start, which goes beyond what the spec revises (F1).

## Findings

A: 0
B: 4
C: 1

### claude-read:F2 — bucket B, LOW, open

Claim: The diff changes addons/knowledge/frontend/clipsapp/ClipShelfBlock.tsx (FilteredEmpty is moved there from Library.tsx and exported), a product file that is not in the touch-point list.
Impact: There is no user-visible defect: the Library's empty state renders the same component, and ShelfPage now shares it. A reader who trusts the touch-point list would miss that a shared Clips module changed.
Evidence: addons/knowledge/frontend/clipsapp/ClipShelfBlock.tsx:49-53 adds `export function FilteredEmpty()`. Library.tsx:23 and ShelfPage.tsx:9 import it, and Library.tsx's local copy is removed. The touch points list clipsapp/{clipsUrl.ts, Library.tsx, ShelfPage.tsx, requests.ts, useGroupedShelves.ts, useShelfData.ts, usePagedClips.ts}, without ClipShelfBlock.tsx.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add clipsapp/ClipShelfBlock.tsx to the touch points.

</details>

### claude-read:F3 — bucket B, INFO, open

Claim: The diff extends frontend/src/__tests__/ime-enter-guard.test.ts, a source-scanning test not in the touch-point list: NameFilter.tsx is registered as a text-field Enter handler and the declared count goes from 20 to 21.
Impact: There is no user impact. A planner reading the list would not expect a repository-wide source scan to need changing.
Evidence: ime-enter-guard.test.ts:40 adds 'components/appshell/NameFilter.tsx' to TEXT_FIELD_ENTER and line 106 changes toHaveLength(20) to 21. The touch points name only tab-styles.test.ts and section-rows.test.tsx as the source-scanning tests.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, INFO, open

Claim: The diff adds SPEC-CORE-156 I4 cases to frontend/src/__tests__/appTargetParam.test.tsx, the SPEC-CORE-154 Home-shortcut suite, which is not among the touch-point tests.
Impact: There is no user impact. The I4 Home-shortcut tests sit in another spec's suite that the list does not point to.
Evidence: appTargetParam.test.tsx:469-495 (diff): 'a Home-shortcut landing on another Target empties the name' and 'a Home-shortcut landing on the Target in force keeps the name'. The touch-point list names only 'the Video, Reading and Clips Library and See all / shelf-page tests'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: The diff reaches e2e and test infrastructure the touch-point list does not name: frontend/e2e-components/projects.ts (DESKTOP_ONLY), frontend/e2e-components/spec-viewport.spec.ts (the AT_THE_PHONE_WIDTH and AT_THE_DESKTOP_WIDTH registries), the shared helper name-filter.measure.ts, and the shared Clips harness addons/knowledge/frontend/__tests__/clipsAppHarness.tsx (new `matchSearch`).
Impact: There is no user impact. The registries and the harness are shared by other suites. clipsAppHarness's `matchSearch` defaults to false, so earlier suites see the same server.
Evidence: projects.ts:11, spec-viewport.spec.ts:86,107, clipsAppHarness.tsx:133-134,191-196,335 (diff). The touch points name e2e fixtures/clipsPage.tsx, fixtures/clipsData.ts and 'new specs for the name field', but not these registries or the harness.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F1 — bucket C, MEDIUM, open

Claim: The diff edits frontend/e2e-components/app-header.spec.ts, which the touch-point list does not name, and rewrites the SPEC-CORE-099 I13 assertion from 'sort at the header's right end' to 'sort at the content's start' on 375px shelf pages, while the spec's Revises section does not revise SPEC-CORE-099 I13.
Impact: On a phone, every listing-mode Video/Reading See all page now draws the sort at the left under the name field. This contradicts the implemented SPEC-CORE-099 I13 ('on the header's last row at its right end'), which still stands unrevised in docs/specs/addon-app-header.md:334-336. The only test that guarded that invariant was changed to match the new placement, so nothing now checks SPEC-CORE-099 I13 as written for those pages. Non-listing shelf pages keep the old placement, so one implemented invariant now holds on some shelf pages and not on others.
Evidence: frontend/e2e-components/app-header.spec.ts:196,206 (diff): the test title changed to 'at its start' and the assertion changed to `Math.abs(sort.left - m.contentLeft) <= 1`. The cause is frontend/src/components/videoapp/VideoShelfPage.tsx:315 and frontend/src/components/readingapp/ReadingShelfPage.tsx:274: in listing mode `actions` is a `flex-col items-start` wrapper below sm. docs/specs/addon-app-header.md:334-336 still says right end. app-library-name-filter.md 'Revises' lists SPEC-CORE-147 I10/I5/I12, SPEC-CORE-145 I11/I14 and SPEC-CORE-063 I16b, but not SPEC-CORE-099 I13. Touch points list neither app-header.spec.ts nor addon-app-header.md.
Repro: Static reading: compare the app-header.spec.ts hunk with addon-app-header.md:334 and the spec's Revises list. Mutation: restoring the old assertion (svg right edge == contentRight) would fail against the new listing-mode wrapper.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

<details><summary>Proposed fix</summary>

> Add 'SPEC-CORE-099 I13' to the Revises section, worded for listing-mode shelf pages: below 640px the sort is on its own line under the name field, at the start. List frontend/e2e-components/app-header.spec.ts in the touch points.

</details>

## Not verified

- claude-read: Whether the listed-but-unreached touch points (VideoPagedGrid.tsx, useGroupedShelves.ts, useShelfData.ts, usePagedClips.ts, fixture-parity tests, e2e-layout fixtures, clipsPage.tsx/clipsData.ts, library-filters*/clips-view-menus* specs) changed in earlier commits on the branch outside this diff.
- claude-read: Whether the app-header.spec.ts fixture page is in listing mode at 375px; I inferred it from the assertion change, without running Playwright.
- claude-read: No test, typecheck or e2e run (read-only tools).
- claude-read: The decisions.md text omitted as long lines, which may record an accepted change to the SPEC-CORE-099 sort placement.
- claude-verify: I did not run any tests or e2e specs.
- claude-verify: I could not run git, so I did not view the diff itself against origin/develop. I relied on the files as they are now and on the r1 file lists.
- claude-verify: I did not check the full content of the other touch-point files.

TOTAL: 5 findings
