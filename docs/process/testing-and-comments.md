# Testing and comments

## Which tests stay

A test written during a change does one of two jobs, and only one outlives the change.

| | Checks the change | Guards a property |
|---|---|---|
| Question | Did this change land as intended? | Does this still hold? |
| Bound to | This diff: call order, an internal branch, an intermediate state | Observable behavior, an invariant |
| Lifetime | Until the change merges | As long as the property is kept |
| Under a refactor that keeps behavior | Fails | Passes |

A test that fails under a behavior-preserving refactor is a change check that was kept.
That coupling is the cost, not the number of tests.

## What stays

- A test that holds an invariant declared in the change's spec, as revised. That list is
  the candidate list for the permanent suite.
- A regression row for a bug likely to recur, written as "this input still satisfies the
  invariant", not as a replay of the fix.

## Before writing a test

Look for an existing table first. Most bug fixes are an input on which an existing
invariant did not hold; that is one more row in an existing parametrized test, not a new
test function. A new function is for a new property.

## RED then GREEN

Every test goes through RED then GREEN: write it, watch it fail for the right reason,
then make it pass. A test that has never failed has not shown it can.

## After GREEN

Ask: if this test is deleted, which mutation survives? If no mutation is killed by this
test alone, delete it or fold its case into the test that already holds the property.

## Layout and overflow need the real environment

Matching text cannot verify a layout property, and a simulation that lays nothing out
cannot either. Measure in the real running environment, or narrow what the test asserts.
Do not add prose explaining the limit.

## Whether the change did what it was for

No test holds that. For a change that alters what a user can observe, see R-5 in
`workflow.md`.

## Comments

Anyone who needs to know what the code does reads the code. Prose that restates it is a
second copy that nothing keeps in step; when a comment, docstring or other prose
disagrees with the code, the code wins and the prose is deleted. The default is no
comment.

### What a comment may contain

Only what a reader could get wrong after reading the code:

- where a magic number came from, when it cannot be derived;
- why an obvious alternative was not taken, where someone would otherwise change it back;
- a trap: something that breaks if touched, where the breakage is not local;
- an invariant the code relies on but cannot express.

One or two sentences. A paragraph means the comment is a document or restates the code.

### What a comment does not contain

- What the code does.
- History: what the code used to do, where it moved from, why a change was made.
- References to the process: spec section numbers, finding ids, acceptance ids.
- Descriptions of other files: which test covers this, what the neighboring component does.
- Measurements: timings, counts, sizes observed once.

### A wrong comment

Delete it. Replace it only with one of the kinds above, in a sentence checked against
the code. Reviewers do not audit prose for precision; they report prose only when it
would lead a reader to a wrong code change, and the remedy is deletion.

### A test's name and comments

The name says what behavior is held. A comment in a test is allowed for the same reasons
as in code, mainly a setup choice that looks wrong but is deliberate. It does not explain
which mutation the test kills or what an earlier version got wrong.

## Commit messages and pull request bodies

A few lines: what changed and why. A pull request body adds how it was verified. Neither
narrates the investigation, restates the diff, or lists acceptance criteria at length.
