# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff wires onSelectOnly and onProcessed in frontend/src/components/inbox/InboxView.tsx, a file the touch-point list does not name; the list names only InboxPresenter.tsx for the inbox.
Impact: A reader checking the PR against the touch-point list will not find InboxView.tsx among the planned files, so the inbox's onProcessed path (which calls data.settle with a count) is reviewed without the scope the spec approved.
Evidence: frontend/src/components/inbox/InboxView.tsx:181-184 passes onSelectOnly={selection.replace} and onProcessed={(ids) => data.settle(ids, ids.length)}; the spec's Touch points list only frontend/src/components/inbox/InboxPresenter.tsx ("InboxPresenter.tsx (:164): onSelectOnly, onProcessed, and the replace operation"). InboxPresenter.tsx:40-41, 69-70, 179-180 is in the list.
Repro: not_reproduced: read the diff file list against the touch-point list; InboxView.tsx appears in the diff and not in the list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add frontend/src/components/inbox/InboxView.tsx to the touch-point list in docs/specs/trash-batch-progress.md, or state that the inbox parent wiring is part of InboxPresenter's item.

</details>

### claude-read:TP-2 — bucket B, INFO, open

Claim: frontend/src/hooks/useSelection.ts gains a replace operation, but the touch-point list names no file for the selection hook; it is covered only by the phrase 'added to that hook if it has none' under TrashView and by the generic 'the replace operation of its selection hook' for FolderBrowser and InboxPresenter.
Impact: The shared hook is changed for all callers; a reviewer scanning the touch points for shared-hook edits will not find it named.
Evidence: frontend/src/hooks/useSelection.ts:52-57 adds replace, and :75 exports it. Spec Touch points: TrashView.tsx 'added to that hook if it has none'; FolderBrowser.tsx and InboxPresenter.tsx 'the replace operation of its selection hook'. No touch-point names frontend/src/hooks/useSelection.ts.
Repro: not_reproduced: the hook file is in the diff; the touch-point text does not name it.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Name frontend/src/hooks/useSelection.ts in the touch-point list.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: Several test files in the diff are not named in the touch-point list: SelectionBar.batchRun.test.tsx, TrashView.batchParents.test.tsx, TrashView.batchRun.test.tsx, wholeListTimeout.test.tsx, and InboxView.batchParents.test.tsx; MissingView.purgeAll.test.tsx is listed only as 'MissingView.test.tsx (new)'.
Impact: The test coverage of I10, I11, I17 to I20 and I21 is spread across files whose names the approved list does not record, so a reviewer checking coverage against the list will not find the files that carry it.
Evidence: Added files in the diff: frontend/src/components/__tests__/SelectionBar.batchRun.test.tsx, TrashView.batchParents.test.tsx, TrashView.batchRun.test.tsx, wholeListTimeout.test.tsx, MissingView.purgeAll.test.tsx, InboxView.batchParents.test.tsx. The touch list names SelectionBar.test.tsx and SelectionBar.removedFlag.test.tsx as 'existing ... extended' (neither is in the diff) and MissingView.test.tsx (new). The InboxView test is listed only under 'tests for the onSelectOnly and onProcessed behaviour of FolderBrowser and InboxPresenter'.
Repro: not_reproduced: compare the diff's new test file names with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Update the touch-point test names to the files that exist, and say that SelectionBar.test.tsx and SelectionBar.removedFlag.test.tsx are not extended.

</details>

## Not verified

- claude-read: I did not read the bodies of the new test files to check whether they assert what they name; this review covers file scope only.
- claude-read: I did not confirm that every file listed in the touch points is complete; I checked only the files in the diff against the list.
- claude-read: I did not check the docs/process/reviews/ records or the ADDON-DEVELOPMENT.md and configuration.md text.
- claude-verify: The diff against origin/develop was not inspected: I have no git access, so I could not confirm which files changed at commit 3948c8ae1. SelectionBar.test.tsx and SelectionBar.removedFlag.test.tsx were checked only for existence, not for being unchanged in the diff.
- claude-verify: No tests were run and no commands were executed, per the reviewer constraints.
- claude-verify: The e2e-components measurement, the backend pytest and the docs changes (touch points for 10 and the docs list) were not checked.

TOTAL: 3 findings
