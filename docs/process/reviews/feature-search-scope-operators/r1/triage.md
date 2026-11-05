# Triage: r1

## Warnings

- R-5 ran at af285330da8e6d6884dafd1dedf020e80e0340d1, and these files changed since: DESIGN.md, docs/addons/intelligence.md, docs/reference/api.md, docs/user-guide/keyboard-shortcuts.md, docs/user-guide/search.md and 4 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- needs_human_record claude-read:F5
- unspecified_behavior
- unspecified_behavior
- unspecified_behavior

## Needs a human

### needs_human_record (claude-read:F5)

Question: The diff adds a new addon test file, tests/test_search_scope_filter.py, and does not touch tests/matching_core_double.py. The touch list names matching_core_double.py as a changed file and does not name the new file.
Impact: The addon's parity tables are not extended as listed. The new file's pass-through test relies on the existing double.
Evidence: The addon diff touches test_filtered_search_contract.py and adds test_search_scope_filter.py. matching_core_double.py is absent from the diff.
Note: addons/intelligence/tests/test_search_scope_filter.py exists, so the new-file part holds. I cannot read the diff, so I could not check that matching_core_double.py is unchanged. A human should run git diff --stat on the addon.

### unspecified_behavior

Note: Chip styling changes for tag, type and is chips: min-w-0, max-w-full and title on every chip.; Any later REQUIRED-class change in the fixture-CSS builder now has to adjust the hard-coded count in coarseNeedleSources.test.ts.
- claude-deep: Existing tag, type and is chips now carry a title and truncate.
- claude-deep: The modal's tag completion now quotes values that contain whitespace.
- claude-deep: apply_file_filters raises ValueError when collections is given without drive.
- claude-read: Chip styling changes for tag, type and is chips: min-w-0, max-w-full and title on every chip.
- claude-read: Any later REQUIRED-class change in the fixture-CSS builder now has to adjust the hard-coded count in coarseNeedleSources.test.ts.
- claude-verify: Restyling and title attribute on all existing chips
- claude-verify: Test and build files edited outside the touch-point list
- claude-verify: extra=forbid on /files/matching rejects unknown keys from any caller

### unspecified_behavior

Note: Restyling and title attribute on all existing chips; Test and build files edited outside the touch-point list; extra=forbid on /files/matching rejects unknown keys from any caller
- claude-deep: Existing tag, type and is chips now carry a title and truncate.
- claude-deep: The modal's tag completion now quotes values that contain whitespace.
- claude-deep: apply_file_filters raises ValueError when collections is given without drive.
- claude-read: Chip styling changes for tag, type and is chips: min-w-0, max-w-full and title on every chip.
- claude-read: Any later REQUIRED-class change in the fixture-CSS builder now has to adjust the hard-coded count in coarseNeedleSources.test.ts.
- claude-verify: Restyling and title attribute on all existing chips
- claude-verify: Test and build files edited outside the touch-point list
- claude-verify: extra=forbid on /files/matching rejects unknown keys from any caller

### unspecified_behavior

Note: Existing tag, type and is chips now carry a title and truncate.; The modal's tag completion now quotes values that contain whitespace.; apply_file_filters raises ValueError when collections is given without drive.
- claude-deep: Existing tag, type and is chips now carry a title and truncate.
- claude-deep: The modal's tag completion now quotes values that contain whitespace.
- claude-deep: apply_file_filters raises ValueError when collections is given without drive.
- claude-read: Chip styling changes for tag, type and is chips: min-w-0, max-w-full and title on every chip.
- claude-read: Any later REQUIRED-class change in the fixture-CSS builder now has to adjust the hard-coded count in coarseNeedleSources.test.ts.
- claude-verify: Restyling and title attribute on all existing chips
- claude-verify: Test and build files edited outside the touch-point list
- claude-verify: extra=forbid on /files/matching rejects unknown keys from any caller

## Findings

A: 0
B: 8
C: 0

### claude-deep:F1 — bucket B, LOW, open

Claim: The diff edits three test and build files that are not in the touch-point list: coarseNeedleSources.test.ts (REQUIRED count 64 to 68), semanticSearch.passages.test.ts (SearchFilter literal gains the new fields), and e2e-layout/build-fixture-css.ts (four new required class names).
Impact: build-fixture-css.ts REQUIRED is shared by every layout fixture and the coarse-needle source test pins its length. A future change to that list now has to touch this feature's count. The reader of the touch-point list would not look there.
Evidence: frontend/e2e-layout/build-fixture-css.ts adds .max-w-full, .min-w-0, .truncate and .shrink-0 to REQUIRED. frontend/src/__tests__/coarseNeedleSources.test.ts changes toHaveLength(64) to 68. frontend/src/lib/__tests__/semanticSearch.passages.test.ts adds folders and collections to a SearchFilter literal. None of the three paths is listed. The list names only 'e2e-layout/: a fixture' and the vocabulary test.
Repro: not_reproduced (read-only comparison of the diff file list against the touch points)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:F2 — bucket B, LOW, open

Claim: The change reaches existing behaviour in places the touch points do not name: the tokenizer rewrite changes parsing for every parseSearchQuery caller, and SearchFilterChips changes the layout and title of the existing tag, type and is chips as well.
Impact: Callers outside the list now parse quoted values differently and read the new hasOperators and text. These include GlobalSearch.tsx, SearchResultsList.tsx, useLauncherRows.ts, FolderBrowser.tsx and app/drive/[name]/search/page.tsx. The modal's activeOperatorValue and completeOperator also change, so a tag with a space is now written quoted. The spec mentions the modal in prose, but no modal file is in the touch points. The existing chips gain a title attribute, truncation and max-w-full wrapping. I did not read the callers; they are listed only because they use the changed functions.
Evidence: grep found parseSearchQuery, completeOperator and activeOperatorValue in GlobalSearch.tsx, SearchResultsList.tsx, useLauncherRows.ts, FolderBrowser.tsx and search/page.tsx. None is in the touch points. searchQuery.ts replaces the OPERATOR regex split with tokenize/interpret for all operators. SearchFilterChips.tsx adds title and the class changes to all chips, not only the new kinds.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F1 — bucket B, LOW, open

