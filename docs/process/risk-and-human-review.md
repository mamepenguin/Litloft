# Risk and human review

Every change is classified before review. The level selects how deep the automated review
goes (`min_risk` in `reviewers.conf`). Classification is done by code (`classify-risk`),
from rows in the project's `process/risk-zones.conf`. Risk does not decide whether a human
is needed; see "What needs a human" below.

## Risk is set by area, not by size

A five-line change in an authentication area is riskier than five hundred lines of
layout. Size contributes to the score but cannot make a dangerous area safe: the
promotions below exist to cancel the intuition that a small change is a safe one.

## Levels

`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, in increasing order.

## The score

```
score = base + highest zone + number of modifiers
```

- **base** and the score-to-level thresholds are set in the template of `risk-zones.conf`.
- **highest zone**: every changed path is mapped to a zone and the highest one counts.
  One file in a dangerous place makes the change dangerous.
- **modifiers**: each modifier that matches adds one. A modifier is a pattern for a
  nature of change (concurrency, persistence, schema, public interface, dependencies, and
  so on) and is matched against the added and removed lines.
- **not scored**: paths under `docs/process/reviews/` (the review record, `invariants.md`
  included) and `.process/runs/` add no lines, take no zone, match no modifier and do not
  count toward docs-only. Risk describes the change, not its review. They are still
  checked against the protected set and the human rows.
- **promotions**: after scoring, a promotion row raises the level to a minimum when a
  named set of modifiers is present together, whatever the score was.

## Paths that match no zone

`default_zone` covers a path that matches no zone glob. Its default is MEDIUM and it is
never LOW: an unknown place is not assumed to be safe. A project may set it higher.

## An unreadable diff fails

If the classifier cannot read the diff it exits non-zero. It never reports a level for
input it could not see.

## Rows in `risk-zones.conf`

| Row | Columns | Meaning |
|---|---|---|
| `zone` | `glob level` | Paths matching the glob belong to a zone of that level |
| `modifier` | `regex name` | A line, added or removed, that matches adds one to the score |
| `promote` | `modifier-set level` | When all modifiers in the set are present, the level is at least this |
| `human` | `glob` | Paths matching the glob form a *human zone* |

Globs are gitignore-style: `*` does not cross `/`, `**` does. The file starts with a
`# process-kit schema_version: N` line. A default that changes risk, such as
`default_zone`, changes only in a major version of the kit.

## Protected paths

Protected paths are computed at run time from the tree of the head commit:
`.process-kit.lock`, every path listed in the lock, and everything under `process/` (the
conf files, `protected-paths.conf` and `secret-allowlist.txt`). The kit-owned process documents,
agents, commands and rules are in the lock's list.

Outside the set: everything under `docs/process/reviews/` (review outputs and
`invariants.md`), and the project-owned `PROJECT.md` and `EXCEPTIONS.md`. `CLAUDE.md` is a suggested row in the
template of `protected-paths.conf`; the project decides whether to protect it.

**A change to a protected path is CRITICAL**, and the docs-only skip does not apply.
Removing an entry from the lock changes the lock, so it is CRITICAL too. An agent that
implements a change edits a protected path only when the approved spec names it;
otherwise it stops and asks. If a protected path was changed without the approved spec
naming it, the human sees the hunks and decides continue or discard, and may approve it
afterwards; there is no separate check. `install.sh` and `update.sh`, which a human runs, are not
subject to that rule.

## What needs a human

What needs a human is a kind of question, not a risk level. Bugs and broken preconditions
are found by the reviewers and fixed by the author (bucket A); risk selects only how deep
the automated review goes. A human is needed for:

- a design judgment (an open C, a `needs_human` record, `unspecified_behavior_found`);
- a disagreement between reviewers (a rejected high-consequence finding);
- a change to a human zone;
- a change to a protected path.

In a human zone the human reads the diff; for a design judgment the human reads the
question in the *Needs a human* section of `triage.md` (see `review.md`). A human zone is
an area where a failure is not allowed or where reviewers are known to miss errors, for
example authentication, data migration, billing. A project that wants no human code review
declares no `human` rows; a design judgment and a change to a protected path still need a
human, because they are decisions about the design and the process, not code review.

Classified risk alone never makes a verdict HUMAN_REVIEW_REQUIRED.

## The label and the gate

CI applies the label `human-review-required` exactly when the verdict is
HUMAN_REVIEW_REQUIRED, with a comment carrying the *Needs a human* section of `triage.md`.
The label does not block a merge. The gate is the platform's: branch protection that
requires a review by someone other than the author on labelled pull requests. The kit
documents this and does not configure it. See `limitations.md`.
