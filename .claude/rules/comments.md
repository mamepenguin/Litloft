# Comments

What goes in a comment, a docstring, a commit message and a PR body. This
governs source files, tests, workflow files and scripts alike.

## The code is the specification

Anyone who needs to know what the code does reads the code. Prose that restates
it is a second copy that has to be kept in step, and nothing keeps it in step.
When the two disagree, the prose is wrong by definition — delete it.

The default is **no comment**. Most functions need none.

## What may be written

Only what a reader could get wrong **after reading the code**:

- where a magic number came from, when it is not derivable;
- why an obvious-looking alternative was not taken, where someone would otherwise
  "fix" it back;
- a trap: something that breaks if touched, where the breakage is not local;
- an invariant the code relies on but cannot express.

One or two sentences. If it needs a paragraph, it is probably a document or it
is restating the code.

## What is not written

- **What the code does.** Names, types and the code itself say it.
- **History.** "Previously…", "moved from…", "the old X", "round 2", why this PR
  changed it. That is the commit message.
- **References to the process.** Spec section numbers, arbitration numbers,
  acceptance-criteria ids, review findings.
- **Descriptions of other files.** Which test covers this, what the component
  next door does, how another repository is built. Nobody checks those, and
  they rot first.
- **Measurements.** Timings, counts, pixel widths observed at one size. Those go
  in the PR body.

## Tests

The test name says what behaviour is held. A docstring or comment in a test is
allowed for the same reasons as above — mainly a setup choice that looks wrong
but is deliberate. It does not explain which mutation the test kills, what an
earlier version of the test got wrong, or the limits of jsdom.

## Commit messages and PR bodies

Say what changed and why, in a few lines. A PR body adds how it was verified.
Do not narrate the investigation, restate the diff, or enumerate acceptance
criteria at length. Neither is reviewed for precision (see
`review-workflow.md` R-3).

## When a comment is found to be wrong

Delete it. Replace it only if it is one of the kinds allowed above, and then
with a sentence you have checked against the code.

## Finding the ones that are already wrong

`scripts/jev-lint.sh` reads the changed lines and asks a model whether each
comment, docstring, name, error message and test title still matches the code
under it. It is the only check here that can answer that; eslint, ruff and tsc
cannot. Run it on a branch that added or edited prose, before sending the change
to review:

```bash
scripts/jev-lint.sh                      # the diff against origin/develop
scripts/jev-lint.sh check backend/app    # a whole tree
scripts/jev-lint.sh check backend/app --dry-run   # what it would ask, and the price
```

It needs `TYPESAFE_API_KEY`, its answers move between runs, and no merge is
gated on it. Treat a finding as a claim, the same as a reviewer's: read the code
it points at, and if the prose is wrong, delete it. `.jev-lint.yaml` says which
rules are on and why the rest are not.
