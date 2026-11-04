# Triage: r1

## Warnings

- R-5 ran at fb2b2108a4428a1728cbf0ce503b3b59bf67cc9d, and these files changed since: .claude/rules/internal-api-policy.md, backend/app/database.py, backend/app/routers/internal.py, backend/app/services/fileops.py, docs/ADDON-DEVELOPMENT.md and 4 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-deep:SCOPE-2 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: useFolderFiles.ts: for a filtered query, `loading` no longer includes `semanticLoading` (F3).; semanticSearch.ts: `available: false` and blank query now return ok:false. For unfiltered queries, the modal therefore no longer caches an addon-unavailable answer as an empty stage, which is a small change for unfiltered behaviour.; file_matching.py deduplicates tags with str.casefold() while the core uses str.lower(). For tags such as 'ß'/'ss' the two validators count differently near the 20-tag cap (relevant to I10, outside this question).
- claude-deep: useFolderFiles changes `loading` for filtered queries to ignore semanticLoading, so the listing rows (and settledTotal) show before the meaning stage answers. The touch-point description for useFolderFiles does not mention this. Spec section 9's count rule is still satisfied, but the count can change when hits merge in.
- claude-deep: fetchSemanticHits now reports `available: false` as ok:false. An addon answering available:false is therefore never cached in the modal's search cache, where it previously was cached as empty hits.
- claude-deep: useFileSearch clears the merged rows when the old or the new query is filtered. This also drops listing rows, not only meaning hits, before the debounced refetch.
- claude-read: useFolderFiles.ts: for a filtered query, `loading` no longer includes `semanticLoading` (F3).
- claude-read: semanticSearch.ts: `available: false` and blank query now return ok:false. For unfiltered queries, the modal therefore no longer caches an addon-unavailable answer as an empty stage, which is a small change for unfiltered behaviour.
- claude-read: file_matching.py deduplicates tags with str.casefold() while the core uses str.lower(). For tags such as 'ß'/'ss' the two validators count differently near the 20-tag cap (relevant to I10, outside this question).
- claude-verify: useFolderFiles loading no longer waits for the filtered meaning stage (useFolderFiles.ts:565).

### unspecified_behavior

Note: useFolderFiles loading no longer waits for the filtered meaning stage (useFolderFiles.ts:565).
- claude-deep: useFolderFiles changes `loading` for filtered queries to ignore semanticLoading, so the listing rows (and settledTotal) show before the meaning stage answers. The touch-point description for useFolderFiles does not mention this. Spec section 9's count rule is still satisfied, but the count can change when hits merge in.
- claude-deep: fetchSemanticHits now reports `available: false` as ok:false. An addon answering available:false is therefore never cached in the modal's search cache, where it previously was cached as empty hits.
- claude-deep: useFileSearch clears the merged rows when the old or the new query is filtered. This also drops listing rows, not only meaning hits, before the debounced refetch.
- claude-read: useFolderFiles.ts: for a filtered query, `loading` no longer includes `semanticLoading` (F3).
- claude-read: semanticSearch.ts: `available: false` and blank query now return ok:false. For unfiltered queries, the modal therefore no longer caches an addon-unavailable answer as an empty stage, which is a small change for unfiltered behaviour.
- claude-read: file_matching.py deduplicates tags with str.casefold() while the core uses str.lower(). For tags such as 'ß'/'ss' the two validators count differently near the 20-tag cap (relevant to I10, outside this question).
- claude-verify: useFolderFiles loading no longer waits for the filtered meaning stage (useFolderFiles.ts:565).

### unspecified_behavior

Note: useFolderFiles changes `loading` for filtered queries to ignore semanticLoading, so the listing rows (and settledTotal) show before the meaning stage answers. The touch-point description for useFolderFiles does not mention this. Spec section 9's count rule is still satisfied, but the count can change when hits merge in.; fetchSemanticHits now reports `available: false` as ok:false. An addon answering available:false is therefore never cached in the modal's search cache, where it previously was cached as empty hits.; useFileSearch clears the merged rows when the old or the new query is filtered. This also drops listing rows, not only meaning hits, before the debounced refetch.
- claude-deep: useFolderFiles changes `loading` for filtered queries to ignore semanticLoading, so the listing rows (and settledTotal) show before the meaning stage answers. The touch-point description for useFolderFiles does not mention this. Spec section 9's count rule is still satisfied, but the count can change when hits merge in.
- claude-deep: fetchSemanticHits now reports `available: false` as ok:false. An addon answering available:false is therefore never cached in the modal's search cache, where it previously was cached as empty hits.
- claude-deep: useFileSearch clears the merged rows when the old or the new query is filtered. This also drops listing rows, not only meaning hits, before the debounced refetch.
- claude-read: useFolderFiles.ts: for a filtered query, `loading` no longer includes `semanticLoading` (F3).
- claude-read: semanticSearch.ts: `available: false` and blank query now return ok:false. For unfiltered queries, the modal therefore no longer caches an addon-unavailable answer as an empty stage, which is a small change for unfiltered behaviour.
- claude-read: file_matching.py deduplicates tags with str.casefold() while the core uses str.lower(). For tags such as 'ß'/'ss' the two validators count differently near the 20-tag cap (relevant to I10, outside this question).
- claude-verify: useFolderFiles loading no longer waits for the filtered meaning stage (useFolderFiles.ts:565).

