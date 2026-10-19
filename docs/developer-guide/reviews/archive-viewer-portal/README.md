# Archive image viewer — portal to body

One round, a fresh reviewer on one commit. `invariants.md` is the list it was
briefed with.

- **r1** on `8ebe48a2`: 14 mutations. The portal is held by the new component
  spec. F1: the commit dropped the only check that the viewer is `fixed`, so
  `absolute` passed — fixed by `4e27d8f8` (test only, so no further round).
  F2 is the same stacking defect in the archive toolbar's phone menus,
  pre-existing, recorded in `known-issues.md` and left for its own fix. F3: the
  fixture's header and strip are stand-ins, recorded.
