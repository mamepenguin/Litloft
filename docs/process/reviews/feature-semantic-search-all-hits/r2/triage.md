# Triage: r2

## Trajectory

This run:
- claude-read: There is one fix round, f90c235c9. It adds a branch to the pruning path that the original change introduced (clearedSelectionRef, the onlyContinuation check and removeContinuationFiles in onComplete). The new branch is an optional `removed` flag on SelectionBar's onComplete, which only delete and purge set. That is a new prediction about which bulk actions take a file out of the listing, stored in a component outside the declared touch points. Nothing was removed: clearedSelectionRef and the onlyContinuation refresh skip remain. With one round, the design is being patched narrowly rather than repeatedly. A second round that added a flag or a special case for move or rename would mean the pruning design is being patched case by case.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: After a bulk tag or rename that selects only continuation rows, refresh() is skipped and the rows keep the file data from the answer (old tags or filename).; Copy and cut call onClear without onComplete, so clearedSelectionRef keeps stale ids until the next onClear (carried over from r1, unchanged by this fix).; Restore, which runs only in the trash view, calls onComplete() without the flag. It is irrelevant to the search page.
- claude-read: After a bulk tag or rename that selects only continuation rows, refresh() is skipped and the rows keep the file data from the answer (old tags or filename).
- claude-read: Copy and cut call onClear without onComplete, so clearedSelectionRef keeps stale ids until the next onClear (carried over from r1, unchanged by this fix).
- claude-read: Restore, which runs only in the trash view, calls onComplete() without the flag. It is irrelevant to the search page.

## Findings

A: 0
B: 2
C: 0

### claude-read:R2-1 — bucket B, LOW, open

Claim: After a bulk tag or rename, a drawn continuation row is kept but still shows the file data from the /search/images answer: its old tags or old filename. Nothing updates the stored hit's `file` for these actions.
Impact: A viewer who renames or tags pictures picked from the continuation sees the old name or tags on those rows until the search key changes, and the text filter matches the old filename. When the selection holds only continuation rows, refresh() is skipped as well.
Evidence: frontend/src/components/FolderBrowser.tsx:729-736 calls removeContinuationFiles only when `removed` is true. Nothing calls updateContinuationFile for tag or rename; it is called only from handleFavoriteToggle (:418). frontend/src/components/SelectionBar.tsx:147-179: tag and rename call onComplete() with no argument. In useFolderFiles.ts the semantic effect's deps do not include refreshKey, so the semantic rows above behave the same way after a refresh.
Repro: not_reproduced. Steps by reading: open the continuation, select one continuation row, run Rename to give it a new filename, and complete. The row stays with its old filename because continuation.results[i].file is unchanged and onlyContinuation=true skips refresh().
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:R2-2 — bucket B, LOW, open

Claim: The new test covers only bulk tag on a continuation row. No test covers rename or move, so a mutant that passes `true` to onComplete in handleRenameComplete or handleBatchMove would survive.
Impact: A later edit that marks rename or a within-drive move as 'removed' would bring back the r1 defect for those actions, and no test would fail.
Evidence: frontend/src/components/__tests__/SearchPage.semanticContinuation.test.tsx:844-864 tests only the Tagging path. frontend/src/components/SelectionBar.tsx:141 (move) and :178 (rename) call onComplete() and no test pins this. The delete path (:130) is pinned by the I13 trash test at :826-841: reverting it to onComplete() leaves c1 drawn, because onlyContinuation skips refresh(), so that mutant is killed.
Repro: Mutation by reading: change SelectionBar.tsx:178 to onComplete(true). handleRenameComplete then prunes renamed continuation rows, and no test in SearchPage.semanticContinuation.test.tsx or SelectionBar.test.tsx exercises rename on the search page. The mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Parametrize the I8 bulk-action test over tag, rename and move, and assert in each case that the continuation row stays.

</details>

## Not verified

- claude-read: No tests were run; everything was read from the code.
- claude-read: Not checked: whether batchMove on the search page can move a file out of a folder-scoped search, where removal would be expected.
- claude-read: Browser behaviour (R-5) and the addon side were not re-checked in this round, since the fix touches only the frontend.
- claude-verify: I did not run the test suite or the mutants. The mutant outcomes come from reading the code.
- claude-verify: I did not check whether FileGrid actually renders tags on a card. I verified only that the filename is stale data in the stored hit.
- claude-verify: I did not review the addon (Python) side of the commit.

TOTAL: 2 findings
