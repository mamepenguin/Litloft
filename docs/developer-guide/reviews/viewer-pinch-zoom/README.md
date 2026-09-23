# Pinch zoom and pan in the image and archive viewers

Each round is a fresh reviewer on one commit. `invariants.md` is the list the
rounds were briefed with, including the revision after r1.

- **r1** on `3f21bbcf`: the folder gallery mounts closed, so its wheel
  listener was never attached and ctrl+wheel zoomed the page (F1). Reopening
  and a face changing shape kept the zoom (F2, F3; the invariants gained
  "opens at fit" and "a new face shape returns to fit"). The clamp and the
  content measurement were held by nothing (F4).
- **`bc010658`** attached the listeners when the frame appears, widened
  `resetKey`, added the missing cases, and added desktop Safari's WebKit
  gesture events (the user then confirmed them on a Mac).
- **r2** on `bc010658`: a trackpad pinch in progress carried across a change
  of picture (F1); the gesture handler and the gallery's face-kind reset were
  untested.
- **`2b11944b`** cleared the trackpad pinch on reset and added the tests.
- **r3** on `2b11944b`: asked the trajectory question, answered yes by the
  letter — each round grew the reset's hand-kept list of refs to clear. The
  user chose the reviewer's shape: one gesture object the reset replaces.
- **`0e8d0756`** is that shape, plus two test gaps from r3.
- **r4** on `0e8d0756`: behaviour-preserving; the round removed state rather
  than adding it. One test gap (a press across a reset) closed by a test-only
  commit. `resetKey` is still a hand-written list in each viewer; a later
  round that adds to it is the pattern returning.
