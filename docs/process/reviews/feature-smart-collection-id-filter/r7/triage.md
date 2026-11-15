# Triage: r7

## Warnings

- R-5 ran at 0ec11b3c4e6dcb472b767bc965e2fb2c4f294b96, and these files changed since: docs/user-guide/reading.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: Yes, the design is being patched by accretion. 96a1fd8 adds listedResolution, resolutionInForce and the trackFirstPage wrapper on top of the inResolution, inRetryToken and resolutionGeneration state added in the earlier round, and adds inKey and the retry token to continuationKey; it moves the loading branch from inNameResolving to inNamePending, but inNameResolving remains for passagesLoading, so nothing is removed. d216d54 adds a requestKey dimension to the Discover cache keys for a property the two fileIds === null guards already enforce, so it is a third mechanism for the same concern. 424ee41 and 0af8d49 add tests only. 6c312bd only strengthens a test. No round removed a state or a branch.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Switching a member target away and back in one page visit reuses the earlier evaluation without re-evaluating (R7-1).; A Smart Collection named twice in `in:` (for example `in:"Weekly" in:weekly`) is evaluated twice in resolveInNames, because classifyNames does not deduplicate smart folders. This is harmless to the result but breaks the one-evaluation-per-name bound in SPEC-CORE-116 §10.
- claude-read: Switching a member target away and back in one page visit reuses the earlier evaluation without re-evaluating (R7-1).
- claude-read: A Smart Collection named twice in `in:` (for example `in:"Weekly" in:weekly`) is evaluated twice in resolveInNames, because classifyNames does not deduplicate smart folders. This is harmless to the result but breaks the one-evaluation-per-name bound in SPEC-CORE-116 §10.

## Findings

A: 0
B: 1
C: 0

### claude-read:R7-1 — bucket B, LOW, open

Claim: useMemberTarget keeps the last evaluation in `held` and never clears it on a target change, so after switching a member target away and back, the same key matches the old result and the app is ready with stale members before the re-evaluation finishes.
Impact: After switching Video or Reading from a Smart Collection with free text to another target and back, in one page visit, requests go out immediately with the earlier member set, not the set the collection holds now. Members added or removed in between are not reflected until the re-evaluation completes, and the requests then fire a second time when the new evaluation replaces the old one.
Evidence: frontend/src/components/appshell/useMemberTarget.ts:27 (held state), :33 (setHeld only on resolution), :41 (evaluation = held when held.key === key, and key is null for a target with no kinds or no target, so the old entry is not cleared). Sequence: A evaluates (held.key = A-key); target switches to default (key = null, evaluation = null); target switches back to A (key = A-key again, so evaluation = the old result, evaluating = false, ready = true). The effect at :29-38 then re-evaluates A, and a new held object with the same key changes requests identity. The hook's docstring says a result that outlives its target is dropped; the code does not do that. Introduced by the feature branch, not touched by any fix commit since r6 (96a1fd8, d216d54, 424ee41, 0af8d49, 0299394, 6c312bd).
Repro: Not reproduced: traced in code only. Steps: in Video, pick a member target, let its evaluation settle, pick the default target, pick the member target again, and observe that the first shelf requests carry the earlier file_ids before the second evaluation request returns. No test covers a return to an earlier target.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Clear `held` when the key becomes null, or key the stored result by the attempt and target and drop it on a target change, so a return to a target always starts at evaluating.

</details>

## Not verified

- claude-read: No tests were run and no typecheck was done. The mutation results above are reasoned, not executed.
- claude-read: useInfiniteScroll's refetch-on-fetchPage-identity behaviour was not traced, so the inNamePending end condition relies on the refetch happening.
- claude-read: The 150 KB request-body limit through the Next rewrite and the addon proxy was not measured.
- claude-read: addons/intelligence/app/routers/search.py and the new tests were read only in the diff; the worktree copy was not read in full.
- claude-read: The scope of `introduced` for useMemberTarget.ts: the hook is part of this feature branch, so it is marked 'introduced' rather than 'pre-existing' even though no fix commit since r6 touched it.
- claude-verify: No test was run; the claim was verified by reading the code only.
- claude-verify: Did not check how useVideoApp / useReadingApp build their listing load keys, so I did not confirm whether a stale fileIds value actually reaches a request or a visible list in the UI.
- claude-verify: Did not check whether the page can remount on a target change, which would reset held state (I read the hook as persisting across target changes).
- claude-verify: Did not check whether the window of stale results can be observed in practice, or how long a re-evaluation normally takes.

TOTAL: 1 findings
