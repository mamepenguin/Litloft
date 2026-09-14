# intelligence #68 — invariants (R-0)

Approved by the supervisor (video-share-38) on 2026-09-14.

1. PickupWidget draws nothing until `fetchPickup` answers: no skeleton and no heading.
2. If the answer has 0 `file_ids`, it draws nothing. If `fetchPickup` fails, it draws nothing. In neither case does it draw anything even for a moment.
3. If there is at least one `file_id`, it draws `CarouselSection` as a skeleton while `batchGetFiles` resolves, with the heading, the See all link and the count (`total`). Once resolved, it draws the files.
4. The See all count stays `total` (the size of the feed). No number is shown while the count is unknown (by 1, nothing is drawn at all).
5. When the drive changes, it draws nothing until the next answer, and keeps neither the previous drive's files nor its count.
6. With no drive it draws nothing and sends no request.
7. The manifest slot (`drive-home-sections` / `pickup` / priority 5) and the use of core's `CarouselSection` are unchanged.

Recorded, not an invariant: if `file_ids` is non-empty but `batchGetFiles` returns 0 files, the row goes skeleton → nothing.
