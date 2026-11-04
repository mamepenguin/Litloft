# Triage: r3

## Warnings

- R-5 ran at fb2b2108a4428a1728cbf0ce503b3b59bf67cc9d, and these files changed since: .claude/rules/internal-api-policy.md, backend/app/database.py, backend/app/routers/internal.py, backend/app/services/fileops.py, docs/ADDON-DEVELOPMENT.md and 5 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: There have been two fix rounds. In efbe71ff3 the addon's tag-dedup fold changed from casefold() to lower() to match the core. In 463ecfd7c the addon's 200-character length check moved from after dedup to before it, the same order as the core, and the core gained the mirror test rows. Neither round adds a branch, a state or a prediction. Each one removes a difference between the addon and core validators by changing existing code to match the core, and the only additions are test rows. No round repeats something an earlier round added, so the design is not being patched. The second round closes the ordering difference that the r1 verifier noted and that r2 reported as R2-1, and it also closes R2-2.
- claude-read: There have been two fix rounds. Round 1 (efbe71ff3) replaced the addon's casefold() with lower() and added one addon parity row. Round 2 (463ecfd7c) moved the addon's existing length check ahead of dedup and added a core-side twin of each fold-sensitive row. Neither round adds a branch, a state or a prediction that the round before it also added. Each round removed a divergence between the two validators by aligning the addon with the core's existing order and fold, rather than adding special cases. The design is not being patched. The two validators now apply identical steps in the same order.

Earlier runs:
- r2 / claude-deep: There was one fix round (efbe71ff3). It adds no new branch, state or prediction. It replaced casefold() with lower() in the addon's tag deduplication, which removes a divergence instead of adding a special case, and it added one test row and corrected one doc sentence. The design is not being patched. One related divergence that r1's verifier noted (length checked after dedup in the addon, before dedup in the core) was not addressed in this round.
- r2 / claude-read: There has been one fix round (efbe71ff) since r1. It adds no branch, state or prediction. It replaces the addon's fold function (casefold → lower) so it matches the core's, adds one parity test row, and corrects the documented tag cap from 10 to 20. Nothing was added that an earlier round had also added, so there is no sign of the design being patched. The round also did not remove the second validator divergence that the r1 verifier noted (length checked after dedup in the addon, before dedup in the core). It remains open as R2-1.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-deep: I ran no tests. All mutation outcomes above come from reading the code.
- claude-deep: I read the files on disk. I did not confirm that the worktree's submodule checkout is exactly d5795aaf.
- claude-deep: I did not re-read the addon's scoped channel code in app/search.py or the frontend, because this round did not change them.
- claude-deep: I did not check whether the frontend's parseSearchQuery dedups tags before it sends `filter`. The JavaScript toLowerCase() and Python lower() behaviour for such tags was not compared.
- claude-read: I ran no tests. The mutation outcomes above come from reading the code, not from running it.
- claude-read: I did not confirm that the worktree's addon checkout is exactly at d5795aaf9. I read file_matching.py as it is on disk.
- claude-read: I did not re-read the scoped search channels in addons/intelligence/app/search.py or the frontend, because this round did not touch them.
- claude-read: The behaviour of str.lower() on U+0130 is taken from Python's Unicode semantics, not executed.
- claude-verify: Addon search.py scoped channels, exact/widened vector paths and cutoffs (I3, I4, I5, I11)
- claude-verify: Frontend chip, menu, URL-sync, history and cache behaviour (I6-I9, I13-I17, I19-I22)
- claude-verify: e2e-layout case at 390 px and desktop width (I15)
- claude-verify: Backend and addon tests, including the Layer 1 and Layer 2 contract tests
- claude-verify: The 422 and 503 mapping in the addon router for filter errors
- claude-verify: Whether JS toLowerCase and Python str.lower differ on any character relevant to tag dedupe

TOTAL: 0 findings
