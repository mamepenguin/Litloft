# Triage: r2

## Trajectory

This run:
- claude-read: The round from r1 to r2 did not add a branch, state or prediction. be206789 removed one stale route note in fileDetailShell.ts and changed one addon test to click the submit button and assert the last call. The fix commits left the spec touch-point list untouched, so the r1 gaps TP-1 to TP-4 remain open. The design is not being patched further in this round; the remaining open items are documentation and a loop default that was never written down.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Smart Collection queue loop default is ON (CollectionPanel.tsx getSmartLoop), not OFF as for collections; see READ-1.; CollectionPanel.tsx adds aria-labels 'Move up', 'Move down', 'Remove from collection' (en/ja messages) to the existing collection-mode buttons. These are new screen-reader strings for the collection surface that the spec does not mention. The buttons are only rendered for user collections, so they are not drawn in the Smart Collection queue.
- claude-read: Smart Collection queue loop default is ON (CollectionPanel.tsx getSmartLoop), not OFF as for collections; see READ-1.
- claude-read: CollectionPanel.tsx adds aria-labels 'Move up', 'Move down', 'Remove from collection' (en/ja messages) to the existing collection-mode buttons. These are new screen-reader strings for the collection surface that the spec does not mention. The buttons are only rendered for user collections, so they are not drawn in the Smart Collection queue.

## Findings

A: 0
B: 1
C: 0

### claude-read:READ-1 — bucket B, LOW, open

Claim: A Smart Collection queue starts with loop on, while a collection queue starts with loop off, although the spec asks that the loop toggle work as it does for a collection.
Impact: A user who has never touched the loop toggle gets a looping Smart Collection queue but a non-looping collection queue. The shared localStorage key means the first toggle in either surface changes both, so the default difference is visible and surprising.
Evidence: frontend/src/components/CollectionPanel.tsx: getLoop() returns stored ?? false, while the new getSmartLoop() returns stored ?? true; SmartQueuePanel uses getSmartLoop as its initial state. Both read LOOP_KEY 'collection-loop'.
Repro: Not reproduced; read of the defaults only. Clear localStorage, open a collection queue (loop OFF) and a Smart Collection queue (loop ON).
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either use the collection default (false) for the Smart Collection queue, or add the loop-on default to SPEC-CORE-109 step 5 so the difference is intentional.

</details>

## Not verified

- claude-read: No command was run and git could not be queried (only Read, Glob and Grep). The contents of commit 043f7d81 were not inspected; the fix set was taken from the prompt text.
- claude-read: The unit, Python and Playwright suites were not executed, so no pass or fail result is claimed.
- claude-read: The browser layout (I11) and the real-time behaviour of the queue were not checked.
- claude-read: SmartFolderPlay.tsx, smartQueue.ts and smartFolderActions.ts were not read in full; only the parts that the diff text showed were used.
- claude-read: The design-decisions rule on addon-to-core imports (addons/intelligence/frontend importing @/lib/api and @/lib/smartCollectionEval) was not judged against the rule text.
- claude-verify: Did not run the app or tests (no command access); did not open frontend test or e2e files for loop defaults.
- claude-verify: Did not check the design-decision notes or review records for an intended Smart Collection loop default beyond the spec lines quoted.
- claude-verify: Did not check the bucket taxonomy definitions, so the bucket proposal is not validated against them.

TOTAL: 1 findings
