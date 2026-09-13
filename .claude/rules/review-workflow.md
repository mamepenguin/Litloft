# Review workflow

How a change gets reviewed here, and how whoever reviews it is briefed. This
covers code review and security review alike.

Every change goes to an independent reviewer. The one exception is a change
simple enough that tests and error checks (type check, lint, build) finish the
verification on their own. A change that touches only prose (comments, docs,
rules) is in that exception: nobody mutates prose.

## The code is what is reviewed

The code is authoritative. Comments, docstrings, commit messages, PR bodies and
docs are not a specification the code is checked against, and a disagreement
between them is not a code defect: the prose is deleted or corrected, the code
stays. Review time goes to what a user can hit and to tests that would let it
through — not to whether the prose describes the code precisely.

## Who reviews

**A separate process that does not carry the author's context.** A fresh
subagent satisfies this; a fork of the author's session does not.

Security review uses the same brief with the perspectives named for the change
(authentication, input validation, secret handling, path traversal, SSRF, the
drive boundary in `design-decisions.md`).

Multiple PRs are reviewed one at a time — implement, review, then the next.
Two reviewers on one PR is worth it only for a large or load-bearing change.

### A later round is a fresh process, not an ignorant one

Round one asks *is this change correct?* Round two onward asks *did this fix do
what it claimed, and what did it break?* — a question **about the round before
it**. A reviewer who is not given that round re-derives it instead.

What independence buys is a reader who does not carry **the author's
assumptions**, not a reader who has been told nothing. So a later round gets the
**record** and not the reasoning:

- the invariants declared under R-0;
- every previous round's findings file;
- one line per round saying what was fixed.

Not the author's account of why. The commit message and PR body are a few lines
(`comments.md`); that is all the narrative a reviewer gets.

**Ask a later round the one question a snapshot cannot answer:**

> *Is the trajectory converging — is each round's fix smaller than the last? If
> it is not, say so.*

A fix that keeps growing is a design being patched, and only a reader who sees
across rounds can say so. Measured on #258: eight rounds each added handling or
a prediction, and no reviewer called the design wrong, because each saw one
snapshot; the ninth removed a prediction and the chain ended.

## What the reviewer is given

In priority order:

1. **The code**, at a fixed SHA (R-1).
2. **The conventions** — `CLAUDE.md` and the `.claude/rules/` files the change
   touches. Name them.
3. **The design material for this change** — the spec under
   `docs/superpowers/specs/` matching the branch topic. Its
   `## Checked, no action` section lists what was deliberately skipped.
4. **`DESIGN.md`** and the `@theme inline` block in `globals.css` for anything
   visual.
5. **hako**, only when asking whether something is a deliberate past decision.

## R-0: Declare what must not break, before the first review

The author writes, and the supervisor approves, the invariants this change must
not break — before the first reviewer is launched.

Sources, in order: the `design-decisions.md` rules the change touches; what the
work is for; and the data that cannot be regenerated from the filesystem (watch
history, tags, comments, transcripts).

Each item is written so that a mutation can violate it — an observable sentence,
not an intention. *"A thumbnail failure leaves the file's row and bytes
untouched"*, not *"handle thumbnail errors properly"*. Five to ten lines; longer
means the change is doing more than one thing.

The list is the reviewer's first perspective: *does any path break these?* Ask
*"is anything missing from this list?"* in the first round only — asked every
round, it grows without end.

## R-1: Review a fixed SHA, and do not move the tree under the reviewer

- Write the SHA in the brief: "review `<sha>`, **not** `develop...HEAD`".
- **No push and no edit to that repository until the report is in.**
- Another repository (core ↔ addon) may be worked on in parallel.
- If a push is unavoidable, tell the reviewer the SHA changed.

## R-2: The terminator lives in the artefact

Have the reviewer write findings to a file whose **last line is
`TOTAL: N findings`**. A file without it is not finished. Tell the reviewer to
write incrementally. If a report arrives truncated, re-launch a reviewer scoped
to the missing part.

## R-3: Mutate the behaviour; do not just read the code

The instruction is not "read the code and find defects". It is: **break the
implementation one change at a time and see whether a test fails.** Targets are
branches, conditions, guards, ordering, error paths and the values a test
asserts on. Declare the expectation before each mutation (`want=kill` /
`want=live`); the goal is to know which survivors were meant to survive, not
to kill all of them.

