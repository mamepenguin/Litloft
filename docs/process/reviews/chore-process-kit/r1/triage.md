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
- .claude/agents/acceptance-test-writer.md
- .claude/agents/r5-runner.md
- .claude/agents/spec-design-reviewer.md
- .claude/commands/review.md
- .claude/commands/spec.md
- .claude/rules/process.md
- .githooks/pre-push
- .github/workflows/process.yml
- .process-kit.lock
- docs/process/escalation.md
- docs/process/limitations.md
- docs/process/principles.md
- docs/process/prohibited.md
- docs/process/review.md
- docs/process/risk-and-human-review.md
- docs/process/spec-and-design.md
- docs/process/testing-and-comments.md
- docs/process/workflow.md
- process/gates.conf
- process/process.conf
- process/protected-paths.conf
- process/reviewers.conf
- process/risk-zones.conf
- process/secret-allowlist.txt
- scripts/process-gates/frontend.sh
- scripts/process/check-traceability.sh
- scripts/process/ci-report.sh
- scripts/process/classify-risk.sh
- scripts/process/merge-reviews.sh
- scripts/process/precheck.sh
- scripts/process/prompts/read.md
- scripts/process/prompts/verify.md
- scripts/process/render-triage.sh
- scripts/process/review-result.schema.json
- scripts/process/review.sh
- scripts/process/secret-scan.sh
- scripts/process/validate-artifact.sh

## Findings

A: 0
B: 2
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: Deleting deploy/pre-push leaves the documented `.git/hooks/pre-push -> ../../deploy/pre-push` symlink dangling in any clone that installed it, and git then skips the hook without a message until the user also runs `git config core.hooksPath .githooks`.
Impact: On the developer's existing clone, pushes that touch frontend/ stop running vitest/tsc/eslint with no warning, so a frontend break reaches CI that the old hook would have caught locally. The check passes silently.
Evidence: The commit deletes deploy/pre-push. The old install instruction removed from docs/developer-guide/testing.md was `ln -s ../../deploy/pre-push .git/hooks/pre-push`. The replacement (.githooks/pre-push) runs only once core.hooksPath is set (docs/process/limitations.md: '`core.hooksPath` is per clone'). Nothing in the change removes the old symlink or warns about it.
Repro: not_reproduced (read-only reviewer). Expected: in a clone with the old symlink and no core.hooksPath, change a frontend file and run `git push`. No hook output appears and the push goes through.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Tell the user to run `git config core.hooksPath .githooks` (and remove the stale .git/hooks/pre-push symlink) when this lands, for example in the PR body.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: `test_dirs` in process/process.conf includes non-test source trees (`frontend/src`, `mcp-server/src`, `addons`), so check-traceability treats a SPEC-ID that appears anywhere in production source or an addon as a test citation.
Impact: An `implemented` ledger row can pass traceability because the ID appears in a source comment or constant, even when no test cites it. The traceability check then passes without a test.
Evidence: process/process.conf:9 `test_dirs=backend/tests tests frontend/src ... mcp-server/src ... addons`. In scripts/process/check-traceability.sh, `referenced()` greps those directories recursively with no filter on test file names.
Repro: not_reproduced. Expected: add an `implemented` row SPEC-CORE-001 with a valid Approval, put `// SPEC-CORE-001` in a non-test file under frontend/src/, and run check-traceability. It prints `ok`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: The part of review.sh after the 200000-byte truncation, and validate-artifact.sh.
- claude-read: No script was run: precheck, secret-scan, classify-risk, the hook and the workflow were all checked only by reading.
- claude-read: Whether the secret scan flags existing content in this branch's diff, which would block pushes or CI.
- claude-read: Whether ci.yml still covers the frontend checks the CI profile leaves out.
- claude-verify: The base-revision content of docs/developer-guide/testing.md (the removed `ln -s` install line). Only HEAD was readable.
- claude-verify: Git hook behaviour with a dangling symlink was not executed. It is based on git's documented access(X_OK) lookup.
- claude-verify: Whether addons/ has content outside this worktree (for example, gitignored or a submodule).

TOTAL: 2 findings
