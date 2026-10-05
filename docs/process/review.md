# Review

How a change is reviewed and how the reviewer is briefed. Code review and security review
use one contract; a security review names its perspectives.

Every change goes to an independent reviewer, except where the Skips section of
`workflow.md` exempts it.

The code is what is reviewed. Comments, docstrings, commit messages and docs are not a
specification the code is checked against; a disagreement between them is not a code
defect, and the prose is deleted or corrected. Review time goes to what a user can hit and
to tests that would let it through.

## Reviewer roles

`reviewers.conf` has one row per reviewer: `id | engine | role | min_risk | perspectives`.

| Column | Meaning |
|---|---|
| `id` | Names the reviewer's artifact, `<id>.json` |
| `engine` | `claude` (a fresh `claude -p` process) or `codex` (optional) |
| `role` | `read`, `mutate` or `verify` |
| `min_risk` | A `read` or `mutate` reviewer is in the expected set when the classified risk is at least this level. `verify` has none |
| `perspectives` | Named per review, for example `--perspective security,auth` |

- `read` judges the diff. Tools: Read, Glob, Grep.
- `mutate` breaks the implementation one change at a time, only in a throwaway worktree at
  the fixed SHA, after the project's `worktree_setup` row has prepared it (dependencies,
  generated files, environment files, caches). It has shell and edit tools and never
  writes into the main tree.
- `verify` has Read, Glob and Grep only. It records one verdict on each finding of the
  other artifacts. It is always in the expected set.

The default install is one `read` and one `verify`, both `claude`. The same model family
verifying itself is a stated limit; a `codex` row adds a different family. There is no
separate security reviewer. Every role returns findings through the CLI's structured
output; prose on standard output is not parsed. `review.sh` validates the result and
writes `r<N>/<id>.json`.

## A fresh process, and what a later review gets

Independence means a reader who does not carry the author's assumptions. A fresh process
gives that; a fork of the author's session does not.

A later review is fresh, not ignorant. It asks whether the fix did what it claimed and
what it broke, a question about the review before it, so it gets the record and not the
reasoning: the declared invariants with their revisions; every earlier review's directory;
and the SHA of every fix commit since the previous review, so it reads the diffs itself. One-line
summaries are not enough. The commit message and PR body are all the narrative it gets.

The reviewer is given, in priority order: the code at a fixed SHA; the conventions the
change touches, named; the spec for this change including `## Checked, no action`; visual
design material for anything visual; long-term notes only to ask whether something was a
deliberate earlier decision.

## R-1: Review a fixed SHA

The brief says "review `<sha>`, not the branch against its base". Nothing is pushed or
edited in that repository until the reviewer is done; a `git worktree` at the SHA keeps the
author free. If a push is unavoidable, tell the reviewer the SHA changed.

On the script path `review.sh` records a fingerprint before and after: the HEAD sha and a
hash of tracked changes and untracked files, excluding everything under
`docs/process/reviews/` except `invariants.md`, and excluding `.process/runs`, plus the
content of the spec `invariants.md` names, which `.gitignore` may hide. A difference
is FAIL. Reviewing a clean-tree commit is the default; `--working` is the exception.

## R-2: The terminator lives in the artifact

Script path: completion is the reviewer process exiting plus a valid JSON file;
`render-triage.sh` ends `triage.md` with `TOTAL: N findings`, N computed from the JSON.
Agent path: the reviewer writes a Markdown report incrementally, its last line
`TOTAL: N findings`, N equal to the number of finding headings.

`TOTAL` is a condition for reading, not for editing: a file ending `TOTAL: 12` can still
grow. The author edits again only after the reviewer process has exited (script path) or
reported completion (Agent path).

## R-3: Mutate the behavior

The instruction is not "read the code and find defects". It is: break the implementation
one change at a time and see whether a test fails. Targets are branches, conditions,
guards, ordering, error paths and the values a test asserts on.

- The unmutated worktree runs first. If its baseline is not green the artifact is `INVALID`,
  and the verdict is FAIL even when the artifact has no findings.
- Declare `want=kill` or `want=live` before each mutation.
- Restore the tree after each mutation and fix nothing.
- Prose is never a mutation target. Report prose only when it would lead a reader to a
  wrong code change, and propose deleting it.

## Enforced and requested

