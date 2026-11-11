# Triage: r3

## Trajectory

This run:
- claude-read: There are two fix rounds. Round 1 (f90c235c9) added a branch and a prediction: an optional `removed` flag on SelectionBar's onComplete, set only by trash and purge, plus `if (removed)` before removeContinuationFiles in FolderBrowser. Round 2 (668c6fc87) adds no branch, state or prediction. It is test-only and pins the prediction that round 1 introduced, covering all five actions that complete with onComplete. Neither round removed anything: clearedSelectionRef and the onlyContinuation refresh skip remain. The design is not being patched case by case. The open item from r2 (stale file data on continuation rows after tag, rename or move) is untouched.

Earlier runs:
- r2 / claude-read: There is one fix round, f90c235c9. It adds a branch to the pruning path that the original change introduced (clearedSelectionRef, the onlyContinuation check and removeContinuationFiles in onComplete). The new branch is an optional `removed` flag on SelectionBar's onComplete, which only delete and purge set. That is a new prediction about which bulk actions take a file out of the listing, stored in a component outside the declared touch points. Nothing was removed: clearedSelectionRef and the onlyContinuation refresh skip remain. With one round, the design is being patched narrowly rather than repeatedly. A second round that added a flag or a special case for move or rename would mean the pruning design is being patched case by case.

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-verify:V1
- unspecified_behavior

## Needs a human

### open_c (claude-verify:V1)

Question: /search/images answers 503 when every id in one hydration batch is legitimately absent from the core's active set, not only when hydration fails.
Impact: Example: a file is trashed, and the click comes before search.db marks it inactive (the event-driven deactivation in indexer.py:1142/1179 runs a little later). If that file is the only id in the last 500-id batch, or every id in a batch is affected, the whole continuation fails. The core's empty answer for that key is also cached for 30 s (file_hydrate.py:133-134), so repeated clicks fail too. The frontend then resets the button to clickable with no message, so the user just sees nothing happen. The window is narrow, but it falls within normal use.
Evidence: addons/intelligence/app/routers/search.py:97-101 raises HTTPException(503) when `hydrate_files(batch)` returns an empty mapping. addons/intelligence/app/file_hydrate.py:80-136 returns `{}` on a transport failure, and also on success when the core lists every id under `not_found` (lines 128-131). The core does not return trashed or missing files (backend/app/routers/internal.py:532-544). search_images selects candidates by `IndexedFile.active` in search.db (search.py:790-793), which can lag the core.
Recommendation: Have hydrate_files (or a variant used only here) return None on transport or protocol failure and keep an empty dict for the case where nothing is active. _hydrate_batches should raise 503 only on None.
Note: /search/images answers 503 when every id in one hydration batch is legitimately absent from the core's active set, not only when hydration fails.

### unspecified_behavior

Note: Still present from r2 (R2-1), not addressed by this test-only round. After a bulk tag, rename or move whose selection holds only continuation rows, refresh() is skipped, and the drawn rows keep the file data from the /search/images answer (old filename, tags, folder_path). The text filter then matches the old filename.; Still present from r1/r2: copy and cut call onClear without onComplete, so clearedSelectionRef in FolderBrowser keeps stale ids until the next onClear overwrites them. Nothing reads those ids before that overwrite, so no wrong result follows.
- claude-read: Still present from r2 (R2-1), not addressed by this test-only round. After a bulk tag, rename or move whose selection holds only continuation rows, refresh() is skipped, and the drawn rows keep the file data from the /search/images answer (old filename, tags, folder_path). The text filter then matches the old filename.
- claude-read: Still present from r1/r2: copy and cut call onClear without onComplete, so clearedSelectionRef in FolderBrowser keeps stale ids until the next onClear overwrites them. Nothing reads those ids before that overwrite, so no wrong result follows.

## Findings

A: 0
B: 0
C: 1

### claude-verify:V1 — bucket C, LOW, open

Claim: /search/images answers 503 when every id in one hydration batch is legitimately absent from the core's active set, not only when hydration fails.
Impact: Example: a file is trashed, and the click comes before search.db marks it inactive (the event-driven deactivation in indexer.py:1142/1179 runs a little later). If that file is the only id in the last 500-id batch, or every id in a batch is affected, the whole continuation fails. The core's empty answer for that key is also cached for 30 s (file_hydrate.py:133-134), so repeated clicks fail too. The frontend then resets the button to clickable with no message, so the user just sees nothing happen. The window is narrow, but it falls within normal use.
Evidence: addons/intelligence/app/routers/search.py:97-101 raises HTTPException(503) when `hydrate_files(batch)` returns an empty mapping. addons/intelligence/app/file_hydrate.py:80-136 returns `{}` on a transport failure, and also on success when the core lists every id under `not_found` (lines 128-131). The core does not return trashed or missing files (backend/app/routers/internal.py:532-544). search_images selects candidates by `IndexedFile.active` in search.db (search.py:790-793), which can lag the core.
Repro: Read through the code; not executed. Take a drive whose /search/images answer has 501 hits. Trash the 501st file in the core before the addon processes the trash event. hydrate_files([that id]) gets {'files': [], 'not_found': [id]} → result {} → _hydrate_batches raises 503.
Introduced: introduced
Reviewer bucket: C | Author bucket: 

<details><summary>Proposed fix</summary>

> Have hydrate_files (or a variant used only here) return None on transport or protocol failure and keep an empty dict for the case where nothing is active. _hydrate_batches should raise 503 only on None.

</details>

## Not verified

- claude-read: No tests were run. Mutant outcomes and whether the new test passes come from reading the code.
- claude-read: I did not confirm that the test environment's global next-intl setup resolves the 'Permanently Delete' label for purge. I inferred it from the existing SelectionBar.test.tsx, which uses the same English labels.
- claude-read: I did not re-review the addon (Python) side or browser layout (R-5) in this round, because the fix commit touches only one frontend test file.
- claude-verify: The manifest.json routes, pre_check/response_filter and timeout entries
- claude-verify: The FolderContent.tsx/FolderBrowser.tsx button placement and the selection, bulk bar and folder-actions wiring (I12, I13)
- claude-verify: Frontend and addon test contents, and whether they pass
- claude-verify: Docs and translation file changes
- claude-verify: Proxy 404 behaviour for inaccessible drives or the search feature turned off (I6, first half)

TOTAL: 1 findings
