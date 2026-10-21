spec: docs/specs/search-knn-partition.md

## Revisions

I1. (r5) With Scene search off and a requested drive, and with thresholds and margin that let every row through, `_vector_search_clip` returns the `min(rrf_candidates, N)` nearest `clip_thumbnail` matches of active files in that drive, and no `clip` match. N is the number of such rows among the 4,096 nearest `clip_thumbnail` rows. This holds however many `clip` rows, other drives' thumbnails or inactive files' thumbnails are nearer to the query.
I3. (r5) The CLIP channel's discard stages use the configured values. In precision mode these are `search.score_gap_threshold`, the coefficient-of-variation cut-off 0.01, `search.min_score_clip_thumbnail` / `search.min_score_clip`, and `search.score_cutoff_margin`. In recall mode they are the `_RECALL_PARAMS` gap threshold and margin, with the same per-type floors. With Scene search off and a requested drive, the gap and CV are computed over the rows kept after the drive and activity filter. Otherwise they are computed over every row the KNN returned.
I9. (r5) With Scene search off, which matches the CLIP channel returns for a drive does not depend on the thumbnails of other drives, as long as the drive's own matches lie within the 4,096 nearest `clip_thumbnail` rows.
