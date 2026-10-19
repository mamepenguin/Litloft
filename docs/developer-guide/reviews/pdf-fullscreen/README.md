# Full-screen PDF viewer

Each round is a fresh reviewer on one commit (core, plus the knowledge addon
where it changed). `invariants.md` is the list the rounds were briefed with,
including the revision after r1.

- **r1** on core `3f1e6284` + knowledge `ceb4ea1`: a mouse double-click on a
  word near an edge turned the page twice (F4); the file arrows could outrank
  the viewer's (F9); in-document links went nowhere (F6); a refused page drew
  nothing (F7); the quote button was a white tile on the black bar (F5).
- **`a0b5df5a` / `8c6edf8`**: the mouse is left to select text
  (`mouseSelectsText`), the viewer's keys at overlay priority, `onItemClick`,
  per-viewer render failure, `tone: "on-dark"` for the slot.
- **r2** on those: test gaps, a pair's failure cleared by the other page, and
  a trackpad on a tablet with no way to bring the bar back (G8).
- **`70297dd5`**: failure per page, one "go to page", and a mouse click
  showing the bar.
- **r3** on `70297dd5`: that click put the bar under the second click of a
  double-click and closed the viewer (H1); the arrows sat under the text layer
  (H2). Asked the trajectory question: two rounds in a row added a mouse-only
  branch. The user took it as a C and chose the removing shape.
- **`2f2d0136`**: the click branch removed, the arrows lifted, and the chrome
  shown on any pointer move that is not a finger, on every device (the
  coarse/fine switch removed).
- **r4** on `2f2d0136`: converging on the mouse. A drifting double-click (J1)
  and a no-hover pen tap (J2) accepted as costs; tests and two stale comments
  closed by `c51d6908` (tests and prose only, so no further round).