Claim: The diff edits frontend/e2e-layout/build-fixture-css.ts (four new REQUIRED stylesheet classes), a file that is not in the touch-point list.
Impact: This is the shared fixture-CSS builder used by every layout fixture. Its REQUIRED list is a build-time gate, so the added entries can break the build of other fixtures if a class is absent from the built CSS. The touch list names only the new fixture and spec.
Evidence: frontend/e2e-layout/build-fixture-css.ts adds ".max-w-full {", ".min-w-0 {", ".truncate {", ".shrink-0 {" to REQUIRED. The touch list names only "frontend/e2e-layout/: a fixture with a long folder chip".
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the file to the touch-point list.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The diff edits frontend/src/__tests__/coarseNeedleSources.test.ts (REQUIRED length 64 to 68), which is not in the touch-point list.
Impact: The hard-coded count is coupled to the fixture-CSS builder's REQUIRED list. A later change to that list will fail this unrelated pointer-coarse test, and the coupling is invisible from the touch list.
Evidence: coarseNeedleSources.test.ts: expect(REQUIRED).toHaveLength(64) becomes 68. The touch list names only core-search-vocabulary.test.ts among the pinned-count tests.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the file to the touch-point list.

</details>

### claude-deep:F3 — bucket B, INFO, open

Claim: Setting extra=forbid on FileMatchingRequest, and reusing the shared normalisers in drives.py, reaches every existing caller of POST /files/matching and of apply_file_filters beyond the intelligence addon fetch.
Impact: Any other client that sends an extra key to /files/matching now gets 422. The spec asserts that only fetch_matching_file_ids calls it and I did not verify that. The new drive parameter of apply_file_filters is optional, so an unlisted caller that passes collections without a drive would raise ValueError, a 500.
Evidence: backend/app/routers/internal.py adds ConfigDict(extra='forbid'). drives.py apply_file_filters raises ValueError when collections is given and drive is None. The grep found only drives.py and internal.py as backend callers.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, INFO, open

Claim: Several existing frontend test files are edited although the touch list does not name them: lib/__tests__/searchQuery.test.ts and lib/__tests__/semanticSearch.passages.test.ts, which is edited only so its SearchFilter literal gets the new required fields.
Impact: The type change that makes folders and collections required on SearchFilter reaches other tests and any other literal SearchFilter. A reader of the touch list would not expect these edits, and nothing lists them as callers to update.
Evidence: semanticSearch.passages.test.ts adds folders: [] and collections: [] to a filter literal. searchQuery.test.ts adds the two keys to the empty-parse expectation. lib/semanticSearch.ts consumes SearchFilter but is unchanged.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List the existing tests that construct a SearchFilter or ParsedQuery.

</details>

### claude-read:F4 — bucket B, INFO, open

Claim: The change reaches existing behaviour that the touch list does not mention. SearchFilterChips restyles every chip (tag, type and is) with min-w-0, max-w-full, a title attribute and a shrink-0 on the ✕. The shared choose() in SearchQueryHeader is also rewritten for the tag, type and favorite entries.
Impact: The layout of existing chips and the menu's existing tag and favorite choices change for queries that contain no new operator. The I8 no-change guarantee covers only the listing parameters and the filter, not these UI paths.
Evidence: SearchFilterChips.tsx: the chip class changes for all chips, and title={value ?? undefined} is added. SearchQueryHeader.tsx: choose(operator, value) now calls closeOpenQuote and formatOperatorToken for tag, type and is.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, INFO, open

Claim: The diff adds a new addon test file, tests/test_search_scope_filter.py, and does not touch tests/matching_core_double.py. The touch list names matching_core_double.py as a changed file and does not name the new file.
Impact: The addon's parity tables are not extended as listed. The new file's pass-through test relies on the existing double.
Evidence: The addon diff touches test_filtered_search_contract.py and adds test_search_scope_filter.py. matching_core_double.py is absent from the diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I ran no tests, because I only have Read, Glob and Grep.
- claude-deep: I did not read the callers of parseSearchQuery outside the diff.
- claude-deep: I did not audit the invariants I1 to I14 for logic defects.
- claude-deep: I did not read the addon submodule beyond the diff.
- claude-deep: I did not check whether anything other than the intelligence addon calls POST /files/matching.
- claude-read: Whether the invariants hold in the code (I1 to I14).
- claude-read: Whether the built stylesheet satisfies the four new REQUIRED classes.
- claude-read: Whether other fixtures or tests depend on REQUIRED beyond coarseNeedleSources.test.ts.
- claude-read: The addon submodule diff was read only as shown, not on disk.
- claude-read: The consumer files GlobalSearch, useLauncherRows, FolderBrowser and the search page were not read.
- claude-verify: The diff itself: I could not read it, so I could not tell what was added or removed.
- claude-verify: Whether matching_core_double.py is unchanged.
- claude-verify: The tokenizer logic in searchQuery.ts against I5 and I12.
- claude-verify: The choose() rewrite in SearchQueryHeader.tsx.
- claude-verify: Backend normalisation parity between the listing and /files/matching.
- claude-verify: Test execution and the e2e-layout browser run.

TOTAL: 8 findings
