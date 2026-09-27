# Review record: GlobalSearch split

Invariants: [invariants.md](invariants.md).

## PR-1 r1 (`227f8b02b`) — [r1.md](r1.md)

Bucket A empty. A probe logging every API call, commit, scroll and DOM hash matched old and new
except F1.

| Finding | Bucket | Action |
|---|---|---|
| F1 on open, `getWatchHistory` now fires before the Go to / Folders reads (same flush, same count and arguments) | B | recorded |
| F2 seven mutations in the moved code survive the suites, at the parent too | pre-existing | recorded; the moved code is textually identical |
