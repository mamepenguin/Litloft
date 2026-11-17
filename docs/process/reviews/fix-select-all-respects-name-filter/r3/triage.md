# Triage: r3

## Trajectory

This run:
- claude-read: r1 → r2: no code change; a3c4b533b is docs-only. r2 → r3: d5123d37d is the only code fix. On top of the first commit's derived `visibleFileIds` (a stateless derivation), it adds a stored-state reconciliation: a useEffect that mutates the selection to match the derived list, plus a new branch in `keepOnly` that resets the Shift anchor. ac9090203 is docs-only. So the code fix adds a state-sync mechanism and a branch that the earlier round did not have; it removes none. The finding above shows that this effect cannot tell 'the filter hid a row' from 'the list reloaded'. The natural fix adds yet another condition (debouncedText-change or loading guard), so the design is being patched rather than settled.

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-read:keeponly-wipes-selection-on-list-reload
- unspecified_behavior
- unspecified_behavior

## Needs a human

### open_c (claude-read:keeponly-wipes-selection-on-list-reload)

Question: While the name filter is active, the new effect at FolderBrowser.tsx:618-620 runs `keepOnly(visibleFileIds)` on every change of `files`, including list reloads that briefly empty `files`. Each such reload clears the whole selection and the Shift anchor, even though the filter has hidden nothing.
Impact: Example: with the name filter in use, a batch Move to Trash or Purge ends partial or stopped. SelectionBar then holds the failed and unconfirmed ids through `onSelectOnly(kept)` and shows the 'N done / M failed' outcome with a retry. It immediately calls `onComplete(true)` → `refresh()` → `reset()` → `files = []` → `keepOnly([])`, so the selection drops to 0. SelectionBar returns null at count 0, and the failure report and the retry disappear. The user is not told that some files were not deleted. The same wipe hits any hand-built selection under the filter whenever a websocket `drive.structure_changed` or `drive.file_updated` event, or any other `refresh()`, reloads the list. With the filter empty, the selection survives these reloads as it did before.
Evidence: FolderBrowser.tsx:187-191 derives `visibleFileIds` from `nameFilter.files`, which is a memo over `files` (useFolderFilter.ts:47-53). FolderBrowser.tsx:618-620: `useEffect(() => { if (nameFilter.isActive) keepOnly(visibleFileIds) }, [nameFilter.isActive, visibleFileIds, keepOnly])`. `isActive` depends only on debouncedText (useFolderFilter.ts:64), so it stays true across a reload. FolderBrowser.tsx:125: `refresh` bumps refreshKey. useFolderFiles.ts:809-819: a refreshKey or websocket bump calls `reset()`. useInfiniteScroll.ts:120-131: `reset` calls `setItems([])`. useFolderFiles.ts:750/756: for a plain folder, `files` is `paginatedFiles`, so it becomes `[]`. useSelection.ts:59-68: `keepOnly([])` empties the set and nulls the anchor. SelectionBar.tsx:203-213: on partial or stopped, it calls `onSelectOnly(kept)`, then `onComplete(true)`. FolderBrowser.tsx:969-976: with `clearedSelectionRef` empty on this path, `onlyContinuation` is false, so `refresh()` runs. SelectionBar.tsx:143: `if (count === 0) return null`. After the reload, only page 1 (limit 30) comes back, so the cleared ids are not restored either.
Recommendation: Prune only when the filter text (debouncedText) changes, or when a row the filter shows leaves the shown set while the same rows are still loaded. Do not prune on reloads of `files`. Alternatively, derive the effective selection at use sites (selected ∩ visible) instead of mutating stored selection state. Add a test where `files` empties and refills under an active filter.
Note: While the name filter is active, the new effect at FolderBrowser.tsx:618-620 runs `keepOnly(visibleFileIds)` on every change of `files`, including list reloads that briefly empty `files`. Each such reload clears the whole selection and the Shift anchor, even though the filter has hidden nothing.

### unspecified_behavior

Note: Whether the selection should survive a list reload (websocket structure or file_updated event, refresh after a bulk action) while the name filter is active is not specified. The base keeps it; the change now clears it.; FolderBrowser.tsx:792 still passes the toolbar `fileIds={files.map(...)}` from the unfiltered list to addon bulk-action slots. This is pre-existing and not touched.; handlePlayAll and hasPlayableFiles still read the unfiltered `files`, so Play all can start on a row the filter hides. This is pre-existing.; Renaming a selected file (inline) so that it no longer matches the filter now drops it from the selection silently. This is consistent with the stated UNSPEC, but no test covers it.
- claude-read: Whether the selection should survive a list reload (websocket structure or file_updated event, refresh after a bulk action) while the name filter is active is not specified. The base keeps it; the change now clears it.
- claude-read: FolderBrowser.tsx:792 still passes the toolbar `fileIds={files.map(...)}` from the unfiltered list to addon bulk-action slots. This is pre-existing and not touched.
- claude-read: handlePlayAll and hasPlayableFiles still read the unfiltered `files`, so Play all can start on a row the filter hides. This is pre-existing.
- claude-read: Renaming a selected file (inline) so that it no longer matches the filter now drops it from the selection silently. This is consistent with the stated UNSPEC, but no test covers it.
- claude-verify: While the name filter is active, any refresh clears the whole selection and the Shift anchor. That covers an upload completing, a move completing in another pane, a paste, a websocket structure event, and a sort, type or folder key change.
- claude-verify: After a partial or stopped batch delete or purge with the filter active, the remaining ids meant for retry are wiped and the SelectionBar unmounts along with its outcome message and retry state.

