# Phone player pinned for pseudo-fullscreen, above the page

`invariants.md` is the list the round was briefed with, with the user's
additions marked.

- **r1** on `95e6ac97`: the fix held. Two test gaps let an invariant break
  unseen — the native-fullscreen test never entered native fullscreen, and the
  layout fixture skipped a box between the player and the shell — and were
  closed in the next commit, which changed only tests and prose. A dialog
  opened by keyboard while a player is pinned opens under it; the user
  accepted that and it is in `known-issues.md`.

Read the code for what the system does now. These files quote it as it stood at
the SHA the round reviewed.
