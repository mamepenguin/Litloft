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
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: canOfferContinuation now also checks searchKinds.impossible, which the spec does not ask for.
- claude-deep: canOfferContinuation now also checks impossible kinds (F1).
- claude-deep: hasOperators drives GlobalSearch routing, the FolderBrowser AddonSlot and the SearchResultsList highlighting for the new operators (F2).
- claude-read: canOfferContinuation now also checks searchKinds.impossible, which the spec does not ask for.
- claude-verify: canOfferContinuation also checks searchKinds.impossible.
- claude-verify: hasOperators now covers size and duration, which changes GlobalSearch, FolderBrowser, SearchResultsList and the search page.

### unspecified_behavior

Note: canOfferContinuation also checks searchKinds.impossible.; hasOperators now covers size and duration, which changes GlobalSearch, FolderBrowser, SearchResultsList and the search page.
- claude-deep: canOfferContinuation now also checks impossible kinds (F1).
- claude-deep: hasOperators drives GlobalSearch routing, the FolderBrowser AddonSlot and the SearchResultsList highlighting for the new operators (F2).
- claude-read: canOfferContinuation now also checks searchKinds.impossible, which the spec does not ask for.
- claude-verify: canOfferContinuation also checks searchKinds.impossible.
- claude-verify: hasOperators now covers size and duration, which changes GlobalSearch, FolderBrowser, SearchResultsList and the search page.

### unspecified_behavior

Note: canOfferContinuation now also checks impossible kinds (F1).; hasOperators drives GlobalSearch routing, the FolderBrowser AddonSlot and the SearchResultsList highlighting for the new operators (F2).
- claude-deep: canOfferContinuation now also checks impossible kinds (F1).
- claude-deep: hasOperators drives GlobalSearch routing, the FolderBrowser AddonSlot and the SearchResultsList highlighting for the new operators (F2).
- claude-read: canOfferContinuation now also checks searchKinds.impossible, which the spec does not ask for.
- claude-verify: canOfferContinuation also checks searchKinds.impossible.
- claude-verify: hasOperators now covers size and duration, which changes GlobalSearch, FolderBrowser, SearchResultsList and the search page.

## Findings

A: 0
B: 5
C: 0

### claude-deep:F1 — bucket B, LOW, open

Claim: The change to canOfferContinuation in useFolderFiles.ts also adds the existing impossible-kinds check, so it changes the continuation for queries that have no size or duration token.
Impact: For a query with impossible kinds (for example conflicting type: operators), the 'show more by similarity' continuation is now withheld where it was offered before. The touch-point list only covers the new range check there.
Evidence: frontend/src/components/folder/useFolderFiles.ts, canOfferContinuation: the diff adds `!searchKinds.impossible && !rangeImpossible`. The spec asks only for the range check on the continuation. The new tests cover only the range cases for continuation.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either drop `!searchKinds.impossible` from canOfferContinuation, or name it in the spec and add a test.

</details>

### claude-read:R1-1 — bucket B, LOW, open

Claim: The continuation gate `canOfferContinuation` in useFolderFiles.ts gains `!searchKinds.impossible` in addition to `!rangeImpossible`, which changes behavior for existing impossible-kind queries that have no size or duration token.
Impact: For a query with contradictory `type:` operators and no `size:`/`duration:`, the "show more by similarity" continuation was previously decided without this check and now is not offered. This is outside the touch-point list's stated scope (the impossible-range check) and is a behavior change for queries that should be unchanged.
Evidence: frontend/src/components/folder/useFolderFiles.ts, hunk at `canOfferContinuation`: added lines `!searchKinds.impossible &&` and `!rangeImpossible &&`. The spec only says the impossible-range check applies wherever the impossible-kinds check applies today. No test in the diff covers the impossible-kinds continuation.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Remove `!searchKinds.impossible` from the gate, or add a test that pins the intended behavior.

</details>

### claude-deep:F2 — bucket B, INFO, open

Claim: Setting hasOperators for size: and duration: tokens changes the behavior of three frontend consumers that are not in the touch-point list: GlobalSearch, FolderBrowser and SearchResultsList.
Impact: A modal query such as `size:>1GB` now routes to the search page (GlobalSearch.tsx:314). FolderBrowser hides the AddonSlot (FolderBrowser.tsx:649). SearchResultsList highlights only the leftover text (SearchResultsList.tsx:53-54). The behavior is plausible, but no listed touch point or test covers it.
Evidence: frontend/src/components/GlobalSearch.tsx:314, frontend/src/components/FolderBrowser.tsx:649, frontend/src/components/search/SearchResultsList.tsx:53-54 all branch on parseSearchQuery(...).hasOperators, which the diff now sets for the two new operators.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add these three files to the touch-point list as read-only consumers, or add one test that a size: query routes to the search page.

</details>

### claude-deep:F3 — bucket B, INFO, open

Claim: The existing test frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx is edited for the new menu order. It is neither a SearchFilter or ParsedQuery literal nor named in the touch points.
Impact: None for users. The touch-point list undercounts the existing tests that change.
Evidence: The diff changes the first-level menu expectation to [Tag, Type, Folder, Collection, Size, Length, Favorites].
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R1-2 — bucket B, INFO, open

Claim: The diff edits two existing tests that the touch-point list does not name: SearchQueryHeader.scope.test.tsx (the first-level menu order expectation) and the addon's test_filtered_search_contract.py (the allowed key set of the matching request).
Impact: Both edits change pinned existing expectations (the menu rows, and the set of keys the addon may send to /files/matching) without being declared, so a reader of the touch points would not look for them.
Evidence: frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx: the expected rows list gains "Size", "Length". addons/intelligence/tests/test_filtered_search_contract.py: the `set(sent) <= {...}` gains "sizes", "durations". The touch points name only tests that build a SearchFilter or ParsedQuery literal and the addon's acceptance tests for the new fields.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add these two test files to the touch-point list.

</details>

## Not verified

- claude-deep: I did not run any test.
- claude-deep: I did not read the full bodies of searchQuery.ts, useFolderFiles.ts or drives.py beyond the diff.
- claude-deep: I did not diff the submodule against its own repository.
- claude-deep: I did not check whether other non-test code outside frontend/src and backend/app builds a SearchFilter or ParsedQuery.
- claude-deep: I did not review the correctness of the parser, the SQL CAST or concurrency, only the scope question.
- claude-read: I did not read the source files beyond the diff, so I did not check for other callers of the changed functions.
- claude-read: I did not check the contents of the review directory or invariants.md revisions.
- claude-read: I could not run any tests.
- claude-verify: Backend parsing and filtering (I1-I4, I8, I12).
- claude-verify: The git diff itself, because I cannot run git.
- claude-verify: Whether the impossible-kinds check was absent from the continuation gate before this commit.
- claude-verify: The addon code.

TOTAL: 5 findings
