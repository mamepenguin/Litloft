# media_import #18 — invariants (R-0)

Approved by the supervisor (video-share-38) on 2026-09-14.

1. On mount, Watch sends exactly two lane requests, `regular` and `feed`. It never sends `continue`.
2. Watch renders no Continue section. It renders Regular sources, then Recent, with each lane's limit and pageable unchanged (regular 12, not pageable; feed 12, pageable).
3. `GET /watch?lane=continue` returns 422; the lane values are exactly `regular` and `feed`. Responses for regular and feed (order, per-source bound, progress badges, and videos still returned when marker reading fails) are unchanged.
4. The empty state (`watch-empty`) appears only when both lanes have finished loading and both are empty. It does not appear while either lane is loading. The surfaced / none wording choice is unchanged.
5. The choice between opening on Watch and on Manage is unchanged (it looks only at `display_mode !== "library"`).
6. No write path changes: WatchHistory is neither written nor deleted. Core's Home Continue Watching is unchanged (this PR has no core diff).
7. `mediaImport.watch.lane.continue` is gone from both ja and en, and nothing references it.
8. `COV_FLOOR` is the post-removal total, measured in the CI image and truncated to two decimals. The population check still passes with the same set of 14 modules.
9. With a viewer, regular and feed still carry badges for that viewer's own progress; without a viewer they render without badges.
