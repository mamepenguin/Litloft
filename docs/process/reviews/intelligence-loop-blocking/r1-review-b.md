# r1 review B — intelligence f5e46bd (startup and operating path)

Reviewed commit: `f5e46bd` (addons/intelligence). Line numbers are at f5e46bd.

## Findings

### A1. The reset now uses a minutes-old snapshot, so an overlapping reconcile can throw away a finished STT transcript and put the VTT transcript in its place

- Where: `app/indexer.py:600-614` (snapshot: `whisper_indexed=True` rows plus `has_chunks` as a column), `:618-639` (walk, minutes on the production mount), `:650-665` (the UPDATE re-checks only `whisper_indexed IS TRUE`).
- Old behavior: the chunk check and the temp-audio check ran under `_write_lock`, in the same transaction as the reset. No whisper commit could fall between "checked" and "reset".
- New behavior: `chunked` is read when the snapshot is taken. The UPDATE happens minutes later. If another path finishes the whisper job for that loft in between, the row is back at `whisper_indexed=True` with chunks and with its temp audio deleted (`whisper.py:984-987`). The stale snapshot still says "no chunks, VTT present" (and "temp present", if the walk got there before the delete). The UPDATE's only guard is `whisper_indexed IS TRUE`, which passes, so the row is reset. `_resume_incomplete` then re-queues it. `index_whisper` finds no temp audio and goes to `_index_loft_vtt` (`whisper.py:887-892`). That calls `_remove_whisper_data` and writes the VTT cues (`whisper.py:1790-1800`). The STT transcript the user asked for ("always STT") is gone, and nothing logs a reason.
- How normal use produces the overlap: Media Import's hand-off to this addon is `scan.complete` → `reconcile()`. For an item with captions and STT it emits two of them, first when the captions land and again when the temp audio lands (`addons/media_import/backend/service.py:996-998` and `:1048-1051`). A subscription batch emits two per item. Core also emits one per drive at startup, and one per upload. `reconcile()` has no mutual exclusion (`indexer.py:340`, `:1086-1101`). A reconcile whose snapshot was taken before R1's reset, and whose write lands after A's whisper job finished, resets A. With a walk of several minutes (the production measurement), any reconcile that starts during R1's walk qualifies once A's STT finishes within the remaining walk time. The window used to be a commit→unlink gap of microseconds; it is now the length of the walk.
- Verified: throwaway test `tests/test_zz_revb_window.py` in my worktree at f5e46bd, run in Docker. Loft A has a VTT and temp audio, `whisper_indexed=True`, and no chunks at snapshot time. During the walk (hooked at loft B's `match_siblings`) the simulated whisper job writes the STT chunk "stt text", sets the flag and deletes the temp audio. After `_reset_loft_refs_with_new_vtt()`, A's `whisper_indexed` is `False`. Running the real `index_whisper("A")` then leaves chunks `['caption text']`. Test passed, so the mechanism reproduces.
- Fix direction (not applied): re-check in the write transaction. For the VTT reason add `NOT EXISTS (transcript_chunks for the file)` to the UPDATE; for the temp-audio reason, re-stat only the `to_reset` subset (small) just before the update. Alternatively, serialise or coalesce `reconcile()` (see B1), which also closes this race.

### B1. Nothing stops two reconciles running at once, and their folder walks now run in parallel instead of queueing on the lock

- Where: `app/indexer.py:340` (`reconcile`, no lock), `:1086-1101` (`handle_scan_complete` awaits a full reconcile per webhook), `:1589-1596` (the worker's first reconcile now starts at t≈0).
- What changed: the walk used to run under `_write_lock`, so overlapping reconciles walked one after another. Now each one walks the ~6,000 loft folders over the slow mount at the same time, and each holds a default-executor thread (`min(32, cpu+4)`) for minutes. A burst of uploads or a Media Import batch (one or two `scan.complete` per file, see A1) can fill that executor, and then every `asyncio.to_thread` in the app (all the paths this commit moved there) queues behind the walks. The loop stays free, but work that needs the executor stalls. Also new: at a joint restart (`docker compose up` after an update) the addon's first reconcile now overlaps core's per-drive startup `scan.complete`. Before, uvicorn did not bind the socket until lifespan finished, so those webhooks could not arrive mid-reconcile. When both overlapping runs compute the same `new_ids` (`:386-390`), the second `_insert_rows` hits the PK on flush. Its session is poisoned, and that reconcile logs "Reconciliation failed" and skips deactivate/drift/resume for that run. The other run completes, so the effect is wasted work, not lost state.
- Verified by reading: no lock around `reconcile`; uvicorn runs lifespan startup before creating the server; core startup `scan_all_drives()` (`backend/app/main.py:275`) and upload completion (`backend/app/routers/uploads.py:80`) emit `scan.complete`.

### B2. Before the server accepts requests, every restart still walks every file of each drive that has a feature-policy purge configured

- Where: `app/main.py:152-193` awaits `purge_disabled_drives`, `purge_disabled_vision_drives` and `purge_disabled_video_visual_drives` before `yield`. `app/purge.py:77-168` (`purge_vision_for_drive`) and `:218-295` (`purge_video_visual_for_drive`).
- Cost: a drive whose `vision_describe` or `video_visual_index` policy is off keeps its `indexed_files` rows (only the umbrella `index` purge removes them), so it is listed by `_indexed_drives()` and purged again on **every** restart. That costs 2 indexed queries per file of the drive, in one write-lock transaction. The work is now in a thread, so the loop is free, but it is still before `yield`, so the healthcheck waits for it. Policy lookups are 3 × drives HTTP calls, cached 30 s, `_TIMEOUT_SECONDS=5` each. That is 5 s × drives × 3 at worst when core accepts the connection but hangs.
- Measured (throwaway `tests/test_zz_revb_purge.py`, Docker, tmp disk, no contention): 20,000 files on a policy-off drive with nothing to purge took 2.24 s (vision) + 2.91 s (video_visual) per restart. It scales linearly, and the write lock is held for the whole time.

### B3. Vision `requeue_abandoned` / `enqueue_unprocessed` run row by row before `yield`

- Where: `app/main.py:289-298`; `app/workers/vision.py:638-713`. Per row: `is_file_feature_enabled` (to_thread + write lock), `_read_file_state` (to_thread + write lock), `_mark_pending` (to_thread + write lock + commit). `vision_describe` defaults to `"manual"`, so `requeue_abandoned` runs whenever the feature is on. A bulk request (500 per click, `routers/vision.py:55`) leaves that many `pending` rows, and every restart replays them before the server answers.
- Measured (throwaway `tests/test_zz_revb_timing.py`, real lock and real drive-lookup hop, policy mocked): 2,000 pending rows took 1.38 s (0.69 ms/row) on an idle tmp disk. On the production disk, with other writers running, it costs more. `video_visual.enqueue_unprocessed` (`video_visual.py:707`) has the same per-row shape (≥3 hops per video without a run, each restart) when that feature is `on_index`.

### B4. `reset_falsely_completed_clip_thumbnail` stats files while holding the write lock, the same pattern this commit removed from the loft walk

- Where: `app/indexer.py:1786-1839`. It runs at startup before `yield` (`main.py:115`) and on every reconcile (`indexer.py:470`). Inside `with get_search_db()` it runs `os.path.exists` once per row whose thumbnail leg closed without a vector (`:1823-1826`). That includes rows that are permanently unreachable: they are stat-ed, filtered out, and stat-ed again next time. Images stat the media mount (`_thumbnail_source_reachable`, `:1738`).
- Cost: rows in that set × one stat on the bind mount. The production measurement (≈6,000 loft folders took minutes) works out to tens of ms per filesystem op, so 1,000 such rows means tens of seconds under `_write_lock`. The routers in `_PENDING` still take that lock on the loop.
- Verified by reading only.

### B5. The event loop can wait on `aligner._lock` while a thread holds it across a model load

- Where: `app/workers/refine.py:750` enters `aligner.job_scope()` on the loop. `acquire_job` and `release_job` (`app/workers/aligner.py:272-308`) take `_lock`, a `threading.Lock`. `_load_align_model` (`aligner.py:58-85`) holds the same `_lock` across `whisperx.load_align_model` (~1 GB; the first use downloads it). It is reached from `_apply` in a thread, while the search write lock is also held.
- Scenario: a folder refine (`routers/refine.py:175-185`; the semaphore bounds only the spawning, and all jobs run concurrently) over files in two languages. Job 1 finishes and calls `release_job()` on the loop while job 2's thread is loading the other language's model. The loop blocks for the whole load. The AST guard only knows the session factories, so it cannot see this. Separately, the model load happens inside the write-lock block, so a first-time download can exceed `_WRITE_LOCK_TIMEOUT_SECONDS=300` for other writers.
- Verified by reading only.

### B6. Synchronous file I/O and CPU work still on the loop in `app/workers/`

Not DB work, so the guard does not see it. Found with an AST scan of non-awaited calls in `async def` bodies.
- `transcription/deepgram.py:130-131`: `open(...).read()` of the whole audio file on the loop. Other providers open on the loop too (`assemblyai.py:95-100`, `elevenlabs_scribe.py:122`, `gemini.py:140`, `openai_compatible.py:140`, `splitting_transcriber.py:127`). A file of hundreds of MB over the slow mount blocks for seconds.
- `vision.py:804` and `video_visual.py:1005`: `_preprocess_image` (PIL decode + resize) runs on the loop; roughly 100+ ms for a large photo.
- `whisper.py:887` and `:987`: stat and unlink of the loft temp audio on the loop (one op each).
- `indexer.py:1613-1615`: idle unload runs `gc.collect()` + `malloc_trim` on the loop (`whisper.py:253-258`).

### B7. Search can return trashed, missing or moved files for a while after startup

- Where: `app/indexer.py:177-209` and `:1589-1596`. Before this commit the server did not serve until `reconcile()` had deactivated files that core trashed or marked missing while the addon was down (their webhooks failed then). Now search (`routers/search.py`, which filters only on `IndexedFile.active`) serves before that. The window lasts until reconcile reaches `:396`, after `_get_litloft_files`, `_get_indexed_metadata` and `_add_new_files`. That is seconds normally, and longer when many new files arrived during the downtime. RAG is not affected, because core's `filter-file-ids` applies `active_file_filter()`.

## Checked, no finding

- Item 3: `_reconciliation_worker` (`indexer.py:1589-1601`). Reconcile then sleep gives the same cadence as before (startup reconcile, then every `interval` plus run time). `reconcile()` catches `Exception`, so the 60 s branch is effectively unreachable. `CancelledError` still returns. It cannot hot-loop unless `reconciliation_interval<=0`, which behaved the same before.
- Item 4 equivalence: temp audio wins over chunks; VTT counts only when there are no chunks; an `OSError` on either probe counts as unlistable once and skips the row; one warning per run. All of these match the old code. `_RESET_BATCH_SIZE=500` keeps the IN list under SQLite's limit, and each batch is its own transaction, so a partial failure leaves a correct subset. The `whisper_indexed IS TRUE` re-check prevents double counting but not the A1 race.
- Item 2 ordering: the `reset_falsely_completed_*` passes and `fail_orphaned_running_jobs` still run before `start()`, so the first `_resume_incomplete` sees their writes, as before. The `enqueue_unprocessed` sweeps already ran before `start()` in the old code. An empty index queue before the first reconcile shows only as `waiting: 0` in `/status`. `/status` is a sync route, so it runs on the threadpool.
- `init_search_db()` (`main.py:85`) is still synchronous before `yield`. In steady state it is idempotent DDL plus a handful of `COUNT(*)` probes (`database.py:312-400`). The backfills run only when their target table is empty.

TOTAL: 8 findings
