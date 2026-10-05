# Workflow

## Roles

- *Author*: the agent that implements.
- *Human*: decides design judgments, assigns bucket C, and, when the verdict is
  HUMAN_REVIEW_REQUIRED, decides continue, ship or discard. The kit does not authenticate
  the human and does not require the human to differ from whoever started the task.

## Flow

```
requirement
 └ /spec  (hako search + brainstorming via /ebs when present; inline fallback otherwise)
     ├ ten generic required items + touch points + invariants (R-0)
     ├ spec design review (fresh reviewer)
     └ HUMAN APPROVAL: implementation before this is discarded
         ├ spec file records Approval: <sha> <name> <date>; ledger row; SPEC-ID
         ├ acceptance tests written from the spec only
         └ implementation (agent named in process.conf)
             ├ R-5: an agent other than the author uses the changed path in the running application
             └ /review
                 ├ precheck (gates.conf) + risk classification
                 ├ reviewers (reviewers.conf), fresh processes, fixed SHA
                 ├ merge-reviews: deterministic verdict
                 └ render-triage: triage.md
                     ├ FAIL: the author fixes and reviews again
                     ├ PASS: the author proceeds
                     └ HUMAN_REVIEW_REQUIRED: the human decides (continue | ship | discard)
```

In Claude Code, `/spec` runs everything up to the recorded approval and `/review` runs
everything after R-5. The agents under `.claude/agents/` take the steps that need a context
other than the author's: the spec design review, the acceptance tests and R-5.

## Who decides

- **FAIL**: the author fixes and reviews again, and does not decide items listed under
  *Needs a human*.
- **PASS**: the author proceeds, and `decision:` in `decisions.md` stays empty.
- **HUMAN_REVIEW_REQUIRED**: the human decides to continue, ship or discard.

## Steps

| Step | Output |
|---|---|
| `/spec` | Spec with the ten items, touch points, invariants |
| Approval | `Approval:` line in the spec file, ledger row, SPEC-ID |
| Acceptance tests | Tests derived from the spec alone |
| Implementation | A commit on a branch |
| R-5 | `ran_in_app`, `by`, evidence and pending parts recorded |
| `/review` precheck | Gate results, risk level |
| Reviewers | One findings artifact per reviewer |
| Merge | Verdict (script path only; a Markdown report has no verdict) |
| Triage | `triage.md` |
| Decision | `decision:` in `decisions.md`, only after HUMAN_REVIEW_REQUIRED |

On the script path the reviewers' output is schema-valid JSON and the verdict is derived
by code. On the Agent path the output is a report with the `TOTAL: N findings` terminator
and there is no verdict. See `review.md`.

## Skips

| Change | Skipped | Never skipped |
|---|---|---|
| Docs-only, outside protected paths | `/spec` and review | secret scan, lint gates |
| Behavior-preserving refactor | new SPEC (existing ID carried); existing tests must be green | review |
| Bug fix | the spec design review and the approval; the correct behavior is stated as a SPEC or UNSPEC | review |

New user-visible behavior and any protected path are never skipped. Prose that defines
the process (agents, brief, rules) is a protected path, so "docs-only" does not apply to
it.

Review is skipped only for a docs-only change outside protected paths, and for a change
simple enough that tests and error checks (type check, lint, build) complete its
verification. A refactor or a bug fix is not simple by category, and a protected path is
never exempt.

## The ten generic spec items

1. Normal flow
2. Failure cases
3. States
4. Data read and written
5. External services
6. Authorization
7. Effect on existing features
8. Error behavior
9. User-visible behavior
10. Non-functional requirements

Stack-specific questions go in `PROJECT.md`.

## R-5: using the changed path in the running application

R-5 applies to a change that alters what a user can observe. It happens before `/review`,
run by an agent other than the author, which is given the spec and the changed paths and
not the author's conversation, and which uses the real environment (a browser, a
simulator). What no agent can drive (a real device, hardware, audio) is listed in
`PROJECT.md` under `agent_cannot_verify`; those parts are recorded as pending in
`decisions.md` and do not block a merge, and a human checks them before release. A failure
is a bug: the author fixes it and R-5 runs again. R-5 also runs again when a fix made after a review changes what a user can observe;
whoever checks a pending part updates the record. A test run or a report is not R-5.

The R-5 agent creates `decisions.md` if it is absent and writes the record in it: `ran_in_app: yes|no|not-applicable`,
`at:` the commit it ran against,
`by: agent|human|both`, the evidence (steps, screenshots, a recording path), and the
pending parts.
