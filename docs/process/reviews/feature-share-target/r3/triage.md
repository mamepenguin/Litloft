# Triage: r3

## Trajectory

This run:
- claude-read: The fix commit (97ce878) removed the `attempt` parameter from run() and the branch in retryItem, and put one per-item decision in run(), so one branch was moved, not added. It removed the isUnreachable branch from the /complete catch, so that is a removal. It added canPickDrive, canPickFolder, hasQueue and savedDestination, and it made pickDrive route to the queue (the dead pickDriveForQueue became private and used). Those are guards on one existing state, not a repeat of earlier rounds' additions. The two other fix commits are docs records. The remaining gap (F1) is the same kind as the r2 F2: retry semantics are inferred from a displayed state, not from a fact about the item. That is a small sign of patching, but it is not yet a repeated addition of branches or states.

Earlier runs:
- r2 / claude-read: There are no fix commits since r1 (the fix list is empty), so there are no fix diffs to read. No round has added or removed a branch, state or prediction, and there is no sign of patching yet. The three open r1 findings were bucket B, about the touch-point list only. This review found new defects in code that r1 did not reach because its diff was truncated.

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER

## Needs a human

### needs_human_record (claude-read:F2)

Question: After the fix, any transport error on /complete, including notConnectedToInternet or cannotConnectToHost, is polled by-path for the whole window, and the local-network-denied or unreachable stop is not applied there.
Impact: With the server really gone, the viewer waits at least 2 minutes in 'checking' before the item turns unknown. The queue-stopped state appears only when the next item's init fails.
Evidence: ShareSendQueue.swift /complete catch: `catch is ShareAPIError { if cancelling { return .cancelled } }` then pollForFile.
Note: The behaviour is as described: ShareSendQueue.swift:451-452 catches every ShareAPIError on /complete (including .transport(.notConnectedToInternet) and .cannotConnectToHost) and goes to pollForFile (line 461). byPath errors are swallowed by try? (line 533), so the loop runs for the whole window (at least 120 s) and ends in .unknown. Neither .stopped(.cannotReach) nor localNetworkDenied is applied there, unlike init and chunk (outcome(for:) at line 542 and line 511). Whether this is a defect depends on whether the spec's 'unanswered /complete' includes unreachable transport errors; I6 can be read both ways (the request may have reached the server before the link dropped). The spec text does not settle it, so the human should decide.

## Findings

A: 1
B: 1
C: 0

### claude-read:F1 — bucket A, MEDIUM, open

Claim: The retry attempt kind is derived only from the item's current state being unknown, so an unknown upload whose original-name retry fails before init answers (state becomes failed) is retried next as Attempt.first and takes a (N) suffix.
Impact: If the first attempt had actually landed, the second retry's init answers 409 and the file is uploaded again as '<stem> (1).<ext>'. This is a duplicate file with a second inbox row, which I7 says a retry never creates.
Evidence: ios/LitloftShare/ShareSendQueue.swift run(): `let attempt: Attempt = statuses[index].state == .unknown ? .again : .first`. In sendFile the init catch returns outcome(for:unanswered:.failed(.genericFailure)) or .stopped(.cannotReach), and run() then sets state .failed, losing the 'may already have landed' knowledge. The next retry or retryItem evaluates state == .failed and uses .first. The new test barRetryUnknownUsesOriginalName covers only unknown to saved in one retry.
Repro: Unknown file item after an unanswered /complete. Press retry; the init request times out or returns 5xx, so the item becomes failed. Press retry again with the server healthy: init answers 409 for the original name and the item uploads as 'name (1).ext'. Mutation: a test with that sequence would fail. Not run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep a per-item 'maybeLanded' flag set when an item becomes unknown and cleared only when init succeeds or answers 409. Choose .again from that flag, not from the displayed state.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: After the fix, any transport error on /complete, including notConnectedToInternet or cannotConnectToHost, is polled by-path for the whole window, and the local-network-denied or unreachable stop is not applied there.
Impact: With the server really gone, the viewer waits at least 2 minutes in 'checking' before the item turns unknown. The queue-stopped state appears only when the next item's init fails.
Evidence: ShareSendQueue.swift /complete catch: `catch is ShareAPIError { if cancelling { return .cancelled } }` then pollForFile.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not build or run anything, and I did not run the Swift tests.
- claude-read: I did not read ShareViewController, ShareStrings or the test support files beyond the fix diff.
- claude-read: I did not re-check the backend, frontend or the I8-I10 behaviour in this round.
- claude-read: Whether pickDrive during sending is truly blocked in the view (canPickDrive) on a device was not checked.
- claude-verify: I did not read the tests, so I could not check the claim that barRetryUnknownUsesOriginalName covers only one retry.
- claude-verify: I did not read the rest of the spec's section 8 table beyond the grep hits.
- claude-verify: I did not check the other invariants (I1-I5, I8-I10) or any non-queue file.

TOTAL: 2 findings
