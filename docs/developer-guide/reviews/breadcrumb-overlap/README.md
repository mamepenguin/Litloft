# breadcrumb-overlap

A header row holding a longer name than it has width overran that row: in the
archive toolbar the trail painted over the entry count and the download
control, and in the file-detail chrome the name that says where the reader is
was the part carried off the right edge.

| file | what it is |
|---|---|
| `invariants.md` | R-0, with the revision the user's run of the app forced |
| `r1.md` | round 1, mutation review of `60a4ec5d` |

## Triage of round 1

| # | bucket | outcome |
|---|---|---|
| 1 | A | fixed — the trail's folder-listing form had no measured case; added one |
| 2 | A | fixed — the assertion meant to catch a starved back control could not |
| 3 | A | fixed — a long *last* segment overran both trails; the leaf's own box could not narrow |
| 4 | A | fixed — the leaf was measured on its wrapper, the ancestors on their label |
| 5 | A | fixed — the phone case read the rename control by tag, and found the back control |
| 6 | A | fixed — `toBeGreaterThan(0)` where the rule asks for `toBe(N)` |
| 7 | B | closed — `overflow-hidden` and `flex-shrink-0` in the archive trail are a second layer nothing measured reaches. Kept: they clip the exact failure this change is about if the shrink priority ever regresses |

Finding 3 is the one that changed behaviour. It was labelled `[pre-existing]`,
and it is — but the first fix turned an overflow into a clip without letting
the last segment narrow, so the change carried it. A trail whose deepest
folder has a long name is ordinary, and the fixture's short last segment was
hiding it on both trails at once.

## Trajectory

Round 1 removed a special case rather than adding one: `TRAIL_ANCESTOR` split
into what every segment needs (`min-w-0`) and what only the ancestors need
(the shrink factor), and the `isLast` branch stopped deciding whether a
segment can narrow at all.
