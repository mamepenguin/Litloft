# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- protected_path

## Needs a human

### protected_path

Note: the change touches a protected path
Paths:
- process/reviewers.conf

## Findings

A: 0
B: 1
C: 0

### claude-read:R1-SCOPE-1 — bucket B, INFO, open

Claim: The diff changes process/reviewers.conf, a protected CRITICAL-zone path, and this change has no spec and no invariants file, so that path is not in any declared touch-point list.
Impact: No user-visible defect. Litloft users see no difference: the file is read only by scripts/process/review.sh. The cost is that no reviewer can check this CRITICAL change against a planned scope, and bucket A cannot be used. The row itself is well-formed: review.sh parse_conf (scripts/process/review.sh:95-126) accepts it, and it adds claude-deep to CRITICAL reviews only.
Evidence: process/reviewers.conf:24 adds `claude-deep | claude | read | CRITICAL | scope,submodules,persistence,concurrency`. docs/process/reviews/chore-risk-tuning/ holds only decisions.md and r1/{head.txt,expected.txt,classification.json,fixes.txt}, with no invariants.md. Grep under docs/specs/ finds no spec that mentions reviewers.conf, claude-deep or risk-tuning. r1/classification.json lists process/reviewers.conf as a CRITICAL zone and a protected path. r1/expected.txt lists claude-read, claude-verify and claude-deep, which matches what the new row does. The same situation was raised in docs/process/reviews/fix-backend-image-addons-dir/r1/triage.md:39 and accepted there by a human decision.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have a person decide either to accept the change without a spec, with a decision line as fix-backend-image-addons-dir did, or to add docs/process/reviews/chore-risk-tuning/invariants.md that lists process/reviewers.conf as the touch point.

</details>

## Not verified

- claude-deep: I could not run git, so I did not read the literal diff of 3306844cb. I inferred that it adds docs/process/reviews/chore-risk-tuning/decisions.md from the commit message and from grep results showing that only decisions.md and reviewers.conf mention this change.
- claude-deep: I did not run scripts/process/review.sh or the classifier to confirm the row parses at runtime.
- claude-deep: I did not check docs/specs/ or docs/specs/INDEX.md for a spec entry for this change.
- claude-read: I did not run review.sh or parse_conf, so whether the row is accepted is inferred from reading the code.
- claude-read: I did not read the commit 3306844cb itself through git. I relied on the supplied diff and the files in the working tree.
- claude-read: I did not check how review.sh handles a claude-deep run that fails or returns an invalid artifact.
- claude-verify: I did not run git, so I did not confirm that the working-tree contents match commit 3306844cb exactly. I read the worktree files, and the git status showed only untracked review files.
- claude-verify: I did not run review.sh to confirm that claude-deep is actually selected and run for a CRITICAL classification.
- claude-verify: I did not check whether the process kit formally requires an invariants.md for a CRITICAL change that has no spec.

TOTAL: 1 findings
