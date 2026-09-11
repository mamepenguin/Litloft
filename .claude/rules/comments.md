# Comments

What goes in a comment and what does not. This governs source comments, workflow
files, scripts and test docstrings alike.

## The code is the most accurate statement of what is true now

**Do not describe state.** Anything that must be updated when the code is updated
eventually will not be, and nothing will notice.

The failure is not that a comment goes wrong. It is that **a reader who reads the
prose and stops has understood something false, and believes they have
understood.** That is worse than no comment at all: without it they would have
read the code. Prose that saves someone from reading the code is doing harm, not
work.

So the test is not "is this true today". It is **"will this still be true after
the next change, without anyone thinking about it?"** If the answer is no, do not
write it.

**The further away the subject, the faster it rots.** Nearly every rotted comment
found here described something in another file, another package, or another
repository: the shape of a link tree built by a script elsewhere, a sibling
addon's configuration, another repository's coverage floor. A claim about the
lines directly beneath it is checked by everyone who edits them. A claim about a
file nothing here builds or tests is checked by nobody, and no CI can fail on it
— the claim is unfalsifiable from where it lives. Prefer to state the local rule
and let the other place state its own.

## What may be written

**Only what a reader could get wrong after reading the code.** A comment earns its
place by closing a gap the code cannot close:

- where a magic number came from, when it is not derivable;
- why an obvious-looking alternative was not taken, where someone would otherwise
  "fix" it back;
- a trap: something that breaks if touched, where the breakage is not local;
- an invariant the code relies on but cannot express.

All of these are **why**, and why does not rot when the code changes — or if it
does, the change was a decision someone made on purpose.

## Three kinds of claim, three different failures

Measured over this repository's review rounds. The kinds fail differently, so
they need different defences, and treating them as one problem misses two of
them:

| kind | how it fails | defence |
|---|---|---|
| **state** — "X is a symlink", "coverage is gated per package" | **rots**: true when written, falsified later by a change somewhere else, silently | do not write it |
| **measurement** — a timing, a percentage, a count | a snapshot read forever as a general claim; also frequently wrong *when written*, because the method was wrong | put it where snapshots belong (below) |
| **mechanism** — "node-glob does not descend a symlinked directory" | does **not** rot — but it is not self-verifying, and one shipped here that was false from the first day | measure it, in the source of the thing it describes, before writing it |

The third row is the one that surprised us. "Prefer mechanism to state" is right
and is the rule above, but mechanism is not safe merely for being mechanism: a
claim about how a library behaves has to be read out of that library, not
reasoned to. Replacement prose written to correct a false comment has itself been
false in four consecutive rounds of one change.

## What goes elsewhere

| Kind | Where | Why there |
|---|---|---|
| Fixed knowledge someone needs and cannot derive | `docs/` | Read on purpose, maintained on purpose |
| Numbers, measurements, timings | the PR body | Dated, never re-verified, and nobody mistakes it for current |
| Why a past decision was made | commit message, hako | Attached to the change, not to the file |
| The design of work in progress | `docs/superpowers/specs/` | Dies at the merge, by design |

## Length is a symptom

Long prose in a source file is usually a specification that has escaped its
document: maintained by nobody, read instead of the code, duplicated from
something already written down. This repository's worst concentration of rotted
comments was its most heavily commented file, and that is not a coincidence — the
comments were long enough to be believed and too many to re-read.

If a passage is long enough to be a document, make it one and link to it.

## When you correct one

Read the whole file. A false statement has had a twin elsewhere in the same file
every time it was looked for — once 171 lines apart, in a file being edited for
exactly that reason. Grep finds the spelling; it does not find the claim.

And **measure the replacement before writing it**, per the table above.
