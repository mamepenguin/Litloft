---
description: Run the post-implementation review of the current branch, show triage.md, and say which decision, if any, the human must make.
argument-hint: "[--topic <name>] [--perspective a,b]"
---

# /review

Arguments for `review.sh`: $ARGUMENTS

The rules are in `docs/process/review.md` and `docs/process/workflow.md`. You prepare the
decision; you never make one on the human's behalf.

## 1. Topic and tree

The topic is `--topic` if given, otherwise the branch name with `/` replaced by `-`. The
review directory is `docs/process/reviews/<topic>/`. Commit the work first: a clean tree
at a fixed commit is what is reviewed. From here until `review.sh` exits, do not edit or
push this repository.

## 2. R-5 recorded

Read `docs/process/reviews/<topic>/decisions.md`.

- If the change alters what a user can observe, `ran_in_app:` must be `yes`, and `by:`
  and `evidence:` must be filled. Parts listed under `agent_cannot_verify` in
  `docs/process/PROJECT.md` may be recorded as pending.
- If it does not, `ran_in_app: not-applicable` with the reason in `evidence:`.
- If the record is missing, empty or `no`, stop. Offer to launch the `r5-runner` agent.
  Do not fill the fields yourself; you are the author.
- If a fix since the last R-5 changed what a user can observe, R-5 runs again.

## 3. Run the review

```bash
bash scripts/process/review.sh $ARGUMENTS
```

It runs fresh reviewer processes and may take several minutes; wait for it to exit. It
prints `run directory:`, `verdict:` and `triage:`. Exit codes: 0 PASS, 1 FAIL, 2
HUMAN_REVIEW_REQUIRED or a refusal to run, 64 usage error. A refusal prints no verdict:
show the message and stop.

## 4. Show triage.md

Show the user `triage.md` from the run directory. Show every finding block as written:
claim, impact, evidence, repro, introduced, both buckets, and the proposed fix. Do not
condense findings into remedies, change a severity or drop a finding.

## 5. Say what is needed

- **PASS**: no decision is needed. Leave `decision:` empty.
- **FAIL**: the author fixes. Reproduce each open bucket A or BLOCKER finding before
  fixing it. An invalid or missing artifact means running that reviewer again; never
  edit an artifact. Commit the fixes, then run `/review` again. Items under *Needs a
  human* are listed for the human and not decided by you.
- **HUMAN_REVIEW_REQUIRED**: list the items under *Needs a human* and ask the human to
  decide: continue, ship or discard. Write `decision:` in `decisions.md` only after the
  human states it in their own message, and write what they said. No answer means no
  decision.

## 6. Mark the spec implemented

After a PASS, or after the human states a ship decision in their own message:

- In `docs/specs/INDEX.md`, set each of the spec's rows from `approved` to `implemented`.
- Run `bash scripts/process/check-traceability.sh`. An `implemented` row needs its SPEC-ID
  cited under `test_dirs` in `process/process.conf`. If it reports
  a row not referenced, show the user which citation is missing; do not set the row back
  or edit the script.
- Commit the ledger.
