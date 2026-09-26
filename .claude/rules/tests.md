# Which tests stay

A test written during a change does one of two jobs, and only one of them
outlives the change.

| | Checks the change | Guards a property |
|---|---|---|
| Question | Did this change land as intended? | Does this still hold? |
| Bound to | This diff: call order, an internal branch, an intermediate state | Observable behaviour, an invariant |
| Lifetime | Until the change merges | As long as the property is the specification |
| Under a refactor that keeps behaviour | Fails | Passes |

Both go through RED → GREEN: a test that has never failed has not shown it can.
The difference is what happens after GREEN.

**A test that fails under a behaviour-preserving refactor is a change check that
was kept.** That coupling is the cost, not the count.

## Before writing a new test

Look for an existing table first. Most bug fixes are an input on which an
existing invariant did not hold; that is one more row in an existing
parametrized test, not a new test function. A new test function is for a new
property.

## After GREEN

Ask: **if this test is deleted, which mutation survives?** (`review-workflow.md`
R-3.) If no mutation is killed by this test alone, it has done its job — delete
it, or fold its case into the test that already holds the property.

## What stays

- A test that holds an invariant declared under R-0. The R-0 list is the
  candidate list for the permanent suite.
- A regression case for a bug likely to recur, written as "this input still
  satisfies the invariant" — a row, not a replay of the fix.

Whether the change did what it was for is not held by a test. That is R-5:
use the running application.
