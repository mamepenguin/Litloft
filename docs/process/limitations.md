# Limitations

What the kit does not do. Read this before relying on it.

- **A human is not authenticated.** `decision:` and `Approval:` are lines in files, and
  an agent running as the same user can write them. The real gate is branch protection
  with a review by someone other than the author. The kit documents this and does not
  configure it.
- **A run that needs a human cannot reach merge without one.** A project where nobody is
  available cannot merge on HUMAN_REVIEW_REQUIRED; those are decisions about the design and
  the process. An agent that writes `decision:` itself falls under the first limitation.
- **A pull request can edit `process.yml` and the gate scripts.** Classification runs on
  the head of the pull request. Required status checks supplied by a ruleset outside the
  pull request are the backstop.
- **`mutate` isolation covers files only.** A throwaway worktree isolates files. A
  process with a shell can touch other refs, databases, ports, containers and caches. The
  kit checks the reviewed branch tip and the author's working tree; the rest belongs to
  the project and is noted in `PROJECT.md`.
- **Same-family verification is not independent.** A verifier from the same model family
  as the first reviewer does not check it the way a different family would, and one
  `rejected_with_evidence` record removes a finding from FAIL. For that reason a rejected
  bucket A or BLOCKER finding is routed to a human by the verdict table. A `codex` line in
  `reviewers.conf` adds a different family.
- **The script checks that a claim is present, not that it is a claim.** The human
  reading `triage.md` judges that.
- **A pull request from a fork gets a read-only workflow token.** The label step fails,
  every push posts the comment again, and the label is not removed when a later run
  passes.
- **Local artifacts are not a tamper-proof audit trail.** The fingerprint does not cover
  `docs/process/reviews/`, so an artifact edited between `review.sh` and a standalone
  rerun of `merge-reviews.sh` is not detected.
- **A commit that trims `.process-kit.lock` is CRITICAL and a human reads it.** If the
  human misses the removed line, protection is lower for every later commit.
- **On the Agent path the fingerprint, schema, verdict and fresh-process property are
  not enforced.** They are requested in the brief. A Markdown report has no verdict.
- **There is no tamper gate beyond classification.** Nothing prevents a local edit to a
  kit-owned file. An agent making one follows the protected-path rule, a human reads the
  CRITICAL change, and the next update overwrites it.
- **Acceptance-test isolation is prose.** That tests are written from the spec alone is
  a rule the agent is asked to follow, not one a script checks.
- **`core.hooksPath` is per clone.** The pre-push hook is active only in clones where the
  install has set it. `review.sh` warns when the clone it runs in has another value.
