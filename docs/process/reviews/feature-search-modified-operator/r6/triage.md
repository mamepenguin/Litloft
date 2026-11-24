# Triage: r6

## Warnings

- R-5 ran at 403fe14c80972d81d0bc297a0e631bcb6ce93f11, and these files changed since: backend/app/services/scanner.py; run R-5 again if any of them changes what a user sees

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

## Read coverage

Product files:
- addons/intelligence/app/file_matching.py — partial: Grep with line numbers of the modified hunks (85-91, 220-231) plus the supplied diff; the rest was not opened.; partial: Read lines 40-234: constants, the parse helpers including _parse_modified, _normalise_comparisons, apply_filter_normalisation and SearchFilter.
- backend/app/database.py — partial: Lines 557-571 (the migration hunk) via grep context.; partial: Read the modified_at migration block (lines 550-574) only.
- backend/app/models.py — partial: Lines 91-97 (the column) via grep context.; partial: Read the single changed hunk (File.modified_at column) in the supplied diff; the file itself was not opened.
- backend/app/routers/drives.py — partial: Lines 165-294 (parsers, range filters), 960-1144 (filtered_drive_files, FileFiltersQuery, _list_drive_files) and 1440-1610 (create_text_file). The folder-counts hunk near 1306 was read only in the diff.; partial: Read lines 168-292 (wire-form parsers, _apply_range_filters) and 1440-1620 (create_text_file revive and insert). Hunks in apply_file_filters, filtered_drive_files, FileFiltersQuery, _list_drive_files and _folder_counts were read only in the supplied diff.
- backend/app/routers/internal.py — partial: Lines 40-46, 647-651 and 696-736 via grep context.; partial: Read lines 636-735: FileMatchingRequest with its validators, and files_matching.
- backend/app/routers/shelves.py — partial: Lines 472-478 via grep context.; partial: Read lines 455-484 (the _shelves call to filtered_drive_files).
- backend/app/schemas.py — partial: Lines 58-64 and 1301-1307 via grep context.; partial: Read the two one-line hunks (FileResponse.modified_at, file_to_response) in the supplied diff; the file itself was not opened.
- backend/app/services/content_write.py — partial: Lines 8-14 and 69-77 via grep context.; partial: Read lines 40-84 of write_text_content, which contain the change.
- backend/app/services/fileops.py — partial: Lines 26-32 and 300-306 via grep context.; partial: Read lines 260-319 of copy_file around the new File literal.
- backend/app/services/markdown_relations.py — partial: Lines 20-26 and 634-642 via grep context.; partial: Read lines 580-648: rewrite_basename_in_drive's loop and its return.
- backend/app/services/mtime.py — full: Read the whole file.; full: Whole file read.
- backend/app/services/scanner.py — partial: Lines 110-149 and 260-839, which cover every changed hunk with its enclosing function; the import lines 1-40 were read only in the diff.; partial: Read lines 80-133, 260-419 (_ensure_md_id_for_new_file, register_single_file) and 440-819 (both scan passes, inserts and moves).
- backend/app/services/upload.py — partial: Lines 22-28, 290-296, 360-367 and 383-389 via grep context.; partial: Read lines 270-394 of complete_upload.
- frontend/e2e-components/fixtures/clipsRow.tsx — partial: Grep of line 53 plus the diff hunk.; partial: Read the one-line hunk in the diff; confirmed line 53 by Grep.
- frontend/e2e-components/fixtures/justifiedHold.tsx — partial: Grep of line 55 plus the diff hunk.; partial: Read the one-line hunk in the diff; confirmed line 55 by Grep.
- frontend/e2e-components/fixtures/notesLibrary.tsx — partial: Grep of line 46 plus the diff hunk.; partial: Read the one-line hunk in the diff; confirmed line 46 by Grep.
- frontend/e2e-components/fixtures/videoCardByline.tsx — partial: Grep of line 41 plus the diff hunk.; partial: Read the one-line hunk in the diff; confirmed line 41 by Grep.
- frontend/e2e-epub/preview/app.tsx — partial: Grep of line 48 plus the diff hunk.; partial: Read the one-line hunk in the diff; confirmed line 48 by Grep.
- frontend/src/app/app-api/smart-collection-members/route.ts — full: Read the whole file.; partial: Grep lines 51-88 (tz parsing, the absolute check, the evaluation call) plus the diff.
- frontend/src/components/FileListRow.tsx — partial: Grep of lines 158 and 176 plus the diff.; partial: Read the two changed lines in the diff; confirmed lines 158 and 176 by Grep.
- frontend/src/components/folder/FolderTreePane.tsx — partial: Grep of line 139 plus the diff.; partial: Read the one-line hunk in nodeToFile in the diff; confirmed line 139 by Grep.
- frontend/src/components/folder/useFolderFiles.ts — partial: Lines 170-320 read. The listing hunk (around 368) and the filter hunk (around 467) were read in the diff and by grep.; partial: Read lines 170-479: run `now`, resolveModified, in: resolution, fetchPage and filter.
- frontend/src/components/search/ConditionMenu.tsx — partial: Lines 420-540 read (presets filter, presetLabel, preset lists). The type and MODIFIED_PRESETS hunks and the first-level entry hunk were read only in the diff.; partial: Read lines 400-564 (preset filters, modifiedPresetList). The preset definitions and the root entry (lines 133-145 and 700-720) were read in the diff and by Grep.
- frontend/src/components/search/SearchFilterChips.tsx — partial: Grep of lines 34 and 75 plus the diff.; partial: Read the two hunks (chipValue, label) in the diff; confirmed lines 34 and 75 by Grep.
- frontend/src/components/search/SearchQueryHeader.tsx — partial: Lines 271-287 (the entries array).; partial: Read lines 262-286, the ConditionMenu entries.
- frontend/src/components/search/useFileSearch.ts — partial: Lines 30-270 read, covering every changed hunk.; partial: Read lines 95-269 (the run effect). The listingParams hunk was read in the diff.
- frontend/src/lib/appTarget.ts — partial: Grep of line 97 plus the diff.; partial: Read lines 80-129 (resolveAppTarget).
- frontend/src/lib/inNameResolution.ts — partial: Grep of line 110 plus the diff hunks.; partial: Read lines 100-159 (resolveInNames).
- frontend/src/lib/listingRequest.ts — partial: Grep of lines 30 and 79-80 plus the diff.; partial: Read the hunks in the diff; Grep confirmed lines 30, 79-80 and the listingUrl/listingQueryUrl builders at 87-104.
- frontend/src/lib/memberTarget.ts — full: Read the whole file.; partial: Grep of lines 73-75 plus the diff.
- frontend/src/lib/searchMerge.ts — partial: Grep of line 219 plus the diff.; partial: Read the one-line hunk in fileItemFromHit in the diff; confirmed line 219 by Grep.
- frontend/src/lib/searchQuery.ts — partial: Lines 225-524 read (parsing, identity, zone resolution, impossible range). The type and constant hunks (1-140) and the interpret/parse/chip hunks (614-990) were read only in the diff.; partial: Read lines 225-523 (modified parsing, zone resolution, resolveModified, comparisonsImpossible). The interpret/parseSearchQuery/filter/chips hunks were read in the diff.
- frontend/src/lib/smartCollectionEval.ts — full: Read the whole file.; partial: Grep of lines 24-134 plus the diff.
- frontend/src/lib/videoAppTarget.ts — full: Read the whole file.; partial: Grep of lines 31 and 48 plus the diff.
- frontend/src/messages-core/en.json — partial: Lines 328 and 335-337 via grep.; partial: Read the four added keys in the diff; confirmed lines 328 and 335-337 by Grep.
- frontend/src/messages-core/ja.json — partial: Lines 328 and 335-337 via grep.; partial: Read the four added keys in the diff; confirmed lines 328 and 335-337 by Grep.
- frontend/src/types/index.ts — partial: Grep of line 66 plus the diff.; partial: Read the FileItem.modified_at hunk in the diff; confirmed line 66 by Grep.
- mcp-server/src/tools/ask.ts — partial: Grep of line 90 plus the diff.; partial: Read the import and query hunks in the diff; confirmed lines 6 and 90 by Grep.
- mcp-server/src/tools/collections.ts — partial: Grep of lines 13-16 and 130 plus the diff.; partial: Read the hostTimeZone and query hunks in the diff; confirmed lines 15 and 130 by Grep.
- mcp-server/src/tools/read.ts — partial: Grep of line 129 plus the diff.; partial: Read the SUMMARY_FIELDS hunk in the diff; confirmed line 129 by Grep.