| Rule | Script path | Agent path |
|---|---|---|
| R-1 fixed SHA | enforced: fingerprint before and after | requested |
| R-2 terminator and count | enforced: schema, `triage.md` count | requested; checked by `--ingest` |
| R-3 baseline and worktree | enforced, including that the reviewed branch tip and the author's working tree are unchanged after a `mutate` review. Other refs are not checked. The content of each mutation is the reviewer's | requested |
| Fresh process, not a fork | enforced | requested |
| Verdict derived by code | enforced | none: a Markdown report has no verdict |
| Later-review inputs | enforced: the declared invariants, every earlier review directory, the diff of each commit in `fixes.txt`, taken from git | requested |

On the Agent path the fingerprint, schema, verdict and fresh-process property are not
enforced. Ask for them in the brief and check the result by hand.

## Findings contract

A finding is a claim, reproduced before anyone acts on it.

| Field | Content | Required |
|---|---|---|
| `claim` | One sentence: what is wrong, with no remedy | yes |
| `impact` | What a user or operator can hit, in plain words | yes |
| `evidence` | `file:line` and the observed behavior | yes |
| `repro` | Steps or the mutation, and the result; `not_reproduced` is allowed | yes |
| `introduced` | `introduced`, `pre-existing` or `unverified`. Shown in triage; not an input to the verdict | yes |
| `bucket_proposal` | A, B or C with a reason. A requires `invariant_ref`, a declared invariant id | yes |
| `severity` | BLOCKER, HIGH, MEDIUM, LOW or INFO. BLOCKER requires bucket A or C | yes |
| `origin` | `reviewer` in read and mutate artifacts, `verifier` in verify artifacts | yes |
| `proposed_fix` | A remedy. Invalid when `claim` is empty | no |

Limiting scope on `introduced` requires the author to reproduce at the parent commit during
triage.

Per artifact: `risk`, which must equal the classifier's (an artifact whose `risk` differs
is invalid, and an invalid artifact in the expected set is FAIL); `specification_compliance` (required when a spec exists);
`unspecified_behavior_found` and `potential_unspecified_behavior`; `regression_risks`;
`test_coverage`; `not_verified`, non-empty, listing what was not checked; `confidence`
(an empty `not_verified` with confidence 100 is invalid); the result of each named
perspective; and, on a `read` artifact from the second review, a non-empty `trajectory`. A
reviewer's own overall judgement is ignored. A finding the verifier adds
(a finding in a verify artifact, with `origin: verifier`) is open and needs no record.
The prompts ask for every text value in English, whatever language the repository or the
conversation uses.

Every finding in a `read` or `mutate` artifact gets exactly one record from `verify`:
`confirmed`, `rejected_with_evidence` or `needs_human`, severity unchanged, and a `note`
string. `note` is required for `needs_human` and for `rejected_with_evidence`. A record's
`source_finding_id` is a non-empty string, and one finding has at most one record per verifier.

## Verdict

- *Expected set*: the reviewers in `r<N>/expected.txt`: every `read` and `mutate` whose
  `min_risk` is at most the classified risk, plus every `verify`.
- *Valid artifact*: schema-valid JSON whose `risk` equals the classifier's and whose
  `confidence` is 70 or more, and for `mutate` not `INVALID`. An artifact that is not valid
  is handled by running that reviewer again; the author does not edit an artifact.
- *Rejected finding*: every `verify` artifact has a record for it and all are
  `rejected_with_evidence`. A missing record, mixed records, no verifier, or a
  verifier-added finding leaves it open.
- *High-consequence finding*: bucket A or C, or severity BLOCKER. *Bucket* is the
  reviewer's `bucket_proposal`; the author's bucket is never an input.
- *Human zone*: a path matching a `human` row of `risk-zones.conf`.

The one principle: a rejection removes a finding from FAIL and from nothing else.

| Verdict | When |
|---|---|
| FAIL | An artifact of the expected set is missing or not valid; the fingerprint changed; an open finding in bucket A or of severity BLOCKER |
| HUMAN_REVIEW_REQUIRED | Not FAIL, and any of: an open C; a `needs_human` record; `unspecified_behavior_found`; a rejected high-consequence finding; a change that touches a human zone or a protected path |
| PASS | Otherwise |

Merging is a union over the expected set: every finding appears, and the merge never
alters a severity. `verdict.json` carries no severity (the artifacts and `triage.md` do), and
each finding appears in `verdict.json.findings` with its state; same-location findings are
grouped in display only.

## Buckets and scope

| Bucket | Test | Action |
|---|---|---|
| A | Breaks a declared invariant | Fix |
| B | Breaks none, but reads wrong | Record in the findings and close |
| C | The design itself is wrong | Raise to the human |

A test that lets an A through is an A. Prose is a B unless it would lead a reader to a
wrong code change; then the remedy is deletion. The author does not assign C.

