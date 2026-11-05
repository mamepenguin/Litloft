# Triage: r2

## Trajectory

This run:
- claude-read: There are no fix commits since r1 (the fix list is empty), so there are no fix diffs to read. No round has added or removed a branch, state or prediction, and there is no sign of patching yet. The three open r1 findings were bucket B, about the touch-point list only. This review found new defects in code that r1 did not reach because its diff was truncated.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER
- open finding claude-read:F2 is bucket A or BLOCKER
- open finding claude-read:F3 is bucket A or BLOCKER

## Findings

A: 3
B: 1
C: 0

### claude-read:F1 — bucket A, HIGH, open

Claim: After a drive 404/403 stops the queue, the drive picker calls `ShareSheetModel.pickDrive`, not `pickDriveForQueue`, so the queue's destination is never changed and the sheet returns to `.ready` with the **保存** button.
Impact: The viewer picks another drive after the stop. The sheet goes back to ready and shows Save instead of Retry. Pressing Save builds a new queue of all items, including those already saved, to the new drive. Saved items are duplicated, and the retry of the unsaved items never goes through the stopped queue.
Evidence: ios/LitloftShare/ShareSheetView.swift:372 `await model.pickDrive(drive)`. ShareSheetModel.swift:203 `pickDriveForQueue` has no caller (grep). `pickDrive` sets `state = .ready` and never touches `queue`. The toolbar shows Save when the state is not stopped(.driveNotAvailable) or finishedWithFailures. `save()` at ShareSheetModel.swift builds a new queue from `shareItems()`.
Repro: Share 3 files. Item 2 gets 404 and the queue stops (item 1 saved). Tap the drive row, choose another drive. The sheet shows Save, not Retry. Tap Save: a new queue sends all 3 files, so item 1 is saved twice. Mutation: no test calls `pickDriveForQueue`, so the tests do not catch it. Not run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> In the drive picker, call `pickDriveForQueue` when the state is stopped(.driveNotAvailable). Add a test that goes through the view path.

</details>

### claude-read:F2 — bucket A, MEDIUM, open

Claim: The queue-level `retry()` and `send()` run every non-saved item with `Attempt.first`, including items in the `unknown` state, so an unknown file upload is retried with the 409 suffix path instead of the original-name check.
Impact: After an unanswered `/complete` leaves an item `unknown`, pressing the bar's Retry (finished with failures or stopped) re-inits it. If the earlier file did land, init answers 409 and the item is uploaded again as `<stem> (1).<ext>`. This is a duplicate, and the item is never marked saved by the 409 rule.
Evidence: ShareSendQueue.swift `retry()`: `await run(statuses.indices.filter { statuses[$0].state != .saved }, attempt: .first)`. Only `retryItem(at:)` picks `.again` for `.unknown`.
Repro: Item 1: `/complete` times out, polling ends, state is unknown. Item 2 fails. Press the toolbar Retry: item 1 re-inits with `.first`, gets a 409, and is uploaded as `name (1).ext`. Not run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Choose the attempt per item: `.again` when the item's state is `.unknown`, else `.first`.

</details>

### claude-read:F3 — bucket A, LOW, open

Claim: A `/complete` that ends with `.notConnectedToInternet` or a similar code is treated as the server being unreachable and the queue stops with the item failed, without the by-path polling.
Impact: The server may have received `/complete` and the file may have landed. The sheet shows a failure and stops the queue. A retry then uploads again, and the file can be duplicated under a suffix.
Evidence: ShareSendQueue.swift in `sendFile`, the `/complete` catch: `if case .transport(let code) = error, Self.isUnreachable(code) { return .stopped(.cannotReach) }` before the poll.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: A | Author bucket: 

### claude-read:F4 — bucket B, LOW, open

Claim: `ShareSheetModel.cancel()` returns right after `queue.cancel()` sets a flag, and the view then calls `onCancel`, so the extension can complete before the in-flight init answer is awaited and the opened session is deleted.
Impact: If the extension is torn down, the session that init opened is not deleted and its chunks stay on the server until restart. No file or row is created.
Evidence: ShareSendQueue.swift `cancel()` does not wait for the running `run`. ShareSheetView.swift calls `await model.cancel(); onCancel()`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: The diff was truncated at ShareSheetView.swift, so ShareViewController, ShareStrings and the iOS tests were not read.
- claude-read: Nothing was built or run, and the keychain and App Group behaviour on a device was not checked.
- claude-read: The pbxproj target membership was not checked in detail.
- claude-verify: Runtime behaviour of the extension when cancelled mid-init.
- claude-verify: The tests in ios/LitloftTests.
- claude-verify: The backend, the frontend and the other invariants (I1, I2, I5, I8-I10).

TOTAL: 4 findings
