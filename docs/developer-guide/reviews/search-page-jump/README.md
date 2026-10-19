# Review record: search modal page jump

Invariants: [invariants.md](invariants.md).

## r1 (`17254c674`) — [r1.md](r1.md)

No path broke an invariant. Triage, decided by the user:

| Finding | Bucket | Action |
|---|---|---|
| F1 flaky test for invariant 4 | A | fixed: wait for the file request before resolving it |
| F7 sidebar smart folder opened on the row's drive | fixed | restored the pre-change destination (current drive) |
| F2, F3, F4, F5, F6 missing tests | B | closed without tests: the code is correct and these would not stay |

## r2 (fix `1c97f7f48`) — [r2.md](r2.md)

No findings. F1's test now fails 10/10 under r1's G6; F7's destination matches the parent's. The fix adds no branch, state or prediction.
