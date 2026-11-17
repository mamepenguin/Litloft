# Mutation review: feature/trash-batch-progress at c6ba63fba

Scope: batchChunks.ts (chunking, stop rule), SelectionBar.tsx (selection shrink, busy guards), ConfirmDialog.tsx (busy handling).
Each mutation was applied alone, the nine batch test files were run (batchChunks, SelectionBar.batchRun, ConfirmDialog, MissingView.purgeAll, TrashView.batchRun, wholeListTimeout, and the three batchParents files), and the file was restored with git checkout. Baseline: 77 of 77 passed.

## Findings

1. Chunk boundary (batchChunks.ts, CHUNK_SIZE) | CHUNK_SIZE 100 to 101 | killed (batchChunks I1 "N=101 sends one request per chunk with sizes [100,1]"; SelectionBar batch run I1)
2. Chunk boundary (batchChunks.ts, slice end) | chunk = slice(start, start + CHUNK_SIZE - 1), so one id per boundary is never sent and never reported | killed (batchChunks I1 "concatenated chunks equal the ids in insertion order, each id sent once"; SelectionBar I1 and I5)
3. Chunk boundary (batchChunks.ts, loop bound) | `start < ids.length` to `start < ids.length - 1`, so the last id is dropped | killed (batchChunks I1 "N=1 sends one request per chunk with sizes [1]"; SelectionBar I1)
4. Stop rule (batchChunks.ts, null-answer branch) | drop `stopped = true` | killed (batchChunks I7 and SelectionBar "a run where every chunk is unconfirmed still calls onComplete(true) once and stays open"; SelectionBar I5)
5. Stop rule (batchChunks.ts, null-answer branch) | drop `break` | killed (batchChunks I4 "the third is never sent" for network error and non-2xx; I5 "deleted short by one makes the chunk unconfirmed and stops the run")
6. Stop rule (batchChunks.ts, null-answer branch) | unconfirmed = slice(start + chunk.length), so the failed chunk is not held | killed (batchChunks I4 "a failed chunk's ids are unconfirmed, not failed"; I6 partition test)
7. Stop rule (batchChunks.ts, loop-top abort check) | remove the `if (hooks.signal?.aborted)` block | SURVIVED (no test). Not counted: the check is reached only when the abort lands between an answered chunk and the next send. Unmount is the only abort source, and no macrotask boundary sits between them, so no normal-use run reaches it. The in-flight listener still stops every chunk that is in flight. Test gap only.
8. Stop rule (batchChunks.ts, abort listener) | remove `hooks.signal?.addEventListener("abort", abortChunk)` | killed (SelectionBar I9 "unmounting during a run aborts the in-flight request and sends no further chunk", trash and purge)
9. Stop rule (batchChunks.ts, timeout) | timer callback no longer aborts the controller | killed (batchChunks I20 "a chunk's signal is not aborted at 119.999 s and is aborted at 120 s"; "each chunk gets its own signal")
10. Stop rule (batchChunks.ts, answer check) | accept any answer, skip answeredFor | killed (batchChunks I5 three cases; SelectionBar I5 trash and purge)
11. Selection shrink (SelectionBar.tsx, kept) | kept = runIds (selection keeps every id) | killed (SelectionBar I6 "a partial run selects exactly the failed ids"; I6 I15 "a stopped run selects failed plus unconfirmed"; I23)
12. Selection shrink (SelectionBar.tsx, onProcessed) | onProcessed(kept) instead of onProcessed(result.processed) | killed (SelectionBar I6 "the ids reported as processed are the processed ids and no failed id", trash and purge)
13. Selection shrink (SelectionBar.tsx, onSelectOnly) | onSelectOnly(result.failed), which drops the unconfirmed ids from the selection | killed (SelectionBar I5, I6 I15, I7 on trash and purge)
14. Selection shrink (SelectionBar.tsx, branch condition) | `if (result.stopped || result.failed.length > 0)` to `if (result.failed.length > 0)`, so a stopped run takes the success path and clears the selection | killed (SelectionBar I5, I6 I15, I7 on trash and purge)
15. Busy disable (SelectionBar.tsx, runBatch) | remove the `if (runningRef.current) return;` guard | killed (SelectionBar I18 "while running, a second confirm does not start another run", trash and purge)
16. Busy disable (SelectionBar.tsx, dismiss) | remove the `if (runningRef.current) return;` guard in dismiss | killed (SelectionBar I17 "while running, Cancel does nothing and the dialog stays open", trash and purge)
17. Busy disable (SelectionBar.tsx, setRunning) | remove `setRunning(true)` | killed (SelectionBar I17, I19, I2 on trash and purge)
18. Busy disable (SelectionBar.tsx, busy prop) | delete dialog `busy={deleteRun.busy}` to `busy={false}` | killed (SelectionBar I17 "while running, Cancel does nothing and the dialog stays open", trash)
19. Busy disable (ConfirmDialog.tsx, Escape) | Escape handler calls onCancel without the busy check | killed (ConfirmDialog I17 "while busy, Cancel, X and Escape do not call onCancel")
20. Busy disable (ConfirmDialog.tsx, Cancel button) | Cancel `disabled={busy}` to `disabled={false}` | killed (ConfirmDialog I17)
21. Busy disable (ConfirmDialog.tsx, confirm button) | Confirm `disabled={busy}` to `disabled={false}` | killed (ConfirmDialog I17 "while busy, confirm is disabled and does not call onConfirm")
22. Busy disable (ConfirmDialog.tsx, backdrop) | backdrop onClick calls onCancel without the busy check | SURVIVED. Not counted: a click outside reaches onCancel, and every busy caller guards its own cancel (SelectionBar dismiss checks runningRef; MissingView handlePurgeAllCancel and TrashView handleEmptyTrashCancel check their running refs). No normal-use path changes. Test gap: ConfirmDialog I17 names the backdrop, and no test clicks it while busy.
23. Busy disable (ConfirmDialog.tsx, X button) | X `disabled={busy}` to `disabled={false}`, its onClick guard kept | SURVIVED. Not counted: the onClick guard still blocks it, and the same parent guards apply. Test gap, as in 22.
24. Busy disable (ConfirmDialog.tsx, X button) | X onClick guard and disabled both removed | killed (ConfirmDialog I17)

## Notes

- The working tree was clean after each restore, apart from docs/process/reviews/feature-trash-batch-progress/r1/, which was already untracked before this review and was not touched.
- Survivors 7, 22 and 23 are not counted under the threat model. They are test gaps: the behaviour is either unreachable in normal use or masked by the caller's own guard. A ConfirmDialog test that clicks the backdrop and X while busy would pin 22 and 23 cheaply.

TOTAL: 0 findings