Test files:
- addons/intelligence/tests/test_filtered_search_contract.py — partial: Diff hunk only.; partial: Read only the one-line hunk in the diff.
- addons/intelligence/tests/test_search_modified_filter.py — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- backend/tests/test_file_modified_at.py — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- backend/tests/test_search_modified_operator.py — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/__tests__/DriveHome.test.tsx — partial: Diff hunks only (fixture field).; partial: Read only the fixture hunks in the diff.
- frontend/src/__tests__/DuplicatesSection.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/FileCard.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/accent-budget.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/core-search-vocabulary.test.ts — partial: Diff hunks only (count changes).; partial: Read only the count hunks in the diff.
- frontend/src/__tests__/driveHomeFailureState.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/driveHomeHiddenEntries.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/driveHomeSectionOrder.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/homeAppEntries.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/homeContinueDesk.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/homeResumeRows.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/homeShortcuts.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/matchTimestampPills.parity.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/__tests__/section-rows.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/app/app-api/__tests__/smartCollectionMembers.modified.test.ts — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/app/app-api/__tests__/smartCollectionMembers.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/FileDetail/__tests__/MediaPlayerBlock.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/AudioPlayer.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/CollectionDetail.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/CollectionItemsPane.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/CollectionPanel.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/ContinueWatchingSection.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/FileActions.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/FileCard.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/FileContextMenu.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/FileDetailFullScreen.smartCollection.test.tsx — partial: Lines 380-410 opened (savedSmartFolder mock); other hunk from the diff.; partial: Opened lines 380-410 (the savedSmartFolder fixture); other hunk read in the diff.
- frontend/src/components/__tests__/FileDetailFullScreen.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/FileListRow.modifiedDate.test.tsx — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/components/__tests__/FilePreview.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/FolderBrowser.snapshotScroll.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/FolderListRow.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/GlobalSearch.inSmartCollection.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/GlobalSearch.jump.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/GlobalSearch.scope.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/GlobalSearch.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/ImageGallery.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/LikeButton.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/MatchOverlay.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/SearchPage.filtered.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/SearchPage.inSmartCollection.loading.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/SearchPage.inSmartCollection.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/SearchPage.resultsBar.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/SearchPage.semanticContinuation.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/SearchPage.smartCollectionPlay.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/SearchPage.smartCollectionSlot.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/SearchPage.smartFolderOverwrite.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/TrustTierControl.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/fileActionsMenuFixtureParity.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/justifiedGrid.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/justifiedGridFixtureParity.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/listMetaRendering.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/listOrdinals.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/primaryMetaRendering.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/readingVideoLayoutFixtureParity.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/sourceCardExcerpt.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/__tests__/sourceCardExcerptText.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/FolderContent.moreMayFollow.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/FolderContent.searchFilter.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/FolderContent.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/RightPaneFile.inboxNav.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/RightPaneFile.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/useFolderFiles.continue.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/useFolderFiles.modified.test.tsx — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/components/folder/__tests__/useFolderFiles.scope.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/useFolderFiles.sizeDuration.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/useFolderFiles.sizeDurationStates.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/folder/__tests__/useFolderFiles.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/readingapp/__tests__/ReadingCard.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/search/__tests__/MergedResultItem.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/search/__tests__/PassageList.screenText.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/search/__tests__/PassageList.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/search/__tests__/SearchFilterChips.modified.test.tsx — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/components/search/__tests__/SearchQueryHeader.modified.test.tsx — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx — partial: Diff hunk only (expected first-level order).; partial: Read only the order hunk in the diff.
- frontend/src/components/search/__tests__/SearchQueryHeader.sizeDuration.test.tsx — partial: Diff hunk only (expected first-level order).; partial: Read only the order hunk in the diff.
- frontend/src/components/search/__tests__/useFileSearch.modified.test.tsx — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/components/search/__tests__/useFileSearch.scope.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/components/search/__tests__/useFileSearch.sizeDuration.test.tsx — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/hooks/__tests__/useCollectionViewMode.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/hooks/__tests__/useFolderFilter.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/lib/__tests__/appTarget.modified.test.ts — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/lib/__tests__/dominantKind.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/lib/__tests__/listSnapshot.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/lib/__tests__/primaryMeta.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/lib/__tests__/searchCache.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/lib/__tests__/searchCapture.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/lib/__tests__/searchMerge.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/lib/__tests__/searchModifiedOperator.test.ts — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/lib/__tests__/searchPassages.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- frontend/src/lib/__tests__/smartCollectionEval.modified.test.ts — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- frontend/src/lib/__tests__/smartCollectionEval.test.ts — partial: Diff hunk only.; partial: Read only the fixture hunk in the diff.
- mcp-server/src/__tests__/modifiedOperator.test.ts — full: New file; read its whole content in the diff.; partial: New file read in full through the diff; not opened.
- mcp-server/src/__tests__/smartCollections.test.ts — partial: Diff hunks only (tz added to expected query).; partial: Read only the two expectation hunks in the diff.