## Findings

A: 1
B: 5
C: 0

### claude-deep:SCOPE-2 — bucket A, LOW, open

Claim: The addon's filter validator folds tags with str.casefold() for deduplication, and the core request model folds with str.lower(). For tags such as 'straße' and 'STRASSE', the two validators count a different number of distinct tags at the 20-tag cap.
Impact: A query with 20 distinct tags plus a casefold-only duplicate (for example ß/SS, or Greek final sigma) passes the addon's validator. The core then answers 422, the addon answers 503 'Filter unavailable', and the frontend silently shows no meaning hits instead of a 422. The reverse fold difference can also send the core a different tag list than the one the listing ANDs. This is unlikely in practice because it needs more than 20 tags with special casing.
Evidence: addons/intelligence/app/file_matching.py:65 `key = tag.casefold()`. backend/app/routers/internal.py, FileMatchingRequest.validate_tags: `deduped.setdefault(tag.lower(), tag)`. apply_file_filters in drives.py also folds with lower(). addons/intelligence/tests/test_filtered_search_contract.py has no case with a casefold-only pair (grep for casefold/ß found none).
Repro: not_reproduced. Reasoning: tags = 20 distinct ASCII names + ['straße','STRASSE']. lower() gives 22 keys, so the core answers 422. casefold() gives 21 keys, so the addon also rejects that list. With 19 names + the pair, the addon dedups to 20 (accepted) and forwards one of the pair; the core lowercases the remaining tag and matches only the 'straße' spelling. The listing ANDs both spellings as separate clauses, so the meaning scope and the listing can differ.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Use the same fold in both validators: lower(), matching the listing's by_fold. Add a Layer 2 parity row with a casefold-only pair.

</details>

### claude-deep:SCOPE-3 — bucket B, LOW, open

Claim: docs/addons/intelligence.md says 'at most 10 tags apply', and the spec's SPEC-ADDON-047 step 1 says 'the caps of 10 apply'. Both the addon (TAG_MAX_COUNT = 20) and the core (_MATCHING_MAX_TAGS = 20) cap tags at 20.
Impact: A reader who trusts the addon documentation could 'fix' one validator to 10. That would break the I10 parity and reject valid filtered queries of 11-20 tags with 422.
Evidence: docs/addons/intelligence.md (diff line added after line 170): 'and at most 10 tags apply'. addons/intelligence/app/file_matching.py:27 TAG_MAX_COUNT = 20. backend/app/routers/internal.py _MATCHING_MAX_TAGS = 20. docs/ADDON-DEVELOPMENT.md correctly says 20.
Repro: Read the three locations above and compare the numbers.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the 'at most 10 tags apply' clause from docs/addons/intelligence.md, or replace it with the 20-tag, 200-character and 8-kind caps.

</details>

### claude-read:F3 — bucket B, LOW, open

Claim: useFolderFiles.ts changes the results page's `loading` for filtered queries: `loading` no longer waits for the meaning stage when `parsed.hasOperators` is true. The touch-point description of this file (meaning stage, q/filter, drop previous hits, continuation key) does not cover this.
Impact: On the results page, a filtered query's listing rows and count now settle before the meaning hits arrive, and the hits then merge in later. Unfiltered queries still hold `loading` until the meaning stage settles. The two kinds of query therefore show different loading behaviour, which no invariant or touch point plans for.
Evidence: frontend/src/components/folder/useFolderFiles.ts (diff tail): `? paginatedLoading || (semanticLoading && !parsed.hasOperators)`, with the comment 'A filtered query's meaning stage is an enhancement over the listing'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the filtered-query loading rule in the touch-point description of useFolderFiles.ts, or drop the condition so both kinds of query load the same way.

</details>

### claude-deep:SCOPE-1 — bucket B, INFO, open

