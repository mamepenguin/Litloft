# Card links go to the file's own page

One round on one commit. `invariants.md` is the list the round was briefed
with. The SHA it names is the pre-merge `079f444d`.

- **r1** on `079f444d`: no invariant broken. The link is now built from the
  listing's copy of the file's folder rather than from the server's record, so
  a rename elsewhere can leave it pointing at a folder that no longer exists
  (closed as B, in `known-issues.md` with the reserved-route collision the
  round also found). Two pre-existing test gaps over invariant 4 — the
  Cmd/Ctrl-click escape and the tree's navigation override on list rows — were
  filled, since after this change a break in either sends a row to the wrong
  page rather than through the redirect.

Read the code for what the system does now. This file quotes it as it stood at
the SHA the round reviewed.