## Needs a human

### unspecified_behavior

Note: os.utime in _ensure_md_id_for_new_file now runs on every new-note registration (scanner pass 2 and register_single_file). Grep shows no other caller, so the reach matches I14.; The search cache (readSearchCache, keyed by query text) can show a relative modified: result computed at an earlier now until revalidation completes. The spec accepts this ('the search cache keys by the query text').; ResolvedModified.hasAbsolute is computed but the route recomputes the absolute check on its own; nothing reads the field.
- claude-read: os.utime in _ensure_md_id_for_new_file now runs on every new-note registration (scanner pass 2 and register_single_file). Grep shows no other caller, so the reach matches I14.
- claude-read: The search cache (readSearchCache, keyed by query text) can show a relative modified: result computed at an earlier now until revalidation completes. The spec accepts this ('the search cache keys by the query text').
- claude-read: ResolvedModified.hasAbsolute is computed but the route recomputes the absolute check on its own; nothing reads the field.
- claude-verify: In the intelligence addon's Ask scope, a modified: token is now parsed as an operator and silently left out of the scope and the count. Before this change it was free text, which was also dropped.

### unspecified_behavior

Note: In the intelligence addon's Ask scope, a modified: token is now parsed as an operator and silently left out of the scope and the count. Before this change it was free text, which was also dropped.
- claude-read: os.utime in _ensure_md_id_for_new_file now runs on every new-note registration (scanner pass 2 and register_single_file). Grep shows no other caller, so the reach matches I14.
- claude-read: The search cache (readSearchCache, keyed by query text) can show a relative modified: result computed at an earlier now until revalidation completes. The spec accepts this ('the search cache keys by the query text').
- claude-read: ResolvedModified.hasAbsolute is computed but the route recomputes the absolute check on its own; nothing reads the field.
- claude-verify: In the intelligence addon's Ask scope, a modified: token is now parsed as an operator and silently left out of the scope and the count. Before this change it was free text, which was also dropped.

