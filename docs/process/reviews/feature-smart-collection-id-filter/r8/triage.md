# Triage: r8

## Warnings

- R-5 ran at 0ec11b3c4e6dcb472b767bc965e2fb2c4f294b96, and these files changed since: docs/user-guide/reading.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: Yes, the design is being patched. This commit adds a new state (`lastTarget`) and a render-time reset beside `held` and `attempt`, to fix the stale-held result that R7-1 reported. The R7-1 proposal offered clearing `held` when the key becomes null, which would have handled the same case with no new state. Nothing from the earlier rounds was removed, and the hook now has three state dimensions for one lifecycle.

Earlier runs:
- r7 / claude-read: Yes, the design is being patched by accretion. 96a1fd8 adds listedResolution, resolutionInForce and the trackFirstPage wrapper on top of the inResolution, inRetryToken and resolutionGeneration state added in the earlier round, and adds inKey and the retry token to continuationKey; it moves the loading branch from inNameResolving to inNamePending, but inNameResolving remains for passagesLoading, so nothing is removed. d216d54 adds a requestKey dimension to the Discover cache keys for a property the two fileIds === null guards already enforce, so it is a third mechanism for the same concern. 424ee41 and 0af8d49 add tests only. 6c312bd only strengthens a test. No round removed a state or a branch.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:R8-1 — bucket B, LOW, open

Claim: The new test for the return to a member target does not exercise a switch while an evaluation is still in flight, so the guard `if (current)` in useMemberTarget.ts can be removed without any test failing.
Impact: Today the guard keeps a result from an evaluation that started before a target switch from being stored. If the guard regresses, a member target switched away and back during a slow evaluation would show that earlier evaluation's members as ready before the new evaluation answers, which is the stale-members case this commit fixes for the settled-result case. No test would catch it.
Evidence: frontend/src/components/appshell/useMemberTarget.ts:41-46 (evaluation resolves into setHeld only when `current`, and the effect cleanup sets current=false). frontend/src/components/videoapp/__tests__/VideoApp.memberTarget.test.tsx, the new describe 'SPEC-CORE-117 step 3, I8: a return to a member target evaluates again': the first evaluation has settled before the switch away, so no evaluation is in flight when the target changes.
Repro: Mutation, reasoned and not executed: delete `current` from the guard at useMemberTarget.ts:42. The new test still passes, because its evaluation for the first visit has already settled before the switch. The mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that starts evaluation A, switches to the default target before A answers, switches back to A, then releases the first evaluation late and asserts that no request under the target goes out until the second evaluation answers.

</details>

## Not verified

- claude-read: No tests were run, and no typecheck was done. Every result above is from reading the code, not from execution.
- claude-read: I did not confirm whether useLoad reloads smartFolders while a page is open, so the potential issue with the `folder` dependency is not confirmed.
- claude-read: I did not read the Reading app's use of the hook beyond its call site, so the Reading return path is not checked.
- claude-read: Commit 1a8f8f988 (listedResolution, search page) is not part of this commit and was not reviewed here.
- claude-verify: Did not run the test suite or any mutation, since only Read, Glob and Grep are available. The claim that the guard removal survives is from reading the test code, not from a mutation run.
- claude-verify: Did not check the reading app's tests for an in-flight switch in useReadingApp.ts beyond a grep for useMemberTarget and in-flight names.
- claude-verify: Did not check the Reading app's member evaluation path for the same stale-resolve behaviour.

TOTAL: 1 findings
