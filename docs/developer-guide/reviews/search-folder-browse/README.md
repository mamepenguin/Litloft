# Review record: search modal folder browse

Invariants: [invariants.md](invariants.md).

## r1 (`2365027f6`) — [r1.md](r1.md)

No invariant break a user can reach. Triage, decided by the user:

| Finding | Bucket | Action |
|---|---|---|
| F1 a / typed mid-composition started browsing | fixed | ignored while composing (`be63ea940`) |
| F2 › left focus on body | fixed | entering a folder refocuses the field (`be63ea940`) |
| F3 the history test could never fail | B (test) | the test types a filter first (`be63ea940`) |
| F4–F10 correct code without a test, or unmeasured platform notes | B | closed without tests |

## r2 (fix `be63ea940`) — [r2.md](r2.md)

Trajectory answer: the fix added a branch and a prediction ("a composing input is never the /
trigger"), and repairing its side effect would have added a state. Decided by the user, in the
direction that removes:

| Finding | Action |
|---|---|
| F1 a / typed through an IME never starts browsing | kept; documented that / works only when typed directly, → and › cover IME users |
| F2 refocusing on › raises the on-screen keyboard | the refocus removed (`3632bdf97`); an iPad with a keyboard loses focus after ›, tap the field |
| F3 no phone test for the refocus | moot |
| F4 stale test title and unused value | deleted (`3632bdf97`) |

## r3 (fix `3632bdf97`) — [r3.md](r3.md)

The fix did what it claimed; no invariant broken. Trajectory: this round removes (the refocus and
its test) and documents the IME limit instead of adding state. One pre-existing finding: the
chip's ‹ still refocuses the field, raising the on-screen keyboard on phones.

## r4 (fix `e03d75d67`) — [r4.md](r4.md)

The chip's ‹ no longer refocuses, matching ›. Trajectory: two rounds in a row remove; converged.
One B: on desktop, ‹ from a first-level folder removes the focused button, leaving focus on the
page until the field is clicked — the same trade the user accepted for ›.
