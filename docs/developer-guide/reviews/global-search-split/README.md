# Review record: GlobalSearch split

Invariants: [invariants.md](invariants.md).

## PR-1 r1 (`227f8b02b`) — [r1.md](r1.md)

Bucket A empty. A probe logging every API call, commit, scroll and DOM hash matched old and new
except F1.

| Finding | Bucket | Action |
|---|---|---|
| F1 on open, `getWatchHistory` now fires before the Go to / Folders reads (same flush, same count and arguments) | B | recorded |
| F2 seven mutations in the moved code survive the suites, at the parent too | pre-existing | recorded; the moved code is textually identical |

## PR-2 r1 (`170df31a5`) — [pr2-r1.md](pr2-r1.md)

Bucket A empty. A probe rendering old and new GlobalSearch in 18 scenarios on both the phone sheet
and the desktop modal found identical DOM and navigation in all 36 cases.

| Finding | Bucket | Action |
|---|---|---|
| F1 render details that moved (no-drive text, see-all total, legend `aria-expanded`, …) are held by no test, at the parent too | pre-existing | recorded |