## Findings

A: 0
B: 11
C: 0

### claude-deep:ROBUST-1 — bucket B, LOW, open

Claim: read_modified_at catches only OSError. datetime.fromtimestamp raises ValueError or OverflowError for an mtime beyond the platform or datetime range. That conversion now runs for every existing row the scan walks in pass 1, so one file with such an mtime aborts the whole scan.
Impact: With a file whose mtime lies after year 9999 (an archive with corrupt timestamps, a broken camera clock), a drive scan that previously finished now raises in pass 1, and none of the drive's changes are recorded.
Evidence: mtime.py:8-17: the conversion in modified_at_from_stat is not inside the try, and read_modified_at's try covers only os.stat. scanner.py:585 calls read_modified_at(item) for every existing walked row with no surrounding handler. Pass 2 (scanner.py:654-662) already had an unguarded datetime.fromtimestamp for new files, so new files were already exposed; existing rows are newly exposed.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In read_modified_at and at the scanner's pass-2 stat, treat ValueError/OverflowError from the conversion as a failed stat (return None).

</details>

### claude-deep:SCOPE-2 — bucket B, LOW, open

Claim: The menu's first-level order (Modified between Length and Favorites) is set in frontend/src/components/search/SearchQueryHeader.tsx, which the touch-point list does not name. The list names only ConditionMenu.tsx and SearchFilterChips.tsx.
Impact: If the entry were left out of SearchQueryHeader's entries array, the 「更新日」 menu entry would not appear on the results page, even though ConditionMenu supports it. The touch-point list would not have directed anyone to this file. The two existing first-level-order tests were updated and would catch that omission.
Evidence: SearchQueryHeader.tsx:272-281: the entries array now includes "modified" between "duration" and "favorite". The touch points name only `frontend/src/components/search/ConditionMenu.tsx` and `SearchFilterChips.tsx`.
Repro: Remove "modified" from the entries array at SearchQueryHeader.tsx:279. SearchQueryHeader.modified.test, .scope.test and .sizeDuration.test, which assert the eight-entry order, would fail; nothing in the touch-point list points at this file.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/components/search/SearchQueryHeader.tsx (the `entries` list) to the touch points next to ConditionMenu.tsx.

