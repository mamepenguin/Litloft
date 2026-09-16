# Mobile file sheet — non-modal when raised, safe-area strip

Each round is a fresh reviewer on one commit. `invariants.md` is the list the
rounds were briefed with, with the user's revisions marked.

- **always-mounted-r1** on `5a5af7c6` (a discarded design): the sheet stayed
  mounted at rest with peek as a vaul snap point, so it could be dragged up.
  An always-open drawer is a Radix layer: it took every Escape on a file page
  (a keyboard trap in the note editor) and lifted itself over the keyboard for
  any focused field. The user narrowed the change to the safe area and a
  non-modal raised sheet, and the branch was restarted from develop.
- **r1** on `b1aded11`: the narrowed change. Tab still cycles inside the sheet
  (accepted; invariant 1 reworded); dialogs opened from inside the raised
  sheet landed below the screen; a pinned full-screen player sat under the
  sheet. Invariants 9–11 added.
- **r2** on `5fbfc1c3`: the dialog host was removed, which converged. Lowering
  the sheet when a player pins itself full screen was answered as patching:
  the frame is also under the header and the strip, at rest too, because of
  the sticky player's stacking level. The user had that handling taken out
  again and the full-screen stacking left for its own change, with the other
  pre-existing findings, in `known-issues.md`.

Read the code for what the system does now. These files quote it as it stood at
the SHA each round reviewed.
