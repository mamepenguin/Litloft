# PR #309 — compact folder rows in list mode

Four rounds, each a fresh reviewer on one commit. `invariants.md` is the list
they were briefed with.

- **r1** on `b48be52e` (rebased to `a1c77a61`): the original change. Test gaps,
  plus the breakdown squeezing the folder name — the user added invariant 7 for
  it.
- **r2** on the first fix: the fix held, but the squeezed breakdown still took
  the row's gap, and the tests ran on one pointer only.
- **r3** on the second fix: no invariant broken, and the trajectory answer was
  that the design was being patched — two rounds in a row adding predictions to
  the same block, and two class tokens whose only job was cancelling side
  effects of the round before.
- **r4** on the removal: the user chose to take the breakdown out of the row.
  Bucket A empty, and the loop read as converged — the round removed a branch,
  a state, a file and ten checks, and added nothing.

Read the code for what the system does now. These files quote it as it stood at
the SHA each round reviewed.
