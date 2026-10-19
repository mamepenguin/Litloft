# One answer for a locked drive and an unknown one

One round on the media_import change (its PR #27), recorded here because
the submodule pointer that ships it is a core commit. `invariants.md` is the
list the round was briefed with.

- **r1** on `d677015`: no invariant broken. All 20 routes that take
  `X-Lit-Drive` answered a locked drive and an unknown one differently at the
  parent, and identically at `d677015`. Odd headers, body and query drive
  mismatches, and 422s do not tell the two apart either. The test covered 5 of
  the 20 routes and never sent a non-ASCII drive through the real lookup.
  Both gaps are held in `61fad11`. An extra response header sent only for an
  unknown drive would also slip past the test; no code sends one, and that
  finding was closed as B.

Read the code for what the system does now. These files quote it as it stood
at the SHA the round reviewed.
