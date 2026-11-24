# Triage: r2

## Trajectory

This run:
- claude-read: Every round after r1 applies the same fix: wait for an asynchronous commit or passive effect before acting. Each round adds new test-harness state for this. d5abda5 adds per-test waits and a `live` flag on FakeObserver in two files. 5196ef6 adds a production data-testid and the waitForVisualIndex helper, used in about 50 places. 2368e26 adds a `fired` counter to the SearchPage observer mock and splits fireSentinels out of reveal. The production design is not being patched: the only production edit is a test id. The test harness is, though: each file gets its own observer-readiness state, and there is no shared helper. The one removal is the `if (gapMs > 0)` branch in sheet-gesture.spec.ts swipe(), from the r1-era change. The double reveal in the I10 \"reloading or remain\" test became one waited reveal plus one unwaited fire.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:CR-1 — bucket B, INFO, open

Claim: The doc comment on reveal() in SearchPage.semanticContinuation.test.tsx gives the wrong reason the old fire was lost. It says the old observer "holds the state it was created with, and firing it reveals nothing", but neither production callback reads closed-over state.
Impact: A user cannot hit this, because only test code is involved. A maintainer who trusts the comment might go looking for a stale-closure bug in useFolderFiles or useInfiniteScroll that does not exist, or might wrap a callback in a ref for no reason.
Evidence: In useFolderFiles.ts:427-433, revealMore uses a functional setContinuation updater and has empty deps, so an older continuation observer that still observes the sentinel would still reveal. In useInfiniteScroll.ts:157-175, the callback reads pageRef.current, and while loadingMore or loading is true no observer exists at all, because the cleanup disconnects it and the guard at line 158 creates none. The real cause of the lost fire is that no live observer exists (all targets have been cleared) until the passive effect runs. reveal() handles that correctly by waiting for an observer that has targets.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the clause "until then the old one holds the state it was created with, and firing it reveals nothing" from the reveal() doc comment.

</details>

## Not verified

- claude-read: I did not run vitest, Playwright or pytest. I cannot run commands.
- claude-read: I did not reproduce the "expected 203 but got 103" CI failure, and I did not confirm that the new wait removes it under load.
- claude-read: I did not read every SearchPage test that might call fireSentinels or reveal under a hydration or revalidation path in useInfiniteScroll.
- claude-read: I did not confirm with git that the intelligence gitlink 21938cf contains exactly the diff shown.
- claude-verify: I did not run the test suite, so I did not observe the flake or its absence at runtime.
- claude-verify: I did not check whether fetchPage passed into useInfiniteScroll from useFolderFiles closes over state that could make loadPage stale.
- claude-verify: I did not review the rest of the commit's test changes outside reveal() and fireSentinels().

TOTAL: 1 findings
