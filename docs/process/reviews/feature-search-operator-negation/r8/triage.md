# Triage: r8

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- artifact of claude-read is missing
- artifact of claude-deep is missing
- no read or mutate reviewer in the expected set

## Read coverage

Product files:
- addons/intelligence/app/file_matching.py — missing from coverage
- backend/app/routers/drives.py — missing from coverage
- backend/app/routers/internal.py — missing from coverage
- backend/app/routers/shelves.py — missing from coverage
- frontend/e2e-components/fixtures/app.tsx — missing from coverage
- frontend/e2e-components/search-chips-negated.spec.ts — missing from coverage
- frontend/e2e-components/spec-viewport.spec.ts — missing from coverage
- frontend/src/components/SmartFolderSaveButton.tsx — missing from coverage
- frontend/src/components/folder/useFolderFiles.ts — missing from coverage
- frontend/src/components/search/ConditionMenu.tsx — missing from coverage
- frontend/src/components/search/InNameNotice.tsx — missing from coverage
- frontend/src/components/search/SearchFilterChips.tsx — missing from coverage
- frontend/src/components/search/SearchQueryHeader.tsx — missing from coverage
- frontend/src/components/search/useFileSearch.ts — missing from coverage
- frontend/src/components/search/useLauncherRows.ts — missing from coverage
- frontend/src/components/videoapp/VideoAppHeader.tsx — missing from coverage
- frontend/src/components/videoapp/useVideoApp.ts — missing from coverage
- frontend/src/lib/appTarget.ts — missing from coverage
- frontend/src/lib/inNameResolution.ts — missing from coverage
- frontend/src/lib/listingRequest.ts — missing from coverage
- frontend/src/lib/memberTarget.ts — missing from coverage
- frontend/src/lib/searchQuery.ts — missing from coverage
- frontend/src/lib/smartCollectionEval.ts — missing from coverage
- frontend/src/lib/videoAppTarget.ts — missing from coverage
- frontend/src/messages-core/en.json — missing from coverage
- frontend/src/messages-core/ja.json — missing from coverage

Test files:
- addons/intelligence/tests/test_filtered_search_file_ids_conditions.py — missing from coverage
- addons/intelligence/tests/test_search_negation_filter.py — missing from coverage
- addons/intelligence/tests/test_search_negation_filter_scope.py — missing from coverage
- backend/tests/test_filtered_drive_files_contract.py — missing from coverage
- backend/tests/test_search_negation_operators.py — missing from coverage
- frontend/src/__tests__/appTargetNegation.test.tsx — missing from coverage
- frontend/src/__tests__/core-search-vocabulary.test.ts — missing from coverage
- frontend/src/components/__tests__/GlobalSearch.negation.test.tsx — missing from coverage
- frontend/src/components/__tests__/SearchPage.negation.test.tsx — missing from coverage
- frontend/src/components/__tests__/SmartFolderSaveButton.negation.test.tsx — missing from coverage
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — missing from coverage
- frontend/src/components/folder/__tests__/useFolderFiles.scope.test.tsx — missing from coverage
- frontend/src/components/readingapp/__tests__/ReadingApp.memberTarget.test.tsx — missing from coverage
- frontend/src/components/search/__tests__/SearchFilterChips.negation.test.tsx — missing from coverage
- frontend/src/components/search/__tests__/SearchQueryHeader.modified.test.tsx — missing from coverage
- frontend/src/components/search/__tests__/SearchQueryHeader.negation.test.tsx — missing from coverage
- frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx — missing from coverage
- frontend/src/components/search/__tests__/SearchQueryHeader.sizeDuration.test.tsx — missing from coverage
- frontend/src/components/search/__tests__/useFileSearch.filtered.test.tsx — missing from coverage
- frontend/src/components/videoapp/__tests__/VideoApp.memberTarget.test.tsx — missing from coverage
- frontend/src/components/videoapp/__tests__/VideoApp.negationTargetMenu.test.tsx — missing from coverage
- frontend/src/lib/__tests__/inNameResolution.negation.test.ts — missing from coverage
- frontend/src/lib/__tests__/listingRequest.negation.test.ts — missing from coverage
- frontend/src/lib/__tests__/searchImpossibleConditions.test.ts — missing from coverage
- frontend/src/lib/__tests__/searchNegationOperators.test.ts — missing from coverage
- frontend/src/lib/__tests__/searchQuery.test.ts — missing from coverage
- frontend/src/lib/__tests__/searchScopeOperators.test.ts — missing from coverage
- frontend/src/lib/__tests__/searchSuggestions.negation.test.ts — missing from coverage
- frontend/src/lib/__tests__/semanticSearch.passages.test.ts — missing from coverage
- frontend/src/lib/__tests__/smartCollectionEval.negation.test.ts — missing from coverage