**Prose is not a mutation target.** Do not mutate or audit comments,
docstrings, commit messages, PR bodies or docs for precision. Report prose only
when it would lead a reader to a wrong code change (it states the opposite of
what the code does, or tells someone to do something that breaks), and suggest
deleting it rather than rewording it.

The reviewer restores the tree and fixes nothing.

## R-4: Triage against the declared invariants, and stop

Every finding lands in exactly one bucket:

| bucket | test | action |
|---|---|---|
| **A** | breaks an invariant declared under R-0 | fix |
| **B** | breaks none, but reads wrong | record in the ledger, close |
| **C** | the design itself is wrong | count it |

A test that lets an A through is an A. Prose is a B unless it would lead a
reader to a wrong code change, and then the remedy is deletion.

**A fix that is not smaller than the one before it is a C.** In a converging
loop each round's fix shrinks. A round that adds handling, state or a prediction
where the last one did is patching a symptom, and the round after it finds what
the addition broke. Compare the two diffs before triaging: the trajectory is
evidence no single finding carries.

**Two or more C findings on one change is evidence to discard the branch**, not
to keep fixing. Raise it; do not decide it alone.

**Fix only what this change introduced.** A pre-existing defect goes to the
ledger even when the reviewer is right about it. Where the change makes a
pre-existing defect reachable, first look for a shape that does not make it
reachable; if there is none, raise it rather than starting to excavate.

**Make the reviewer label it.** Every finding carries `[introduced]` or
`[pre-existing]`, and `[introduced]` is earned by running the same reproduction
against the parent commit and against `develop` and showing the difference.
Without the label the triage is the author's guess about their own change, which
is the guess least worth trusting. Name the already-filed items in the brief and
ask for one `[pre-existing]` line each rather than a re-derivation.

**Findings existing is not a reason to run another round.** The reviewer
supplies the material for the triage and has no say in what happens next. The
author proposes a triage and stops. **Only the supervisor or the user decides to
continue, to ship, or to discard.**

Stop when bucket A is empty. A fix commit that changed behaviour gets its own
review; one that changed only tests or prose does not.

A finding is a claim: reproduce it before acting, and push back with the
observation it predicts rather than by argument.

Layout, spacing and overflow need a named instruction to measure in a real
browser. jsdom being green is not evidence about any of them.

## Detector rules

A "detector" is a test that enumerates something and asserts the count.

1. **Never `>=` in an enumerating assertion — use `toBe(N)`.** A lower bound
   stays green when the scan misses something new. `toBeGreaterThan(0)` and
   friends are the same rule.
2. **A parity test must run both sides through different implementations.**
   Reading the same table twice is not parity.
3. **Wait for the thing you assert on, not for the request that starts it.**
4. **A detector that reads source as text must not match comments**, and is the
   last resort: prefer a test that renders or calls the code. A detector that
   passes because a comment contains the needle holds nothing.
5. **Never build the expected value out of the observation.** A derived
   expectation cannot catch a deletion — the removed element leaves both sides
   at once. Declare the expected set. Pick the dimensions the thing actually
   has, not the one where the claim survives.
6. **A submodule pointer bump is an edit to every `file:line` citation into it.**
   Not writing line numbers in comments is the cheaper prevention.

## What a test here cannot hold

- **Matching the text of a stylesheet cannot verify a layout property.**
- **jsdom lays nothing out.** Width, overflow, stickiness and transitions are
  not reachable.
- **A detector CI does not run is not a detector.**

For layout, `frontend/e2e-layout/` measures real boxes against a static fixture
in CI. Otherwise narrow what the test asserts; do not add prose explaining the
limit to the test file.

## Waiting

A finished agent will not wake you, and neither will CI — block inside the turn:

```bash
until gh pr checks <PR> 2>&1 | grep -qE "pass|fail"; do sleep 20; done
until ! gh pr checks <PR> 2>&1 | grep -q pending; do sleep 30; done
```

## After the review

Findings that carry a design decision go to hako. Bucket B and C findings that
were not acted on go to `docs/developer-guide/known-issues.md` before the PR
merges: a finding that is neither fixed nor recorded has been discarded.
