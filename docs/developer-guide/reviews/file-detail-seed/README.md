# File detail drawn at once from the clicked list item

Each round is a fresh reviewer on one commit. `invariants.md` is the list the
rounds were briefed with, with the user's revisions marked. The rounds ran
before a rebase onto develop; the SHAs they name map to the merged commits as
`b1dcf95d` → `080b9a8a`, `c9b31c6a` → `3c9f3bc3`, `a0064c92` → `f0799769`.

- **r1** on `b1dcf95d`: a trashed file kept drawing from its list copy in the
  fullscreen host (inv 8); a view kept across a change of file played the
  previous file's media under the next file's id (invariant 9 added); host
  changes and the in-place reset were untested; watch history, collections
  and duplicates did not seed. Invariant 2 was narrowed to core requests; the
  two intelligence requests move to the intelligence change.
- **r2** on `c9b31c6a`: the fixes held, but the round answered as patching:
  it added an id-keyed entry, an id guard and resets, each for a case the list
  copy introduced. It also found that capture actions vanished for files
  opened from a list (N1). The user had the view keyed per file above the
  data hook instead.
- **r3** on `a0064c92`: the keying removed the entry, the guard, the resets
  and the fetch guards; bucket A empty and the loop read as converged. N4
  (a trashed file reopened is drawn live for one round trip), N5 (watch
  history copies lack `subtitles`), a dev-only StrictMode double
  `recordFileView` and a one-frame collapse of the player box on an in-place
  switch were closed as B; the user-reachable ones are in `known-issues.md`.

Read the code for what the system does now. These files quote it as it stood at
the SHA each round reviewed.