### unspecified_behavior

Note: While the name filter is active, any refresh clears the whole selection and the Shift anchor. That covers an upload completing, a move completing in another pane, a paste, a websocket structure event, and a sort, type or folder key change.; After a partial or stopped batch delete or purge with the filter active, the remaining ids meant for retry are wiped and the SelectionBar unmounts along with its outcome message and retry state.
- claude-read: Whether the selection should survive a list reload (websocket structure or file_updated event, refresh after a bulk action) while the name filter is active is not specified. The base keeps it; the change now clears it.
- claude-read: FolderBrowser.tsx:792 still passes the toolbar `fileIds={files.map(...)}` from the unfiltered list to addon bulk-action slots. This is pre-existing and not touched.
- claude-read: handlePlayAll and hasPlayableFiles still read the unfiltered `files`, so Play all can start on a row the filter hides. This is pre-existing.
- claude-read: Renaming a selected file (inline) so that it no longer matches the filter now drops it from the selection silently. This is consistent with the stated UNSPEC, but no test covers it.
- claude-verify: While the name filter is active, any refresh clears the whole selection and the Shift anchor. That covers an upload completing, a move completing in another pane, a paste, a websocket structure event, and a sort, type or folder key change.
- claude-verify: After a partial or stopped batch delete or purge with the filter active, the remaining ids meant for retry are wiped and the SelectionBar unmounts along with its outcome message and retry state.

## Findings

A: 0
B: 0
C: 1

### claude-read:keeponly-wipes-selection-on-list-reload — bucket C, HIGH, open

Claim: While the name filter is active, the new effect at FolderBrowser.tsx:618-620 runs `keepOnly(visibleFileIds)` on every change of `files`, including list reloads that briefly empty `files`. Each such reload clears the whole selection and the Shift anchor, even though the filter has hidden nothing.
Impact: Example: with the name filter in use, a batch Move to Trash or Purge ends partial or stopped. SelectionBar then holds the failed and unconfirmed ids through `onSelectOnly(kept)` and shows the 'N done / M failed' outcome with a retry. It immediately calls `onComplete(true)` → `refresh()` → `reset()` → `files = []` → `keepOnly([])`, so the selection drops to 0. SelectionBar returns null at count 0, and the failure report and the retry disappear. The user is not told that some files were not deleted. The same wipe hits any hand-built selection under the filter whenever a websocket `drive.structure_changed` or `drive.file_updated` event, or any other `refresh()`, reloads the list. With the filter empty, the selection survives these reloads as it did before.
Evidence: FolderBrowser.tsx:187-191 derives `visibleFileIds` from `nameFilter.files`, which is a memo over `files` (useFolderFilter.ts:47-53). FolderBrowser.tsx:618-620: `useEffect(() => { if (nameFilter.isActive) keepOnly(visibleFileIds) }, [nameFilter.isActive, visibleFileIds, keepOnly])`. `isActive` depends only on debouncedText (useFolderFilter.ts:64), so it stays true across a reload. FolderBrowser.tsx:125: `refresh` bumps refreshKey. useFolderFiles.ts:809-819: a refreshKey or websocket bump calls `reset()`. useInfiniteScroll.ts:120-131: `reset` calls `setItems([])`. useFolderFiles.ts:750/756: for a plain folder, `files` is `paginatedFiles`, so it becomes `[]`. useSelection.ts:59-68: `keepOnly([])` empties the set and nulls the anchor. SelectionBar.tsx:203-213: on partial or stopped, it calls `onSelectOnly(kept)`, then `onComplete(true)`. FolderBrowser.tsx:969-976: with `clearedSelectionRef` empty on this path, `onlyContinuation` is false, so `refresh()` runs. SelectionBar.tsx:143: `if (count === 0) return null`. After the reload, only page 1 (limit 30) comes back, so the cleared ids are not restored either.
Repro: Not run (read-only tools). Steps: open a folder, type a name filter, enter selection mode, select several shown files, and Move to Trash while one of them fails (or press Stop mid-run). Expected: the failed ids stay selected with the partial outcome and retry. Predicted: the bar vanishes after the refresh. Test-level mutation: in FolderBrowser.selectionFilter.test.tsx, make the mocked useFolderFiles return `files: []` for one render after the filter is set, then FILES again. A selection made under the filter is lost, and all four existing tests still pass because they never change `files`.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

<details><summary>Proposed fix</summary>

> Prune only when the filter text (debouncedText) changes, or when a row the filter shows leaves the shown set while the same rows are still loaded. Do not prune on reloads of `files`. Alternatively, derive the effective selection at use sites (selected ∩ visible) instead of mutating stored selection state. Add a test where `files` empties and refills under an active filter.

</details>

## Not verified

- claude-read: I did not run the test suite, the type checker, or the app. The finding is traced from code, not reproduced.
- claude-read: I did not confirm whether React batching could leave `files` non-empty during reset in some path (for example, hydration with revalidateInitial), which would narrow the trigger.
- claude-read: I did not check which backend actions emit `drive.file_updated` in ordinary use (the media_import addon and event_hooks.py emit it), so how often the websocket path fires is not established.
- claude-read: I did not read CLAUDE.md or docs/process/*.md in full. Conventions were inferred from decisions.md and the review record only.
- claude-verify: I did not run the tests or reproduce the behaviour in a browser; this is a static trace of how React commits renders.
- claude-verify: I did not inspect search-mode or watch-history paths in detail (fetchRecentFiles does not call reset).
- claude-verify: I did not run git diff, so 'introduced' rests on the commit message and on finding no other pruning path.

TOTAL: 1 findings
