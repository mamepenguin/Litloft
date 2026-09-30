# Triage — round 1

| Finding | Bucket | Action |
|---|---|---|
| F1 missing `</div>` survives | A (test lets invariants 3/5 through) | block-order and gap assertions added |
| F2 script `scrollLeft` passes under `overflow-x: hidden` | A (test lets invariant 1 through) | touch scroll gesture via CDP |
| F3 margin reset untested | A (invariant 3) | gaps measured from the table box |
| F4 gap below a table 14.9px → 16px | B | closed |
| F5 DetailedSummarySection tables not wrapped | pre-existing | `known-issues.md` |

The fix commit changes only the test. M2, M4, M6 and M7 now fail the spec; the full component suite passes (220).
