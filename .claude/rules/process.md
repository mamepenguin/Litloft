# Process rules

These rules apply to every task in this repository. The detail is in `docs/process/`.

## Always

1. **New behavior starts at `/spec`.** Implementation begins only after a human approves
   the spec. Work done before approval is discarded.
2. **Review before merge.** A fresh process (not a fork of this session) reviews a fixed
   commit; what may skip it is in `docs/process/workflow.md`, Skips. Do not push or edit
   the repository until the reviewer is done.
3. **Never loosen a check.** Do not delete or skip a test, weaken an assertion, add a
   lint disable, raise a threshold, or bypass a hook. If you did, revert it and report;
   what cannot be reverted is handled as `docs/process/prohibited.md` states.
4. **Protected paths.** The set and the rule are in `docs/process/risk-and-human-review.md`.
5. **Stop and ask rather than guess** when the spec is ambiguous or silent.
6. **Minimal change.** Touch only what the task requires.
7. **Three attempts at the same problem, then escalate.**
8. **A finding is a claim.** Reproduce it before acting on it. Push back with the
   observation it predicts, not with argument.
9. **The approved spec is the standard of correctness for behavior.** In a comment,
   docstring or prose the code wins; prose that disagrees with the code is deleted.

## Where to read

| Document | Read it when |
|---|---|
| `docs/process/principles.md` | Starting work in this repository, or unsure why a rule exists |
| `docs/process/workflow.md` | Deciding which steps a change needs, or whether a step can be skipped |
| `docs/process/spec-and-design.md` | Writing or approving a spec, invariants or touch points |
| `docs/process/review.md` | Sending a change to review, or reading `triage.md` |
| `docs/process/risk-and-human-review.md` | A change touches a risky area, a protected path, or a conf file |
| `docs/process/testing-and-comments.md` | Writing a test, deciding whether one stays, or writing a comment |
| `docs/process/prohibited.md` | A gate fails and you are tempted to adjust the check |
| `docs/process/escalation.md` | You are stuck, blocked, or on your third attempt |
| `docs/process/limitations.md` | Relying on the process as a guarantee |

Project-specific configuration: commands are in `gates.conf`, risk zones in
`risk-zones.conf`, the spec location in `process.conf`. Project facts, and what the agent
cannot verify (`agent_cannot_verify`), are in `docs/process/PROJECT.md`.
