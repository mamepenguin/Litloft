# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:TP-1 is bucket A or BLOCKER
- open finding claude-verify:V-1 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: Any bulk action from SelectionBar (tag, rename, move within the drive) removes the selected continuation rows from the page.; When every selected id is a continuation row, refresh() is skipped after a bulk action, so the list above is not reloaded.; Copy and cut call onClear without onComplete, so clearedSelectionRef keeps stale ids until the next onClear overwrites them.
- claude-read: Any bulk action from SelectionBar (tag, rename, move within the drive) removes the selected continuation rows from the page.
- claude-read: When every selected id is a continuation row, refresh() is skipped after a bulk action, so the list above is not reloaded.
- claude-read: Copy and cut call onClear without onComplete, so clearedSelectionRef keeps stale ids until the next onClear overwrites them.
- claude-verify: Bulk tag and bulk rename remove selected continuation rows from the page (V-1).
- claude-verify: When the selection is only continuation rows, onComplete skips refresh(), so the rows above the continuation are not reloaded after a delete or move.

### unspecified_behavior

Note: Bulk tag and bulk rename remove selected continuation rows from the page (V-1).; When the selection is only continuation rows, onComplete skips refresh(), so the rows above the continuation are not reloaded after a delete or move.
- claude-read: Any bulk action from SelectionBar (tag, rename, move within the drive) removes the selected continuation rows from the page.
- claude-read: When every selected id is a continuation row, refresh() is skipped after a bulk action, so the list above is not reloaded.
- claude-read: Copy and cut call onClear without onComplete, so clearedSelectionRef keeps stale ids until the next onClear overwrites them.
- claude-verify: Bulk tag and bulk rename remove selected continuation rows from the page (V-1).
- claude-verify: When the selection is only continuation rows, onComplete skips refresh(), so the rows above the continuation are not reloaded after a delete or move.

## Findings

A: 2
B: 3
C: 0

### claude-read:TP-1 — bucket A, MEDIUM, open

Claim: FolderBrowser.tsx goes beyond the declared touch point ('passes the continuation through to FolderContent'): it also rewires the SelectionBar onComplete handler so that every completed bulk action, not only trash or move, removes the selected ids from the continuation.
Impact: On the search page, a viewer who selects drawn continuation rows and bulk-tags or bulk-renames them sees those rows disappear from the page, even though the files still match and were neither trashed nor moved. When the selection also includes rows above the continuation, refresh() reloads the list above, but the continuation rows stay removed.
Evidence: frontend/src/components/FolderBrowser.tsx:725-735 records selection.selectedIds on onClear and calls removeContinuationFiles(cleared) unconditionally in onComplete. frontend/src/components/SelectionBar.tsx:146-161 (handleBatchTag) and :173-178 (handleRenameComplete) call onClear() and then onComplete(), the same pair that handleBatchDelete (:124-133) and handleBatchMove (:135-144) call. removeContinuationFiles (useFolderFiles.ts) filters those ids out of the stored results, so they are no longer drawable.
Repro: not_reproduced. Steps by reading: search for 'penguin', click Show more by similarity, select one drawn continuation row, Tag → enter 'x' → submit. batchTag succeeds, then onClear sets clearedSelectionRef=[id], and onComplete calls removeContinuationFiles([id]). The row is no longer in drawableContinuation and disappears; onlyContinuation=true, so no refresh happens either. SearchPage.semanticContinuation.test.tsx tests only the trash path (I13), so a tag or rename test would fail where none exists today.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Prune the continuation only for actions that take the file out of the result set (trash, purge, and a move out of scope), for example by having SelectionBar report which action completed, and declare this FolderBrowser behavior as a touch point. Add a test that bulk-tags a drawn continuation row and asserts it stays on the page.

</details>

### claude-verify:V-1 — bucket A, MEDIUM, open

Claim: A bulk tag or bulk rename on selected continuation rows removes those rows from the search page, even though the files still exist, still match, and were neither trashed nor moved.
Impact: In normal use, tagging or renaming pictures picked from the 'Show more by similarity' rows makes them disappear silently from the results. No refresh brings them back for the same search key, because removeContinuationFiles drops them from the stored answer. This breaks I8, which requires each returned file to appear on the page exactly once.
Evidence: frontend/src/components/SelectionBar.tsx:153-157 (handleBatchTag) and :173-177 (handleRenameComplete) call onClear() and then onComplete(), the same pair that delete (:126-129) and move (:137-140) use. frontend/src/components/FolderBrowser.tsx:724-735: onClear stores selection.selectedIds in clearedSelectionRef, and onComplete always calls removeContinuationFiles(cleared). It does not check which action ran. frontend/src/components/folder/useFolderFiles.ts:371-382 filters those file_ids out of continuation.results for the current key.
Repro: Static trace: on the search page, open the continuation and draw its rows. Select one continuation row, run the bulk 'Tag' action with a valid tag, and batchTag succeeds. handleBatchTag then calls onClear and onComplete, and removeContinuationFiles([id]) removes the row. onlyContinuation is true, so refresh() is skipped, and the row is no longer on the page. This was not run in a browser.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Remove continuation ids only for actions that take the file out of the result set (delete, move out of scope). Have SelectionBar tell onComplete which action ran, or call removeContinuationFiles only from the delete and move paths. For tag and rename, refresh the continuation rows' file data instead.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: FolderBrowser.tsx also changes handleFavoriteToggle (it calls updateContinuationFile) and adds clearedSelectionRef, neither of which is in the touch-point entry for that file.
Impact: No user-facing defect from the favorite path itself, which is what makes I13's star update work. The touch-point list understates what FolderBrowser now owns, so a reviewer working from the list would not look at the favorite and bulk-action paths.
Evidence: frontend/src/components/FolderBrowser.tsx:294 (clearedSelectionRef), :418 (updateContinuationFile in the favorite toggle callback).
Repro: not_reproduced; read from the diff.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-3 — bucket B, INFO, open

Claim: The diff edits an existing frontend test not named in the touch points: frontend/src/__tests__/core-search-vocabulary.test.ts, which adds FolderContent.tsx to CALLERS and raises the used-key count from 40 to 41.
Impact: None for the user. A pinned-count test was changed outside the declared list, so the list does not show that the core vocabulary census was moved.
Evidence: frontend/src/__tests__/core-search-vocabulary.test.ts: CALLERS gains "components/folder/FolderContent.tsx": 1; expect(used.length).toBe(41).
Repro: not_reproduced; read from the diff.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-4 — bucket B, INFO, open

Claim: The touch points name new tests only for the addon (046 and 055). The two new frontend test files for SPEC-CORE-035, frontend/src/components/__tests__/SearchPage.semanticContinuation.test.tsx and frontend/src/__tests__/semanticContinuationLabel.test.ts, are not listed.
Impact: None for the user. The list does not say where CORE-035's invariants are tested.
Evidence: Both files are new in the diff; the touch-point list mentions tests only under addons/intelligence/tests.
Repro: not_reproduced; read from the diff.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: No tests were run; all observations come from reading the code.
- claude-read: Not checked: whether the core's addon proxy actually returns 404 for a locked drive or a disabled feature on /search/images (I6 through the proxy).
- claude-read: Not checked: browser layout of the button and the held last line (R-5).
- claude-read: Not checked whether a bulk move on the search page should count as leaving the folder scope.
- claude-verify: The base-commit contents (for example, the previous count of 40 in core-search-vocabulary.test.ts), because git diff could not be run.
- claude-verify: The addon-side code (search.py, routers, manifest).
- claude-verify: Runtime behavior in a browser. V-1 is traced statically only.

TOTAL: 5 findings
