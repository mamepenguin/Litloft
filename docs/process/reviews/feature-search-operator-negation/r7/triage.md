# Triage: r7

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- artifact of claude-deep is missing
- open finding claude-read:R4 is bucket A or BLOCKER

## Read coverage

Product files:
- addons/intelligence/app/file_matching.py — full: Every diff hunk plus lines 1-60 and the grep of its users.
- backend/app/routers/drives.py — full: Every changed hunk in the diff; class hierarchy checked by grep.
- backend/app/routers/internal.py — full: Every changed hunk in the diff.
- backend/app/routers/shelves.py — full: The single changed hunk; ShelfQuery base checked by grep.
- frontend/e2e-components/fixtures/app.tsx — full: Both changed hunks.
- frontend/e2e-components/search-chips-negated.spec.ts — full: New file, read whole in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: One-line hunk.
- frontend/src/components/SmartFolderSaveButton.tsx — full: Both changed hunks.
- frontend/src/components/folder/useFolderFiles.ts — partial: All diff hunks plus lines 225-344 in the file.
- frontend/src/components/search/ConditionMenu.tsx — partial: All diff hunks only.
- frontend/src/components/search/InNameNotice.tsx — full: Diff covers the whole component.
- frontend/src/components/search/SearchFilterChips.tsx — full: All diff hunks.
- frontend/src/components/search/SearchQueryHeader.tsx — full: One hunk.
- frontend/src/components/search/useFileSearch.ts — full: Diff hunks plus lines 100-299.
- frontend/src/components/search/useLauncherRows.ts — full: The changed hunk.
- frontend/src/components/videoapp/VideoAppHeader.tsx — full: The changed hunk.
- frontend/src/components/videoapp/useVideoApp.ts — full: The changed hunk.
- frontend/src/lib/appTarget.ts — full: The changed hunks.
- frontend/src/lib/inNameResolution.ts — full: All diff hunks.
- frontend/src/lib/listingRequest.ts — full: All diff hunks.
- frontend/src/lib/memberTarget.ts — full: All diff hunks.
- frontend/src/lib/searchQuery.ts — full: All diff hunks.
- frontend/src/lib/smartCollectionEval.ts — full: All diff hunks.
- frontend/src/lib/videoAppTarget.ts — full: All diff hunks.
- frontend/src/messages-core/en.json — full: All diff hunks.
- frontend/src/messages-core/ja.json — full: All diff hunks.

Test files:
- addons/intelligence/tests/test_filtered_search_file_ids_conditions.py — partial: The changed hunk only.
- addons/intelligence/tests/test_search_negation_filter.py — full: New file in the diff.
- addons/intelligence/tests/test_search_negation_filter_scope.py — full: New file in the diff.
- backend/tests/test_filtered_drive_files_contract.py — partial: The changed hunk only.
- backend/tests/test_search_negation_operators.py — full: New file in the diff.
- frontend/src/__tests__/appTargetNegation.test.tsx — full: New file in the diff.
- frontend/src/__tests__/core-search-vocabulary.test.ts — partial: Changed hunks only.
- frontend/src/components/__tests__/GlobalSearch.negation.test.tsx — full: New file in the diff.
- frontend/src/components/__tests__/SearchPage.negation.test.tsx — full: New file in the diff.
- frontend/src/components/__tests__/SmartFolderSaveButton.negation.test.tsx — full: New file in the diff.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: One-line hunk.
- frontend/src/components/folder/__tests__/useFolderFiles.scope.test.tsx — partial: Changed hunks only.
- frontend/src/components/readingapp/__tests__/ReadingApp.memberTarget.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchFilterChips.negation.test.tsx — full: New file in the diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.modified.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchQueryHeader.negation.test.tsx — full: New file in the diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/SearchQueryHeader.sizeDuration.test.tsx — partial: Changed hunk only.
- frontend/src/components/search/__tests__/useFileSearch.filtered.test.tsx — partial: Changed hunks only.
- frontend/src/components/videoapp/__tests__/VideoApp.memberTarget.test.tsx — partial: Changed hunks only.
- frontend/src/components/videoapp/__tests__/VideoApp.negationTargetMenu.test.tsx — full: New file in the diff.
- frontend/src/lib/__tests__/inNameResolution.negation.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/listingRequest.negation.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/searchImpossibleConditions.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/searchNegationOperators.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/searchQuery.test.ts — partial: Changed hunk only.
- frontend/src/lib/__tests__/searchScopeOperators.test.ts — partial: Changed hunks only.
- frontend/src/lib/__tests__/searchSuggestions.negation.test.ts — full: New file in the diff.
- frontend/src/lib/__tests__/semanticSearch.passages.test.ts — partial: Changed hunk only.
- frontend/src/lib/__tests__/smartCollectionEval.negation.test.ts — full: New file in the diff.