Claim: The diff edits six frontend files that the touch-point list does not name: the repository guard inventories frontend/src/__tests__/anchoredDropdowns.test.ts, core-search-vocabulary.test.ts, ime-enter-guard.test.ts, popup-dismissal.test.ts, frontend/src/components/__tests__/toolbarMenuHome.test.ts, and the fixture registry frontend/e2e-layout/spec-viewport.spec.ts.
Impact: No user-facing effect. Each edit adds SearchQueryHeader.tsx / SearchFilterChips.tsx / search-header.html to an allow-list and raises its count (takes-the-surface 5->6, vocabulary keys 41->56, Enter files 18->19, fixtures 13->14, a new popup entry, a new useMenuSurface importer). These follow mechanically from the new components using an anchored dropdown, Enter handling, a popup dismissal, the shared ToolbarMenu surface and a new layout fixture. They were not planned, though, and a reviewer reading only the touch points would not expect them.
Evidence: Diff hunks: anchoredDropdowns.test.ts:75,122; core-search-vocabulary.test.ts:29-31,94; ime-enter-guard.test.ts:38,100; popup-dismissal.test.ts:153-156; toolbarMenuHome.test.ts:88; spec-viewport.spec.ts:33,39. The touch points name only 'Frontend tests next to the existing search tests' and 'a frontend/e2e-layout/ case'.
Repro: Compare the diff's file list with the Touch points section of docs/specs/filtered-semantic-search.md. None of these six paths, and none of the guard tests they hold, is named there.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the guard-inventory registrations as implicit touch points of any new search component, or list them in the spec's touch points.

</details>

### claude-read:F1 — bucket B, INFO, open

Claim: The diff edits five repository-wide frontend inventory/guard tests that the touch-point list does not name: frontend/src/__tests__/anchoredDropdowns.test.ts, frontend/src/__tests__/core-search-vocabulary.test.ts, frontend/src/__tests__/ime-enter-guard.test.ts, frontend/src/__tests__/popup-dismissal.test.ts and frontend/src/components/__tests__/toolbarMenuHome.test.ts.
Impact: Nothing a user can hit. These registries pin conventions (anchored-dropdown direction roles, the search i18n key population, IME Enter guards, popup dismissal homes, ToolbarMenu importers), and the change raises their counts (5->6 takes-the-surface, 41->56 keys, 18->19 Enter files) to register SearchQueryHeader/SearchFilterChips. A reviewer working only from the touch-point list would not expect convention-guard edits. The list says only 'Frontend tests next to the existing search tests', which does not cover them.
Evidence: Diff hunks: anchoredDropdowns.test.ts adds SearchQueryHeader.tsx as 'takes-the-surface' and changes toHaveLength(5) to 6; core-search-vocabulary.test.ts adds SearchFilterChips.tsx:5 and SearchQueryHeader.tsx:12 and changes used.length 41 to 56; ime-enter-guard.test.ts adds SearchQueryHeader.tsx to TEXT_FIELD_ENTER, 18 to 19; popup-dismissal.test.ts registers SearchQueryHeader.tsx; toolbarMenuHome.test.ts adds SearchQueryHeader.tsx to the ToolbarMenu importers.
Repro: Compare the diff's file list with the touch-point list. None of the five paths, and no 'convention registry' entry, appears in the list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add 'core convention registries under frontend/src/__tests__/ and toolbarMenuHome.test.ts (new SearchQueryHeader / SearchFilterChips entries)' to the touch-point list.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The diff edits the e2e-layout fixture registry frontend/e2e-layout/spec-viewport.spec.ts (it adds search-header.html and changes FIXTURE_COUNT from 13 to 14). The touch-point list names only 'a frontend/e2e-layout/ case for the header'.
Impact: Nothing a user can hit. The new fixture is also subjected to the shared viewport-meta check, which is wider than the single layout case the list planned.
Evidence: frontend/e2e-layout/spec-viewport.spec.ts diff: FIXTURES gains "search-header.html" and FIXTURE_COUNT goes from 13 to 14.
Repro: Compare the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name spec-viewport.spec.ts's fixture registry next to the e2e-layout case in the touch-point list.

</details>

## Not verified

- claude-deep: The full addon diff (truncated at 200 KB). I read only file_matching.py and routers/search.py, plus grep hits; the scoped channel code in app/search.py was not read line by line.
- claude-deep: Whether any other addon file (schemas, docs inside the submodule) changed in the gitlink range. Without git I could only search for new symbols.
- claude-deep: Whether frontend/src/app/drive/[name]/search/page.tsx needed a change for I21. I inferred that it did not from the diff and the test.
- claude-deep: I ran no tests and executed nothing.
- claude-read: The submodule portion of the diff was truncated. I found the addon files the change reaches by grepping the worktree, not from the diff, so an addon file changed without mentioning file_matching/filter (for example a CHANGELOG or config) could be missed.
- claude-read: I could not confirm that the worktree's submodule checkout is at ef5bc2e.
- claude-read: I did not run any test.
- claude-verify: I read the working tree, not the diff against origin/develop, so the before-values (5, 41, 18, 13) are not verified.
- claude-verify: How the addon maps a core 422 to its own response (503 or 422) is not verified.
- claude-verify: No tests were run.

TOTAL: 6 findings
