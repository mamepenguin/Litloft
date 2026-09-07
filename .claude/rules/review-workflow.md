# Review workflow

How a change gets reviewed here, and how whoever reviews it is briefed. This
covers code review and security review alike.

Every change goes to an independent reviewer. The one exception is a change
simple enough that tests and error checks (type check, lint, build) finish the
verification on their own.

## Who reviews

**A separate process that does not carry the author's context.** What buys the
finding is not a different model — it is a reader who has not spent the last hour
reasoning about this change and cannot inherit the assumption that produced the
defect. A fresh subagent satisfies this; a fork of the author's session does not.

The same shape covers security review: same brief, same terminator, with the
perspectives named for the change (authentication, input validation, secret
handling, path traversal, SSRF, the drive boundary in
`design-decisions.md`). Do not route security to a separate workflow.

Multiple PRs are reviewed one at a time — implement, review, then the next.
There is no such thing as a catch-up review over several merged units.
Two reviewers on one PR is worth it for a large or load-bearing change: each
finds a different class (measured: one found the counting unit, the other found
orphaned keys and warnings it had introduced itself).

## What the reviewer is given

The author assembles this; the reviewer inherits nothing. In priority order:

1. **The code**, at a fixed SHA (R-1).
2. **The conventions** — `CLAUDE.md` and the `.claude/rules/` files the change
   touches. Name them; do not assume they are read.
3. **The design material for this change** — the spec under
   `docs/superpowers/specs/` matching the branch topic, and `git log`. A spec is
   authoritative *while its branch is open*; `CLAUDE.md`'s "verify behaviour
   against the code, never against a spec" is aimed at readers after the merge.
   Its `## Checked, no action` section is what the author considered and
   deliberately skipped — it removes false positives directly.
4. **`DESIGN.md`** and the `@theme inline` block in `globals.css` for anything
   visual.
5. **hako**, only when asking whether something is a deliberate past decision.
   It is context, not authority: where it disagrees with the code, the code is
   what is real.

Cutting 2-4 to save tokens turns an independent review into "someone who does
not know what correct looks like, reading a diff".

## R-1: Review a fixed SHA, and do not move the tree under the reviewer

- Write the SHA in the brief: "review `<sha>`, **not** `develop...HEAD`". A
  symbolic range means something different each time it is resolved.
- **No push and no edit to that repository until the report is in.** The
  gitignored files under `docs/` count.
- Another repository (core ↔ addon) may be worked on in parallel.
- If a push is unavoidable, tell the reviewer the SHA changed.

A reviewer reading a moving target reports defects that do not exist, and the
author cannot tell those from the real ones. It has happened, and the false
report was escalated as a tool bug before being measured.

## R-2: The terminator lives in the artefact

Have the reviewer write findings to a file, and require **the last line of that
file to be `TOTAL: N findings`**. Read it in this order:

1. If the file does not end with `TOTAL:`, it is **not finished** — do not read it.
2. If it does, count the `##` findings in the file and check they equal N.
3. A `written: <path>, N findings` line in the reply is a convenience for
   noticing early. It is never the basis for calling the review complete.

Splitting the artefact from the count across two channels is the error: if the
channel is unreliable, so is the count it carries. Neither the file existing nor
its size holding still means the review ended.

Also tell the reviewer to **write incrementally** (a reviewer that dies at a
limit otherwise loses everything) and to keep each part under ~400 words. If a
report arrives truncated, name the missing heading and ask for that alone — an
agent that has already finished will not answer, so re-launch a reviewer scoped
to the missing part instead of waiting.

## R-3: Mutate the claims; do not just read the code

The instruction is **not** "read the code and find defects". It is: **take every
claim this PR makes in prose and break it, one at a time, to see whether anything
fails.** The claims live in the commit message, the PR body, comments, docstrings,
new paragraphs in `DESIGN.md`, type annotations, and the stated reasons for *not*
doing something.

Declare the expectation before running each mutation (`want=kill` / `want=live`)
and compare against the result. The goal is not to kill every mutation — over-tight
tests obstruct change — but to know which survivors were meant to survive.

The reviewer restores the tree and fixes nothing.

**Author self-mutation does not substitute for this.** Measured across four PRs,
authors who mutated their own change to zero survivors were followed by
independent review that ran 57-79 mutations and left 24-38 alive, including
already-shipped bugs. Killing your own mutations proves you tested what you
thought of.

## R-4: The fix commit gets its own review

Findings are addressed, then the fix commit is reviewed on its own. Every round
in which this was done produced a defect *inside the previous round's fix*: one
PR went 63 mutations / 29 survivors → 30 / 9 → 16 / 1, where round 2's defect was
created by round 1's fix and round 3's by round 2's.

A merged PR is not closed either: a report that arrived after the merge has found
shipped defects. Read the tail of a truncated report even when the branch is gone.

## R-5: Measure the reviewer's findings too

A finding is a claim, and R-3 applies to it. Reproduce it before acting. When
pushing back, take the observation the finding predicts and show it — do not
argue from reading. Verify numeric claims against `git show <sha>:<path>` rather
than a diff, and re-fetch any diff that announced it was truncated.

Ask the reviewer for a judgement, not only for objections: putting a fork in the
road to them ("split the type or grep for it?") has improved the decision.

Layout, spacing and overflow need a named instruction to measure in a real
browser. jsdom being green is not evidence about any of them.

## Detector rules

A "detector" is a test that enumerates something and asserts the count. All six
apply to writing one and to reviewing one:

1. **Never `>=` in an enumerating assertion — use `toBe(N)`.** A lower bound
   stays green when the scan fails to pick up something new, which is the exact
   failure the detector exists to catch. **This applies to the measured scope as
   well**: shrinking the population without moving the expected count is not
   shrinking it.
2. **A parity test must run both sides through different implementations.**
   Reading the same table twice is not parity. Write the limit into the test.
3. **Wait for the thing you assert on, not for the request that starts it.**
4. **Anything claiming "this does X now" is unverified until X being false breaks
   something.** Prose, edits, and implementation code all count.
5. **Never build the expected value out of the observation.** Deriving expectations
   from observed keys catches wrong values and unregistered additions, but
   **cannot catch a deletion** — the removed element leaves both sides at once.
   Declare the expected set per state. (Measured: deleting either copy of the
   name field left 4616 tests green.)
6. **A submodule pointer bump is an edit to every citation that points inside it.**
   Grep for `file:line` references into the submodule when bumping. Not writing
   line numbers in comments is the cheaper prevention.

Three recurring shapes that are not rules but show up at the same rate:

- **When replacing rotten prose, verify the replacement.** A docstring rewritten
  to describe a removed mechanism was itself false in both of its new claims.
- **When extracting a shared recipe, include the callers you are fixing.** Grep by
  *role* ("everything that is a menu surface"), not by directory — twice, the
  file that already held the correct value was left out and the broken one kept.
- **Adding a reporting path means counting the silent ones.** A change that
  introduced a toast wired it into one of three failure paths and left two
  `catch { /* non-critical */ }` in place.

## Waiting

Before ending a turn, ask whether the thing being waited on will actually wake
you. A finished agent will not. Neither will CI — block inside the turn:

```bash
# checks are not registered immediately after a push
until gh pr checks <PR> 2>&1 | grep -qE "pass|fail"; do sleep 20; done
until ! gh pr checks <PR> 2>&1 | grep -q pending; do sleep 30; done
```

## After the review

Findings that carry a design decision go to hako. Report the review as closed
only when every finding can be listed with what happened to it.