## Unspecified behavior, recorded

- claude-read: useFolderFiles now skips the in: resolution (loads no collection lists) when the query has an impossible kind or range even if it holds no new token, which changes SPEC-CORE-116 loading for pre-existing in: queries.
  - F1 × I1 = 1, claude-read: A query such as 'in:Trip type:video' on an image-fixed page now loads no list; the user sees the same empty result with fewer requests.
  - F1 × I1 = 1, claude-verify: An in: query that is already impossible by kind or range now skips the collection-list loads, and the user sees the same empty result as before; I18 already says an impossible query loads no list (useFolderFiles.ts:292).
- claude-read: The memberLimit early stop applies to the in: resolution of any Smart Collection without free text, including ones whose query holds no new token, so those also stop after the first page over 10,000.
  - F1 × I1 = 1, claude-read: An in: naming a large operator-only Smart Collection reports too large after one page instead of after reading all pages; the visible outcome is the same.
  - F1 × I1 = 1, claude-verify: An in: naming a Smart Collection with no free text and more than 10,000 members now stops after the first page over the limit and still shows the same too-large state (inNameResolution.ts:172,181); spec step 9 names this early stop explicitly.
- claude-read: The search window's launcher turns off Go-to rows, folder jumps and tag suggestions (and stops loading the drive's tag names) while the typed query is impossible.
  - F2 × I2 = 4, claude-read: Typing 'tag:x -tag:x' in the window hides every jump and suggestion row; the spec only says an impossible query requests nothing.
  - F1 × I2 = 2, claude-verify: While the search window's typed query is impossible (e.g. two conflicting type: tokens), its jump rows, folder jumps and tag completions disappear until the conflict is removed (useLauncherRows.ts:47-59), which can look like suggestions broke mid-edit.
- claude-read: Excluding a collection that exists in another drive only, or a name that no collection carries, is sent and excludes nothing, while an in: of the same name would list nothing.
  - F1 × I2 = 2, claude-read: A typo in '-in:Tirp' silently excludes nothing and the results look unfiltered; the spec allows it but does not say the user gets any hint.
  - F2 × I3 = 6, claude-verify: A -in: with a misspelt or other-drive collection name resolves no collection ids in drives.py:549-557 and silently excludes nothing, so the user sees the full unfiltered list with no notice that the name matched nothing.
- claude-verify: AskScope (Ask page scope) now accepts kind 'epub', and its validation error messages gain a 'kinds:' / 'tags:' / 'folders:' / 'collections:' prefix through the shared apply_filter_normalisation.
  - F1 × I1 = 1, claude-verify: A user scoping Ask to EPUBs, or seeing a scope validation error, gets 'epub' accepted and a slightly different error wording; neither changes which files Ask reads in normal use.
  - single-scored

## Findings

A: 1
B: 3
C: 0

### claude-read:R4 — bucket A, LOW, open

Claim: The listed touch point frontend/src/app/app-api/smart-collection-members/route.ts is not changed, so its evaluation of a Smart Collection with only new tokens (e.g. '-path:Work') passes no memberLimit and reads every listing page even when meta.total exceeds 10,000.
Impact: If Notes and Clips evaluate members through this route (the knowledge addon is not in this checkout), a '-path:Work' Smart Collection on a large drive pages through the whole drive before the app falls back, contrary to the early stop that I17 states for 'the evaluation'. The result is the same; only time and load differ.
Evidence: route.ts:80-91 calls evaluateSmartCollection without memberLimit; smartCollectionEval.ts:142-148 stops early only when input.memberLimit is set; inNameResolution.ts:172 and memberTarget.ts:111 pass it.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Either pass memberLimit in route.ts when the caller needs only usability, or confirm that Notes/Clips do not use this route and drop it from the touch points.

