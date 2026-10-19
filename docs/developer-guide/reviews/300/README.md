# #300 — Folder toolbar on one row on phones

One review round, with the invariants it was briefed with.

| File | SHA reviewed | What it reviewed |
|---|---|---|
| `r1.md` | core `1a0ee4f0` (rebased as `2dc45781`) | Add joining the bar, Play moving into `…` below 768px, the phone Filter cap. |

Triage of r1:

| # | Bucket | Outcome |
|---|---|---|
| 1 | A (test gap) | Fixed in `4753bd8f`: a trust-only filter holds the phone cap. |
| 2 | A (test gap) | Fixed in `4753bd8f`: Play stays on the bar and in `…` in select mode, while naming a folder, and while filtering. |
| 3 | pre-existing | No browser-run detector holds the bar to one row; closed as pre-existing. |
| 4 | B | `role="presentation"` on the Play wrapper is untested; closed. |

The fix commit changed only tests, so it was not reviewed again. Read the code
for what the system does now; these files quote it as it stood at the SHA.
