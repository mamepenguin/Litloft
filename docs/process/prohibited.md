# Prohibited

## Never make a check pass by weakening it

When a test or gate fails, change the code. The following destroy the ability to detect
the problem and are never a fix:

| Action | Examples |
|---|---|
| Delete a test | Remove a test that does not pass |
| Skip a test | Skip markers, commenting it out |
| Weaken an assertion | Rewrite the expected value to the actual value; replace an equality check with a non-null check |
| Loosen static analysis | Add a lint disable, add a rule to the disabled list, raise a threshold |
| Bypass a gate | `--no-verify`, environment switches that skip a gate |
| Hollow out the secret scan | Add an allowance without a technical reason; remove a pattern |
| Lower a bar | Reduce a coverage target or a pass-rate threshold |

If the failure looks like a false alarm, do not fix the check. Escalate under
`escalation.md`.

The agent that did any of these reverts it and reports. A push made with `--no-verify`
cannot be reverted, so it is recorded in `docs/process/EXCEPTIONS.md` and reported.

## Protected paths

The set of protected paths, and the rule for editing one, are in
`risk-and-human-review.md`, Protected paths.

## Detector rules

A detector is a test that enumerates something and asserts the count.

1. **Never use `>=` or any lower bound in an enumerating assertion; assert the exact
   count.** A lower bound stays green when the scan misses something new. Where the set
   is meant to grow, the test is updated in the change that grows it; that edit is the
   point.
2. **A parity test runs both sides through different implementations.** Reading the same
   table twice is not parity.
3. **Wait for the thing you assert on, not for the request that starts it.**
4. **A detector that reads source as text must not match comments.** It is the last
   resort; prefer a test that runs or renders the code. A detector that passes because a
   comment contains the needle holds nothing.
5. **Never build the expected value out of the observation.** A derived expectation
   cannot catch a deletion, because the removed element leaves both sides at once. Declare
   the expected set, and pick the dimensions the thing actually has.
6. **A detector the CI does not run is not a detector.**