</details>

### claude-read:R3 — bucket B, LOW, open

Claim: The change edits fixtures and expectations in other specs' existing tests (SPEC-CORE-117/099 member-target tests, SPEC-CORE-043 and SPEC-CORE-040 filter tests, SPEC-CORE-043/047/138 menu-order tests), and the frontend test directories are not in the touch-point list.
Impact: ReadingApp.memberTarget.test.tsx and VideoApp.memberTarget.test.tsx changed 'sf-neg' from '-tag:read'/'-tag:draft' to 'unread -tag:read'/'drafts -tag:draft', so the case once labelled 'a negated token, free text to the parser' now carries free text; the no-free-text negated member path is instead covered only by the new appTargetNegation.test.tsx. A reader of the old spec tests may not notice that their meaning changed.
Evidence: frontend/src/components/readingapp/__tests__/ReadingApp.memberTarget.test.tsx:78; frontend/src/components/videoapp/__tests__/VideoApp.memberTarget.test.tsx:121,176; frontend/src/lib/__tests__/searchScopeOperators.test.ts:326-337; frontend/src/lib/__tests__/semanticSearch.passages.test.ts:50-61.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R1 — bucket B, INFO, open

Claim: The addon refactor of apply_filter_normalisation and the KINDS change reach the Ask scope model (addons/intelligence/app/schemas.py AskScope), which is not in the touch-point list.
Impact: Ask scopes now accept kinds ['epub'] (previously 422), and every Ask-scope 422 detail text now carries a field-label prefix ('tags: ...', 'kinds: unknown kind: ...'). The spec's section 7 mentions the epub effect, but the planned touch points name only SearchFilter, KINDS and the /files/matching body.
Evidence: addons/intelligence/app/schemas.py:826 calls apply_filter_normalisation(self); addons/intelligence/app/file_matching.py:107 KINDS gains 'epub'; file_matching.py:130,148,167,170,189 error messages gain the '{label}:' prefix used by both models.
Repro: POST an Ask request with scope {kinds:['epub']}: before the change 422, after it accepted. A scope with kinds:['movie'] now answers detail 'kinds: unknown kind: movie'.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add addons/intelligence/app/schemas.py (AskScope) to the addon touch points, or note that the shared helper reaches it.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: The SearchFilter type change (favorite/liked from boolean to boolean|null, six new keys) reaches frontend/src/lib/semanticSearch.ts and frontend/src/lib/semanticSearchRequest.ts, which are not in the touch-point list.
Impact: Every consumer of SearchFilter now serialises favorite:false when the query holds -is:favorite; consumers not listed were not reviewed for the new shape. No user-visible defect found.
Evidence: frontend/src/lib/semanticSearch.ts:10,62 and semanticSearchRequest.ts:4,12,21 import SearchFilter; searchQuery.ts SearchFilter now has favorite: boolean | null; tests searchScopeOperators.test.ts and semanticSearch.passages.test.ts had their expected favorite:false changed to null.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Whether the knowledge addon's Notes/Clips use /app-api/smart-collection-members (the addon is not in this checkout).
- claude-read: No tests were run; parity claims are read from the test code only.
- claude-read: The design artefact and the R-5 records under docs/process/reviews were not opened.
- claude-read: Enclosing functions of ConditionMenu.tsx and useFolderFiles.ts were read only around the changed hunks.
- claude-verify: No tests or commands were executed; all checks are static reads of the tree at the commit.
- claude-verify: Did not diff the commit against origin/develop; 'changed/unchanged' relies on r7/product-files.txt and r7/test-files.txt plus the current file contents.
- claude-verify: Did not open the SearchQueryHeader.modified/scope/sizeDuration tests to confirm their menu-order assertions (part of R3).
- claude-verify: Did not read backend/app/routers/internal.py or the rest of drives.py beyond the exclude_collection handling.
- claude-verify: Did not confirm that the addons/intelligence checkout matches the submodule pointer in c11cd7219.
- claude-verify: Did not check the Ask path end-to-end to confirm that the core accepts an 'epub' kind in an Ask scope.

TOTAL: 4 findings
