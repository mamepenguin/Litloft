# knowledge #44 — invariants (R-0)

Approved by the supervisor (video-share-38) on 2026-09-14, item 9 added at approval.

1. On mount, the Knowledge page calls `GET /clips?url=` only for URLs whose recent-clips row is `fetching`, once per distinct URL. With no fetching rows it calls nothing.
2. The lookup changes a row only when the response contains that row's `file_id` and the row is still `fetching` at that moment. A row already `ready` / `failed` (including one settled by WS while the lookup was in flight) is never changed back.
3. The DB answers `ready` only after the article body PUT succeeded. A job whose body GET or PUT failed ends `failed` in the DB, not `ready`.
4. A row whose `file_id` is missing from the response, or whose lookup request failed, stays `fetching` (never guessed as failed). One URL's failure does not stop other URLs from being applied.
5. The lookup does not touch the `pendingClips` store or `ClipNotifier`: it shows no toast and removes no pending id. The Dashboard's existing WS updates are unchanged.
6. The lookup uses the current drive's rows and that drive's `X-Lit-Drive` (drive boundary).
7. `JOB_MAX = 10` and the 24 h TTL are unchanged; the lookup never adds rows.
8. The backend change does not alter when `knowledge.clip.ready` / `knowledge.clip.failed` are emitted or what they carry.
9. A job reclaimed at startup by `reclaim_stale_jobs` (empty credential, `drive=""`) that fails to publish ends `failed` per 3, and reopening the Dashboard shows its row as failed.

## Revised by the supervisor after r1

10. A job whose body PUT succeeded does not become `failed` because a later rename or event emission fails.
11. The lookup changes only a row's `status`. It leaves `url`, `title` and `addedAt` unchanged and never removes a row.
