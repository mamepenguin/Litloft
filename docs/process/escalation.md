# Escalation

Escalation hands a decision to a human when an agent cannot or should not make it. It is
part of normal operation, not a failure.

## Stop and ask when

| Situation | Example |
|---|---|
| The spec is ambiguous or silent | The implementation meets a case the spec does not describe |
| A protected path would change and the approved spec does not name it | See `risk-and-human-review.md`, Protected paths |

Do not resolve an ambiguity by reading the code or by guessing. Where a question needs a human
(`risk-and-human-review.md`, What needs a human), the verdict is HUMAN_REVIEW_REQUIRED and
the human decides from `triage.md` (see `workflow.md`, Who decides).

## Three attempts

Three attempts at the same problem, then escalate.

## Exceptions

A push made with `--no-verify` is handled as `prohibited.md` states. An unfounded secret-scan
allowance is prohibited (see `prohibited.md`).
