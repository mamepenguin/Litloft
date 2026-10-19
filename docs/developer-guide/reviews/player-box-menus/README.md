# Toolbar menus opened from inside the player box

Each round is a fresh reviewer on one commit. `invariants.md` is the list the
rounds were briefed with, including the revision after r1.

- **r1** on `fc3f0e7d`: every toolbar menu was portalled on phones. That took
  the knowledge editor's menu rows out of their container query, so rows on
  the bar showed again in the menu (F2), and five mutations of the
  breakpoint, the fallback and the strip's variable survived (F4). Tab into
  the menu (F1) and focus across a 640px resize (F3) were recorded as B.
- **`11b111f3`** made the portal opt-in for the three menus in the player
  box, which removed it from four components, and added the missing cases.
- **r2** on `11b111f3`: the fix held; the r1 survivors were killed. Four test
  findings — a racing resize case, the PDF opt-in and the sort sheet's
  fallback held by nothing, and a fixed sleep — closed by `9f25456e` (tests
  only, so no further round). Trajectory: one fix round, which removed more
  than it added.
