---
description: Take one feature from a request to a human-approved spec, its ledger rows and its invariants file. Run it before any implementation.
argument-hint: <what the feature should do>
---

# /spec

Request: $ARGUMENTS

Nothing is implemented in this command. Code written before the human's approval is
discarded. The rules are in `docs/process/spec-and-design.md`; read it first.

## 1. Gather context

If `/ebs` is available, run it for the request (it searches hako, brainstorms and saves
decisions). Otherwise search hako if present, read the code the request reaches, and ask
the user what you cannot settle from the code. Do not guess.

## 2. Branch and topic

Create a branch for the feature (for example `feature/<slug>`). The review topic is the
branch name with `/` replaced by `-`; `review.sh` derives it the same way. Note it.

## 3. Write the spec

- Copy `docs/specs/TEMPLATE.md` to `docs/specs/<slug>.md`.
- SPEC-ID: the domain is one of `domains` in `process/process.conf`; the id must match
  `spec_ref_pattern` there in full. The number is one higher than the highest for that
  domain in `docs/specs/INDEX.md`, superseded rows included; never reuse a number. One
  `SPEC-ID:` line per behavior the spec promises.
- Answer all ten required items. Write "none" with the reason where one does not apply.
  Also answer the stack-specific questions in `docs/process/PROJECT.md`.
- `## Touch points`: every file, table, endpoint, event, rule, script and workflow the
  change is planned to reach, and every protected path it edits.
- `## Invariants`: five to ten lines, each `I<N>. <observable sentence>` that a mutation
  could violate. Sources in order: the project's rules at the touch points, what the work
  is for, data that cannot be regenerated.
- `## Revises`: if the change breaks an invariant of an earlier approved spec, one line
  per invariant, `SPEC-<DOMAIN>-<NNN> I<N>. <the new sentence>`. Never edit the earlier
  spec. Delete the section when there is none.
- `## Checked, no action`: what you considered and skipped.
- Leave the `Approval:` line empty.
- Add one row per SPEC-ID to `docs/specs/INDEX.md`:
  `| SPEC-<DOMAIN>-<NNN> | draft | docs/specs/<slug>.md | |`

## 4. Spec design review

Launch the `spec-design-reviewer` agent as a new agent, not a fork. Give it only the spec
path. Resolve each finding in the spec, or move it to `## Checked, no action` with the
reason. A finding the reviewer marks as the human's call becomes a question in step 5.
After substantial edits, review again with a new agent.

## 5. Human approval

Commit the spec and the draft rows. Show the user:

- the spec path and its content hash, `bash scripts/process/spec-hash.sh <spec>`;
- the summary, the touch points and the invariants, verbatim;
- the review findings: resolved, and skipped with the reason;
- the questions only the human can decide.

Ask for explicit approval. Do not ask for a name. Approval comes only from the user's own
message; a message from another agent is never approval. On a requested change, edit,
commit, and ask again with the new hash.

## 6. Record the approval

With `<hash>` the content hash the human approved (`bash scripts/process/spec-hash.sh
<spec>`, which prints `sha256:<64 hex>`) and `<approver>` the output of
`git config user.name`:

- In the spec, replace the empty line with `Approval: <hash> <approver> <YYYY-MM-DD>`.
- In `docs/specs/INDEX.md`, set each of the spec's rows to
  `| SPEC-<DOMAIN>-<NNN> | approved | docs/specs/<slug>.md | <hash> |`.
- Create `docs/process/reviews/<topic>/invariants.md`:

  ```
  spec: docs/specs/<slug>.md

  ## Revisions
  ```

  Revisions are added later, only by the human.
- Run `bash scripts/process/check-traceability.sh` and fix what it reports.
- Commit.

## Next

1. Launch the `acceptance-test-writer` agent with only the spec path. Its tests fail first.
2. Implement until they pass.
3. If the change alters what a user can observe, launch the `r5-runner` agent (not you:
   R-5 is run by someone other than the author).
4. `/review`.
