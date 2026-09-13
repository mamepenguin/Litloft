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

## R-4: Triage the findings, and stop

Fix only:

| finding | action |
|---|---|
| a defect a user, operator or addon can hit | fix |
| a test that lets that defect through | fix |
| prose that would mislead a code change | delete it (or fix in one line) |
| anything else — wording, counting, where a note should live, a comment that is merely imprecise | do not fix |

A fix commit that changed behaviour gets its own review. A round that changed
only tests or prose does not. **Stop when a round reports no behaviour defect**;
prose findings never keep the loop going.

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

Findings that carry a design decision go to hako.