## Needs a human

### incomplete_read

Note: addons/intelligence/app/file_matching.py (missing), backend/app/routers/drives.py (missing), backend/app/routers/internal.py (missing), backend/app/routers/shelves.py (missing), frontend/e2e-components/fixtures/app.tsx (missing), frontend/e2e-components/search-chips-negated.spec.ts (missing), frontend/e2e-components/spec-viewport.spec.ts (missing), frontend/src/components/SmartFolderSaveButton.tsx (missing), frontend/src/components/folder/useFolderFiles.ts (missing), frontend/src/components/search/ConditionMenu.tsx (missing), frontend/src/components/search/InNameNotice.tsx (missing), frontend/src/components/search/SearchFilterChips.tsx (missing), frontend/src/components/search/SearchQueryHeader.tsx (missing), frontend/src/components/search/useFileSearch.ts (missing), frontend/src/components/search/useLauncherRows.ts (missing), frontend/src/components/videoapp/VideoAppHeader.tsx (missing), frontend/src/components/videoapp/useVideoApp.ts (missing), frontend/src/lib/appTarget.ts (missing), frontend/src/lib/inNameResolution.ts (missing), frontend/src/lib/listingRequest.ts (missing), frontend/src/lib/memberTarget.ts (missing), frontend/src/lib/searchQuery.ts (missing), frontend/src/lib/smartCollectionEval.ts (missing), frontend/src/lib/videoAppTarget.ts (missing), frontend/src/messages-core/en.json (missing), frontend/src/messages-core/ja.json (missing)
Paths:
- addons/intelligence/app/file_matching.py
- backend/app/routers/drives.py
- backend/app/routers/internal.py
- backend/app/routers/shelves.py
- frontend/e2e-components/fixtures/app.tsx
- frontend/e2e-components/search-chips-negated.spec.ts
- frontend/e2e-components/spec-viewport.spec.ts
- frontend/src/components/SmartFolderSaveButton.tsx
- frontend/src/components/folder/useFolderFiles.ts
- frontend/src/components/search/ConditionMenu.tsx
- frontend/src/components/search/InNameNotice.tsx
- frontend/src/components/search/SearchFilterChips.tsx
- frontend/src/components/search/SearchQueryHeader.tsx
- frontend/src/components/search/useFileSearch.ts
- frontend/src/components/search/useLauncherRows.ts
- frontend/src/components/videoapp/VideoAppHeader.tsx
- frontend/src/components/videoapp/useVideoApp.ts
- frontend/src/lib/appTarget.ts
- frontend/src/lib/inNameResolution.ts
- frontend/src/lib/listingRequest.ts
- frontend/src/lib/memberTarget.ts
- frontend/src/lib/searchQuery.ts
- frontend/src/lib/smartCollectionEval.ts
- frontend/src/lib/videoAppTarget.ts
- frontend/src/messages-core/en.json
- frontend/src/messages-core/ja.json

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-verify: Frontend parser, chips, ConditionMenu, impossible-check and -in: refusal (I7, I8, I9, I14, I15, I16, I18) were not read.
- claude-verify: Smart Collection evaluation early stop and app targets (I12, I13, I17) were not read.
- claude-verify: Exact numeric caps (FOLDER_MAX_LENGTH, COLLECTION_MAX_COUNT, TAG_MAX_COUNT etc.) in the addon were not compared against the core constants.
- claude-verify: _folder_subtree semantics for I5 (sibling prefix and case) were not inspected.
- claude-verify: No tests were run; the tools available are read-only.

TOTAL: 0 findings