- Fix only what this change introduced. A pre-existing defect is recorded even when the
  reviewer is right. If the change makes one reachable, first look for a shape that does
  not; if there is none, raise it.
- A finding that needs an artificial delay or unusual timing to occur is not pursued.
- A finding that needs input or use outside the threat model declared in `PROJECT.md`
  (`## Threat model`) is B and needs no reproduction. Both briefs carry that section; when
  it is missing or empty they say no threat model is declared.
- The committed review directory is the only record of what was decided not to be fixed.
  The optional `known_issues_file` in `PROJECT.md` takes only B and C findings a user can
  actually reach.
- Reproduce a claim before acting. Push back with the observation it predicts, not by
  argument.

Who acts on a verdict is stated in `workflow.md`, Who decides.

## Two questions

First review of a change: *which places does the diff reach that are not in the touch-point
list?* The brief lists already-filed items and asks for one `pre-existing` line each.

Later reviews: *read the fix diffs in order; does each add a branch, a state or a prediction
that the one before it also added? If so, say so: the design is being patched.* If the
answer in two reviews in a row is yes, or there are two C findings on one change, the human
reading `triage.md` decides what to do.

## Reading `triage.md`

`render-triage.sh` generates it from the JSON; reviewer prose is used only for
`trajectory`. It consists of, in order, *Trajectory* (this review's answer, every earlier
one, and the number of C findings so far), *Verdict*, *Needs a human* (only when needed),
*Findings* (with the A/B/C counts) and *Not verified*, and its last line is
`TOTAL: N findings`. Each finding shows its id and bucket, `claim`, `impact`, `evidence`, `repro` and `introduced`;
then the reviewer's and the author's bucket side by side (the author's is display only);
then `proposed_fix`, last and collapsed.

When a human is needed, `triage.md` has a section *Needs a human*, after *Verdict*, that
lists only those items. A finding appears with its `claim` (the question), `impact`, `evidence` and
the reviewer's recommendation (`proposed_fix`). An item without a finding appears with the
verification record's `note`, the artifact field that raised it
(`potential_unspecified_behavior`), or, for a human zone or a protected path, the changed
paths (the human reads the diff). The reviewers prepare the review; the human
decides. The section is shown on FAIL as well as on HUMAN_REVIEW_REQUIRED, and the author
does not decide its items. Findings the author can resolve alone are not in that section.

Read the claim first and judge whether it is a claim; a script only checks that a claim is
present and that a fix is not the only content. The session that relays results shows the
finding blocks as written and does not condense them into remedies.

## Security perspective

Name the perspectives for the change: authentication, input validation, secret handling,
path traversal, server-side request forgery, and the project's own trust boundaries. Frame
the work as defensive, verifying that a defense holds. Point the reviewer at public test
corpora and forbid working exploit strings in the report. Check the depth of what returns;
a shallow report with no reproduction is not a clean result.

## The Agent path

`review.sh --print-brief` emits the brief to paste into a request to a fresh subagent:
fixed SHA, output path and format, the terminator, the mutation instruction and the
material in priority order. The reviewer writes a Markdown report ending in
`TOTAL: N findings`. `review.sh --ingest <file>` (optional) rejects a report whose last line
is not that, records `reviewer_context: unknown`, and keeps the report as read-only
material for the human. A Markdown report has no verdict; only a JSON artifact that passes
the schema enters the Verdict table.

## Review directory

```
docs/process/reviews/<topic>/
  invariants.md      human-written; names the spec and holds revisions after approval
  decisions.md       human fields, created empty by whoever first needs it
  r<N>/              one directory per review
    expected.txt     the expected set, recorded at the start of the review
    <id>.json        one artifact per reviewer
    triage.md        generated
    fixes.txt        SHAs of the fix commits since the previous review
```

`review.sh` creates the next `r<N>` and refuses to write into an existing one, so a verdict
is computed from the artifacts of one review only. The directory is committed; it is the
record. A run in which no `read` or `mutate` reviewer of its expected set left an artifact
reviewed nothing, even when its verifier did: it stays as the record but is not an earlier
review, so the next run neither takes its fix commits from it nor becomes a later review
because of it. `decisions.md` holds `decision:` (filled only when the verdict was
HUMAN_REVIEW_REQUIRED) and the R-5 fields (see `workflow.md`); whoever first needs it
(the R-5 agent or `review.sh`) creates it with the fields empty; `review.sh` creates it
only if absent and never overwrites it. No script fills a value and no check reads them.
