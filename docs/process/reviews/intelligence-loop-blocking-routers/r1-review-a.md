# r1 review A — intelligence `b6eeaea`

Reviewed: `addons/intelligence` commit `b6eeaea` against its parent `501bd4a`.
Full suite at `b6eeaea` in Docker: 3555 passed, 2 skipped.

## Gates checked, no finding

Each read-decide-write gate was compared with its parent version. In every one, the
decision and its write stay inside one `asyncio.to_thread` body and one `get_search_db()`
session, or they were already split in the parent:

- summaries: `edit_summary`, `revert_summary`, `edit_detailed_summary_section`,
  `revert_detailed_summary`, `regenerate_detailed_summary` (the 409 edit check, the reset,
  the supersede and `_set_detailed_status` all run in one thread body, and
  `_set_detailed_status` was a separate session in the parent too), `start_detailed_summary`
  (read-only 409 check; two double-clicked POSTs both passed it in the parent as well, since
  nothing is written until the background task runs), `regenerate_summary`,
  `delete_detailed_summary_route`.
- chapter_suggestions: `dismiss` (check and update in one session), `approve` (the read,
  the core PUT and then a `status='pending' AND created_at=` guarded update; the same
  three-step shape as the parent).
- files: `dismiss_suggested_tags` (now `def`), `regenerate_suggested_tags`.
- admin: `resolve_failed_job` (one session).
- refine: `refine_file` and `refine_folder` read the same chunk ids (same query, same
  swallow-to-`[]`) and start the same jobs. `start_refine_job` runs on the loop thread at
  both call sites, and there is no other caller of the old signature (`git grep` over the
  repo). The parent had no "already refining" gate either. The folder response's
  `file_ids` order is now completion order instead of input order, but the frontend
  (`FolderRefineButton`) does not read it.
- `reindex_file` `_reindex_in_flight`: the claim is taken with no `await` between the
  `is_queued`/claim check and `update`, and released in `finally` on the 404, the enqueue
  error and success paths. `already_queued` is reported only while another request holds
  the claim or the task really is queued. The new tests cover both cases.
- Handlers turned into `def` (`get_transcript`, `get_clip_timestamps`, `get_frame`,
  `get_suggested_tags`, `dismiss_suggested_tags`) contain no `await`, and nothing in
  app/ or tests calls them directly.
- Ask `_stream_answer`: the `to_thread` calls are awaited one at a time inside the
  generator, so `emitted_keys` and `progressive_index` are never touched concurrently and
  the event order is unchanged. A cancel during a thread hop lands in the `try`, so
  `aclose` still runs. None of the offloaded helpers (`assemble_contexts`,
  `_to_citation_dict`, `fetch_long_summaries`, `filter_clue_by_rarity`,
  `_build_progressive_citation_event`) reads or sets the `llm_routing._bound` ContextVar,
  and `to_thread` copies the context anyway.

## Findings

### 1. B — `get_frame` is now concurrent with itself, and the second of two requests for the same uncached frame returns 500

- Where: `app/routers/files.py:813-884` (`get_frame` turned into `def`) together with
  `app/frame_cache.py:79,115` (a fixed `.webp.tmp` name followed by `os.replace`).
- Scenario: two requests for `/files/{id}/frame?t=X` arrive while that frame is not
  cached yet, for example from two tabs, or from `ClipFramesSection` and
  `VisualIndexSection` on the same detail page (scene `start_time` values come from the
  same CLIP timestamps). In the parent, the endpoint ran on the event loop, so two endpoint
  calls could not overlap. Now both run in the threadpool, and both `ffmpeg -y` write the
  same `.tmp` path. The first one to finish renames it, and the second then finds no
  `.tmp`: it either raises `HTTPException(500, "Frame extraction failed")` or hits an
  uncaught `FileNotFoundError` from `os.replace`, which is also a 500. That request's
  `<img>` is broken until a reload, although the cached frame itself is valid. Browsers
  usually merge identical in-flight image URLs within one document, so it takes two tabs or
  devices in practice, which is why this is B. The video-visual worker could already race
  the endpoint this way before this commit, because it runs in a thread.
- How verified: reproduced. A throwaway test called `extract_frame_to_cache` from two
  threads on the same cache path, 20 times on a 720p lavfi clip. One of the two calls
  failed in 18 of 20 runs (`FileNotFoundError ... 5000.webp.tmp -> 5000.webp` or a 500).
  The cached file was a valid RIFF/WebP every time. A per-call unique tmp name (or a
  re-check of `cache_path` after a failure) would fix it.

### 2. B — read-only handlers now queue behind workers in the shared default executor

- Where: every `asyncio.to_thread` added in this commit for a read that takes no lock,
  for example `app/routers/pickup.py` `_read`, `app/routers/similar.py` `_check_source`
  and `find_similar`, `app/routers/video_visual.py` `_load_runs`, and the
  `get_search_db_read` paths in Ask.
- Scenario: `asyncio.to_thread` uses the loop's default executor
  (`min(32, cpu_count + 4)` threads; no `set_default_executor` in app/). Since `501bd4a`, the
  background workers (indexer 24 call sites, summaries 17, video_visual 30, vision 15, …)
  do their writes in that same executor. While refine holds `_write_lock` through a forced
  alignment, every worker thread that reaches `get_search_db()` sits blocked inside the
  executor. Once those fill it, a request that only needs a read session, which never waits
  on the lock, waits for a free executor thread instead. In the parent it ran on the loop
  and answered at once. The loop itself stays responsive, so this is a latency
  regression, not a hang. The new `def` handlers do not have this problem because they run
  in anyio's separate 40-thread limiter.
- How verified: read only. The executor size in the test container is 20
  (`cpu_count` 16). I did not measure how many worker threads block at once in production.

TOTAL: 2 findings
