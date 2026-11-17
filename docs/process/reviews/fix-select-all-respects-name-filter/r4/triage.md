# Triage: r4

## Trajectory

This run:
- claude-read: r1 → r2 and r2 → r3 (a3c4b533b, ac9090203) are docs-only. r2 → r3 code (d5123d37d) added a stored-state reconciliation: an effect that prunes the selection with keepOnly, plus an anchor-reset branch in keepOnly. r3 → r4 (c2d901997) keeps that effect and patches its trigger. It removes the rows-keyed `isActive` condition, and adds a new piece of state (prunedForTextRef), a new branch (the `loading` guard), and a new field exposed from useFolderFilter (appliedText). It removes one condition but adds a ref and a guard on top of the effect the previous round introduced, so the design is being patched rather than replaced. be266cf97 is docs-only. The patch does close the r3 reload defect, and I found no new defect a user would hit in normal use.

Earlier runs:
- r3 / claude-read: r1 → r2: no code change; a3c4b533b is docs-only. r2 → r3: d5123d37d is the only code fix. On top of the first commit's derived `visibleFileIds` (a stateless derivation), it adds a stored-state reconciliation: a useEffect that mutates the selection to match the derived list, plus a new branch in `keepOnly` that resets the Shift anchor. ac9090203 is docs-only. So the code fix adds a state-sync mechanism and a branch that the earlier round did not have; it removes none. The finding above shows that this effect cannot tell 'the filter hid a row' from 'the list reloaded'. The natural fix adds yet another condition (debouncedText-change or loading guard), so the design is being patched rather than settled.

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Since c2d901997, a selected file that the filter comes to hide while the text stays the same stays selected while hidden. Examples are an inline rename to a non-matching name, or a websocket update after which the reloaded rows no longer match it. A later bulk action (trash, move, copy) would include it, and SelectionBar can show a count above totalCount. The test file's UNSPEC comment says 'a file the filter comes to hide leaves the selection'; only text-driven hiding does now. Relative to origin/develop this is not a regression, because the base never pruned.; If the filter text changes after a reload has brought back only page 1, matching selected files from later pages are dropped because they are not loaded. With no filter text change, they survive. Whether a selection should survive for files that are not loaded is not specified.; Pre-existing, unchanged: FolderBrowser toolbar `fileIds` and handlePlayAll / hasPlayableFiles (FolderBrowser.tsx:609-648) still read the unfiltered `files`.
- claude-read: Since c2d901997, a selected file that the filter comes to hide while the text stays the same stays selected while hidden. Examples are an inline rename to a non-matching name, or a websocket update after which the reloaded rows no longer match it. A later bulk action (trash, move, copy) would include it, and SelectionBar can show a count above totalCount. The test file's UNSPEC comment says 'a file the filter comes to hide leaves the selection'; only text-driven hiding does now. Relative to origin/develop this is not a regression, because the base never pruned.
- claude-read: If the filter text changes after a reload has brought back only page 1, matching selected files from later pages are dropped because they are not loaded. With no filter text change, they survive. Whether a selection should survive for files that are not loaded is not specified.
- claude-read: Pre-existing, unchanged: FolderBrowser toolbar `fileIds` and handlePlayAll / hasPlayableFiles (FolderBrowser.tsx:609-648) still read the unfiltered `files`.

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-read: I did not run the test suite, the type checker, or the app; the analysis is a static read.
- claude-read: Not checked: whether selection is cleared on folder navigation (FolderBrowser.tsx:534, :812), which decides whether the subject-change frame matters.
- claude-read: Not checked: inline rename's exact flow, i.e. whether rename is reachable while a selection is active.
- claude-verify: Did not run the test suite; the tests could not be executed with the tools available.
- claude-verify: Did not inspect the full git diff against origin/develop; reviewed only the current state of FolderBrowser.tsx, useFolderFilter.ts and useSelection.ts.
- claude-verify: Did not check how `loading` is computed for the Recent and Continue (watch-history) views.

TOTAL: 0 findings