</details>

### claude-read:R2 — bucket B, LOW, open

Claim: frontend/src/components/search/SearchQueryHeader.tsx changes behaviour by adding "modified" to the ConditionMenu entries list, and it is not a touch point. The list names only ConditionMenu.tsx and SearchFilterChips.tsx for the menu.
Impact: This array is what places 「更新日」 between 「長さ」 and 「お気に入り」 in the first level the user sees. The R-5 layout touch point and the order rule depend on it, yet the plan does not name the file. A later edit that reorders or drops the entry would land in an unplanned file.
Evidence: frontend/src/components/search/SearchQueryHeader.tsx:272-281: entries ["tag","kind","folder",collection,"size","duration","modified","favorite"]. It is the only ConditionMenu caller (grep ConditionMenu in non-test src). Existing tests SearchQueryHeader.scope.test.tsx and SearchQueryHeader.sizeDuration.test.tsx had their expected first-level lists updated to include "Modified".
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R5 — bucket B, LOW, open

Claim: The intelligence addon's own frontend calls parseSearchQuery/filterFromParsed for the Ask scope and its count. The diff reaches it through searchQuery.ts, but it is not a touch point, and a modified: token there is consumed as an operator and then dropped from the scope.
Impact: A user who types `modified:<1y` into the Ask scope gets a scope (and a scope count) without the condition, silently. Before this change the token was free text and was dropped the same way, and size:/duration: are already dropped there, so the visible outcome is unchanged. The token now sets hasOperators and is a parsed operator that the scope never sends.
Evidence: addons/intelligence/frontend/Page.tsx:103-127: scopeStringFromRaw keeps only path/in/tag/type, and askScopeFromString builds {folders, collections, tags, kinds} from filterFromParsed(parseSearchQuery(raw), null) with no modified argument. addons/intelligence/frontend/AskFindHeader.tsx:54-61: the count listing sends folder/collection/tag/type only.
Repro: not_reproduced (read only). Predicted: Ask scope `path:Downloads modified:<1y` counts and scopes every file under Downloads.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

### claude-deep:SCOPE-1 — bucket B, INFO, open

