# breadcrumb-overlap

A header row holding a longer name than it has width overran that row: in the
archive toolbar the trail painted over the entry count and the download
control, and in the file-detail chrome the name that says where the reader is
was the part carried off the right edge.

| file | what it is |
|---|---|
| `invariants.md` | R-0, with the revision the user's run of the app forced, and the correction round 2 found in it |
| `r1.md` | round 1, mutation review of `60a4ec5d` |
| `r2.md` | round 2, mutation review of `86df7069`, with the trajectory answer |
| `r3.md` | round 3, mutation review of `bedcdcca`, with the trajectory answer and the enumeration check |

## Triage of round 1

| # | bucket | outcome |
|---|---|---|
| 1 | A | fixed — the trail's folder-listing form had no measured case; added one |
| 2 | A | fixed — the assertion meant to catch a starved back control could not |
| 3 | A | fixed — a long *last* segment overran both trails; the leaf's own box could not narrow |
| 4 | A | fixed — the leaf was measured on its wrapper, the ancestors on their label |
| 5 | A | fixed — the phone case read the rename control by tag, and found the back control |
| 6 | A | fixed — `toBeGreaterThan(0)` where the rule asks for `toBe(N)` |
| 7 | B | closed, then reopened by the fold: `flex-shrink-0` on the archive's count group was a second layer nothing reached, until the folded trail's floors made the row over-subscribed at a phone width. The count now steps out of the row below `sm` instead |

Finding 3 is the one that changed behaviour. It was labelled `[pre-existing]`,
and it is — but the first fix turned an overflow into a clip without letting
the last segment narrow, so the change carried it.

## Triage of round 2

| # | bucket | outcome |
|---|---|---|
| 1 | A | fixed — `truncate` on the trailing segment was reached by no width, and dropping it made the filename *wrap*, which every assertion in the spec was blind to. The spec now counts line boxes, and the fixture's leaf is longer than the row at every width |
| 2 | A | fixed — `SHARE_FLOOR` measured how long the fixture's folder name is. The phone case now declares that both names give way, which is what `flex-none` and `flex-1` each break |
| 3 | A | fixed — a segment could be deleted from either trail unseen. The count is declared per case, and the bound built out of the observation is gone |
| 4 | B | prose, deleted — invariant 5 said "never both", which is false for the `onBack` form and would lead a reader to delete the only control that returns to a collection. That form now has measured cases too |
| 5 | A | fixed — ancestors reached `clientWidth 0`, which has no hit area. They stop at a floor, and the fold means there are only ever two of them |

Round 2 also confirmed round 1's claim: every mutant round 1 called a survivor
is dead at `86df7069`, bar the two closed as B.

## Found while fixing, not by either round

`EditableTitle`'s button carried `flex-1`, so its basis was zero and it
contributed nothing to the row's base size: above `md` a note's name took
whatever the full-width ancestors left it — 81px of 592 — and nothing ever had
to give. It is the same defect `60a4ec5d` fixed one level up, in the wrapper
around it.

## Triage of round 3

| # | bucket | outcome |
|---|---|---|
| 1 | A | fixed — the index `after` is rendered with could be shifted by one, drawing the folder the reader is in as a link to itself, with every suite green. `Breadcrumb.test.tsx` had no folded case; it does now |
| 2 | A | fixed — where the marker leads was held by nothing: the archive's could be made inert and stay green. Both trails now assert the destination in their unit tests |
| 3 | A, after the revision | the user saw both states at 375px and chose the width clause over bringing the count back. Invariant 4 is revised, and a case now pins the count out of the row below `sm` and whole above it |
| 4 | A | fixed — the marker was 19px, under the spec's own `REACHABLE_PX`, and was filtered out of the one hit-area assertion. It has the floor now, and the assertion covers it |
| 5 | A + **raised** | fixed for coverage — every drop handler on every trail segment could be deleted unseen; `Breadcrumb.test.tsx` holds them now. Raised for the invariant: folding removes five folders' drop targets, and invariant 6 is written about "a trail segment" |
| 6 | A | fixed — the one form of the file-detail row still unmeasured was the one the `EditableTitle` fix was written for. It has a case at 768 and 1024 |
| 7 | A | fixed — the pixel of slack in `isCut` was load-bearing for a case. The fixture's leaf moved off the boundary, and dropping the slack now changes nothing |
| 8 | A | fixed — `foldTrail`'s clamp was unreachable by either caller and untested. It is a real guard (a negative slice end folds from the wrong side), so the test covers it rather than the clamp going |
| 9 | B | closed — two `flex-shrink-0`s reached by no measured width, the same family as round 1's finding 7 |
| 10 | B | prose, deleted — the marker does not always lead somewhere the trail is drawn whole; it can fold again |

Round 3 also confirmed round 2's claim, with one qualification worth keeping:
the leaf-rendered-as-a-link mutant is killed by `Breadcrumb.test.tsx` **only on
an unfolded trail**, which is the hole finding 1 walked through.

## The trajectory

Round 3's answer: **converging, not being patched** — `bedcdcca` removed the
premise under the earlier rounds' predictions rather than adding a case to
them, by making the number of drawn segments a constant instead of the path's
depth. It adds no state.

The watch item it left: `hidden sm:inline` on the archive's entry count is a
width-specific carve-out that exists because this branch's own floors made
that row over-subscribed at a phone width. One such round is not a C; **a
second consecutive round adding a carve-out to that row is**, and the round-3
fixes deliberately add none.

Round 2's answer: **converging, not being patched.** `853c3a14` added one
prediction, `60a4ec5d` added a different one elsewhere, and `86df7069` removed
the first rather than adding to it. The caution it recorded is about the
detector rather than the design — each round had extended the spec with a case
for the shape the last round missed. That round answered it by enumerating
the forms the row draws and covering the ones neither round had: the
folder-listing trail with a long leaf, the `onBack` form, and a plain file's
row on a phone. Round 3 checked the enumeration and found one form left — a
note above `md` with no `onBack`, which is the form the `EditableTitle` fix
was written for — now covered.
