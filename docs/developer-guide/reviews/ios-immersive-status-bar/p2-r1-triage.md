# Phase 2 r1 triage

Approved by the user 2026-09-26.

| # | Bucket | Action |
|---|---|---|
| F1 | B | A hold started right after a release can end its wait on the answer to the earlier request (answers carry no request id). Only reachable from Phase 3 within about one shell layout; the carry then goes instant, the state stays right. Closed without a contract change. |
| F2 | A | Test: an `active: false` answer at the current size does not end the wait. Test-only; no re-review. |
| F3 | Carried to Phase 3 | Whether to wait for `resize` or a frame after `ready` before the carry is decided by measurement in Phase 3. |
| F4 | B | Width half of the comparison untested; a width-only change after the answer is not reachable. |

R-0 items 11 and 12 added. Phase 2 closed.