Claim: The change adds a new backend module, backend/app/services/mtime.py, that the touch-point list does not name. Every write path and the scanner now depend on it.
Impact: No user impact. A reader who checks the touch points against the code will not find the single helper that defines how st_mtime is truncated and stored. That helper is where I1, I2 and I14 can break.
Evidence: backend/app/services/mtime.py:8-17 defines modified_at_from_stat and read_modified_at. They are imported at scanner.py:38, content_write.py:11, upload.py:25, fileops.py:29, markdown_relations.py:23 and drives.py:60. The touch points list scanner, content_write, upload, fileops, drives and markdown_relations, but not mtime.py.
Repro: Compare the product file list with the Touch points section: mtime.py is the only new backend product file and it appears in neither the Core nor the Addon list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add backend/app/services/mtime.py to the spec's Core touch points as the shared whole-second mtime helper.

</details>

### claude-deep:SCOPE-3 — bucket B, INFO, open

Claim: Five e2e and preview fixture files gain `modified_at: null` in FileItem/ShelfItem literals: e2e-components/fixtures/clipsRow.tsx, justifiedHold.tsx, notesLibrary.tsx, videoCardByline.tsx and e2e-epub/preview/app.tsx. The touch-point list does not name them; for FileItem literals it names only searchMerge.ts and FolderTreePane.tsx.
Impact: No runtime impact. A future required FileItem field would again need these files, and the list does not record them as FileItem literal sites.
Evidence: Grep: clipsRow.tsx:53, justifiedHold.tsx:55, notesLibrary.tsx:46, videoCardByline.tsx:41, e2e-epub/preview/app.tsx:48 all hold `modified_at: null`. The touch points say: "`frontend/src/lib/searchMerge.ts`, `frontend/src/components/folder/FolderTreePane.tsx`: `FileItem` literals gain `modified_at`."
Repro: Compare the product file list with the touch points: these five product files have no entry.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name the e2e-components fixtures and the e2e-epub preview among the FileItem literal sites in the touch points.

</details>

### claude-deep:SCOPE-4 — bucket B, INFO, open

Claim: The touch points list `backend/tests/`, the addon's `tests/` and `core-search-vocabulary.test.ts` as test touch points. The diff also reaches about 85 frontend test files (mostly a one-line `modified_at: null` in FileItem fixtures, plus nine new frontend test files) and two mcp-server test files, none of them listed.
Impact: No user impact. The planned scope understates the frontend and MCP test surface; the new frontend and MCP tests carry I6, I7, I8, I11, I12, I13, I15, I16 and I20.
Evidence: Examples: frontend/src/components/folder/__tests__/useFolderFiles.modified.test.tsx, frontend/src/app/app-api/__tests__/smartCollectionMembers.modified.test.ts, mcp-server/src/__tests__/modifiedOperator.test.ts, mcp-server/src/__tests__/smartCollections.test.ts:288,326 (expected query now includes tz). None is under a listed touch point.
Repro: Compare the test-file list of this review with the touch points.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `frontend/src/**/__tests__/` (FileItem fixtures and the new modified tests) and `mcp-server/src/__tests__/` to the touch points.

</details>

### claude-deep:SCOPE-5 — bucket B, INFO, open

Claim: A test fixture for a SmartFolder (saved Smart Collection) row gains `modified_at: null`. The SmartFolder type has no such field, so the bulk FileItem fixture edit reached a non-FileItem literal.
Impact: No runtime impact: the object is untyped and the extra key is ignored. A reader could take it as a sign that Smart Collections carry a modification time and add one to the SmartFolder type.
Evidence: frontend/src/components/__tests__/FileDetailFullScreen.smartCollection.test.tsx:388-401: savedSmartFolder() returns {id, drive, name, query, file_type, sort_by, sort_order, created_at, updated_at, modified_at: null}. frontend/src/types/smartFolder.ts declares updated_at (line 16) and no modified_at.
Repro: Grep `modified_at` in frontend/src/types/smartFolder.ts: no match.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the `modified_at: null` line from savedSmartFolder() in FileDetailFullScreen.smartCollection.test.tsx.

</details>

### claude-read:R1 — bucket B, INFO, open

