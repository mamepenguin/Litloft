# Full-screen viewers take the keyboard

Each round is a fresh reviewer on one commit. `invariants.md` is the list the
rounds were briefed with, including the proposed revision after r1.

- **r1** on `5e148791`: the cheat sheet still listed search under a viewer,
  because it added the global section back from the unfiltered stack (F1);
  nothing held that a closed gallery blocks nothing (F2); the interval panel
  outranks the viewers by push order only (F3, B); the phone player's pinned
  frame does not block (F4, out of scope).
- **`09588685`** took the sheet's sections from the reachable list, added the
  closed-gallery test, and moved the over-frame panel a tier up for F3.
- **r2** on `09588685`: the tier move put the video player's settings panel
  above search and the quick note opened over it, so Escape closed the hidden
  panel first — a prediction that did not hold. The reviewer's answer to the
  trajectory question: revert it rather than add a per-caller tier.
- **`2a11b171`** is that revert plus the cheat-sheet cases r2 found missing; the
  panel file is back to what r1 reviewed and the rest is tests, so no further
  round. F3 stays recorded here.