Claim: The diff adds a new shared module, backend/app/services/mtime.py, that no touch point names; seven core write paths now import it.
Impact: None that a user can hit. The module is the single place where whole-second truncation is defined for I1/I2/I14. A reader of the touch-point list would not know that a change to this helper reaches the scanner, upload, create-file, copy, content write and link-rewrite paths at once.
Evidence: backend/app/services/mtime.py:8-17 (new). Imported at scanner.py:38, content_write.py:11, fileops.py:29, markdown_relations.py:23, upload.py:25 and routers/drives.py:60. It is absent from the spec's Touch points section.
Repro: not_reproduced (this is a comparison against the touch-point list)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R3 — bucket B, INFO, open

Claim: Five e2e fixture files gain modified_at on FileItem literals, but the touch points name only searchMerge.ts and FolderTreePane.tsx as FileItem literals that gain the field.
Impact: None at runtime. These are build inputs of the component and EPUB e2e harnesses that the required FileItem.modified_at forces to change, so the plan undercounts the places the type change reaches.
Evidence: frontend/e2e-components/fixtures/clipsRow.tsx:53, justifiedHold.tsx:55, notesLibrary.tsx:46, videoCardByline.tsx:41 and frontend/e2e-epub/preview/app.tsx:48 each add `modified_at: null`. Cause: frontend/src/types/index.ts:66 makes `modified_at: string | null` required on FileItem.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R4 — bucket B, INFO, open

Claim: The diff edits frontend and mcp-server tests, including expectations in existing tests, that the touch points do not cover. The list names only backend/tests/, the addon's tests/ and core-search-vocabulary.test.ts. One mock also gains a field its type does not have.
Impact: No user impact. A reader cannot tell from the plan that existing assertions moved: the first-level menu order in SearchQueryHeader.scope/sizeDuration, and the exact get_collection query in mcp-server smartCollections.test.ts, which now expects tz. These look adjusted to the new behaviour, not loosened. FileDetailFullScreen.smartCollection.test.tsx:399 adds `modified_at: null` to a Smart Folder mock, which suggests SmartFolder carries the field when it does not.
Evidence: frontend/src/components/search/__tests__/SearchQueryHeader.scope.test.tsx:118 and SearchQueryHeader.sizeDuration.test.tsx:84-96 add "Modified" to the expected order. mcp-server/src/__tests__/smartCollections.test.ts:288,326 add `tz: Intl.DateTimeFormat().resolvedOptions().timeZone`. frontend/src/components/__tests__/FileDetailFullScreen.smartCollection.test.tsx:388-401: savedSmartFolder() returns a Smart Folder object with `modified_at: null`. About 70 other frontend test files add `modified_at: null` to FileItem literals.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete `modified_at: null` from savedSmartFolder() in FileDetailFullScreen.smartCollection.test.tsx.

</details>

## Not verified

- claude-deep: No tests were run (read-only review); pass/fail of the new backend, frontend, MCP and addon tests is not known.
- claude-deep: Whether addons/intelligence commit 487c6b8 is on the addon repository's default branch.
- claude-deep: The 375 px layout of the menu and chip (R-5 measured at 338 px only, per decisions.md).
- claude-deep: TypeScript compilation of the whole frontend, e.g. that ConditionMenu's choose() accepts "modified" as an operator.
- claude-deep: Behaviour of SQLite string comparison for modified_at values written outside the ORM (only tests do that).
- claude-read: No tests or type checks were run; read-only review.
- claude-read: The 375 px layout of the 「＋ 条件」 first level was not measured (the decisions record says it was measured at 338 px only).
- claude-read: The addon submodule's tests were read only through the supplied diff; the addon's other frontend files beyond Page.tsx and AskFindHeader.tsx were not searched for parseSearchQuery consumers.
- claude-read: Whether a non-test file other than the e2e fixtures fails to type-check because modified_at is required on FileItem was not checked.
- claude-read: The full bodies of database.py, models.py, internal.py, shelves.py, schemas.py, content_write.py, fileops.py, markdown_relations.py and upload.py were not read beyond the changed hunks.
- claude-verify: Exact counts of the changed frontend test files (~70/~85) and of the new test files
- claude-verify: Whether an outer caller of _scan_and_register catches the exception and how the scan failure reaches the user
- claude-verify: The git diff itself against origin/develop; I checked the code state at the worktree HEAD only

TOTAL: 11 findings
