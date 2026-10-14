# Review A — intelligence `f5e46bd` (keep the event loop free while reconcile scans loft folders)

Reviewed: `f5e46bd` in `addons/intelligence` only (worktree at that SHA). Threat model: personal tool, no adversary.

Tests run at f5e46bd (Docker): `test_event_loop_discipline.py test_loft_vtt_sidecar.py test_enqueue_dedup.py test_write_lock_discipline.py` — 60 passed.

## Findings

### 1. [A] Loft reset is no longer atomic: a reconcile can reset a loft whose STT finished during its scan, and the re-run replaces the STT transcript with the VTT captions

- Where: `app/indexer.py:600-669` (`_reset_loft_refs_with_new_vtt`), the read at 600-614 and the batched write at 655-664.
- Before: the read of `whisper_indexed=True` rows, the filesystem check and the reset all ran inside one `get_search_db()` block, so nothing else could commit between "this loft still needs a reset" and the reset itself. A second reconcile waited for the lock and then read the rows the first one had already reset.
- Now: the rows are read at T0, the filesystem is checked over minutes (the point of the change), and the write at the end only re-checks `whisper_indexed IS TRUE`. That condition holds both for "not yet reset" and for "reset, re-transcribed, and marked done again", so it cannot tell them apart.
- Scenario in normal use: Media Import hands STT over through `scan.complete` (`media_import/backend/service.py:1047-1052`). Each such request runs a full `reconcile()`, and the webhook awaits it. When the user asks for STT on several lofts in a row, reconciles overlap (each one's loft scan takes minutes on the production library):
  1. R1 and R2 both read loft A as `whisper_indexed=True` with `A.stt_temp.m4a` beside it.
  2. R1 finishes its scan and resets A. `_resume_incomplete` queues it, whisper transcribes the temp audio, writes STT chunks, sets `whisper_indexed=True` and deletes the temp file (`workers/whisper.py:982-987`).
  3. R2, which saw the temp file earlier in its own scan, now writes its batch and resets A to `False` again.
  4. R2's `_resume_incomplete` queues A. There is no temp audio any more, so `index_whisper` takes the `_index_loft_vtt` path (`workers/whisper.py:887-893`). If the loft has a `.vtt` sidecar, `_remove_whisper_data` drops the STT chunks and the captions take their place (`whisper.py:1792-1793`).
  The user asked for STT ("temp audio intentionally wins even if VTT chunks already exist", docstring at `indexer.py:595-598`) and silently ends up with the captions. The VTT branch has a milder version of the same race: a loft whose VTT import finished during the scan is reset and imported again, which is wasted work only.
- Verified: reproduced. I added a throwaway test to the review worktree (`tests/test_zz_repro_reset_toctou.py`, not committed). A Path.is_file hook simulates step 2 at the moment the scan sees A's temp file. Results: `flag after reconcile: False`, `chunks after reconcile: ['stt text']`, and after the requeued `index_whisper("A")`, `chunks: ['caption text']`. Under the old code the simulated commit could not have run while the scan held the write lock.
- Possible directions (not prescriptive): make the write condition match the read. Either re-check the filesystem fact for only the small `to_reset` set just before writing, or carry a version stamp of the state that was read (a chunk count/max id, or a `JobRecord` id) into the `UPDATE ... WHERE`. Serializing `_reset_loft_refs_with_new_vtt` across reconciles (an asyncio lock around the whole step, which needs no write lock) would close the overlapping-reconcile path, though not a path where a single reconcile overlaps an explicit reindex.

### 2. [B] The first reconcile now overlaps webhook-driven reconciles; nothing serializes `reconcile()` itself

- Where: `app/indexer.py:177-209` (`start()` no longer awaits), `app/indexer.py:1589-1600` (`_reconciliation_worker`), `app/indexer.py:1086-1101` (`handle_scan_complete` awaits a full `reconcile()`).
- Before: uvicorn did not listen until the first reconcile finished, so a `scan.complete` from core's own startup scan could not run a second reconcile alongside it. After that, overlapping reconciles were still serialized at `_reset_loft_refs_with_new_vtt` by the write lock.
- Now: on a stack restart, core's per-drive `scan.complete` webhooks can each run a full reconcile (every drive) while the first is still running. Their loft scans run in parallel over the same slow mount, where before they queued. Two overlapping reconciles that both see the same new files both `_add_new_files`; the second commit fails on the primary key, and `reconcile()`'s blanket `except` (`indexer.py:484-485`) drops the rest of that pass (deactivate, purge, loft reset, resume). The other pass covers that work, so the outcome is extra load and an error log, not lost state. Overlapping reconciles are also the precondition for finding 1.
- Verified: read only.

### 3. [B] `_PENDING` exempts whole functions, and the factory list misses `get_search_engine()`

- Where: `tests/test_event_loop_discipline.py:36-93` (`_PENDING`), `:27-31` (`_SESSION_FACTORIES`), `:415-421` (the filter).
- `_PENDING` is keyed by (file, function), so any new blocking call added to a listed function (for example `routers/files.py reindex_file`, `rag/service.py _answer_question`) passes. The "list may only shrink" check catches only an entry that stops offending, not one that offends more. This is acceptable for one follow-up PR. Counting offending call sites per entry would make additions visible.
- `_SESSION_FACTORIES` does not include `get_search_engine`, which `workers/video_visual.py:158`, `workers/clip_concepts.py:251`, `workers/tag_knn.py:137`, `pickup/profile.py:377`, `pickup/retrieval.py:169` and `search.py` use for synchronous reads through `engine.connect()`. Today every such call reachable from an `async def` is either already offloaded or inside a `_PENDING` function: adding the name moved one more hit into `rag/coarse_retriever.py coarse_retrieve`, which is already pending. A future direct `get_search_engine().connect()` in a worker coroutine would not be flagged, although it is the same class of work as `get_search_db_read()`, which the guard does cover.
- Also checked, no miss found: unresolved `obj.attr()` calls (an attribute or a non-module name as the receiver) inside async defs across `app/`, matched against every name in the blocking set. Only two false matches came up (`re.Pattern.search` in `workers/transcription/splitter.py`). No relative imports exist in `app/`.
- Verified: ran the detector's own `_app_offenders()` from a script, with and without `get_search_engine` added and with an attribute-call probe.

### 4. [B] The detector does not cover filesystem calls, which caused the incident; a few remain on the loop in the touched workers

- Where: `app/workers/whisper.py:887` (`_loft_stt_temp_path`, an `is_file()` stat on the loop inside `index_whisper`), `:987` (`_cleanup_loft_stt_temp`, stat plus unlink on the loop), and `config.validate_file_path` (realpath) called on the loop in `workers/video_visual.py` and `workers/whisper.py`.
- Each is one stat per file, so this is not the minutes-long stall. Over the slow production bind mount, though, each still blocks the loop for one round-trip, and the guard does not cover it. This is noted so that the guard's scope ("no synchronous DB work") is not read as "nothing slow runs on the loop".
- Verified: read only.

### 5. [B] Detailed-summary double-submit window widened

- Where: `app/workers/summaries.py:1057-1101` (`generate_detailed_summary`), gated by `routers/summaries.py:632` (`_has_detailed_summary` → 409).
- Before: once the background task started, it ran synchronously until it wrote `generating` (`_get_indexed_file`, `_build_context`, `_set_detailed_status` had no awaits between them). Now there are three thread hops before `generating` is written, including `_build_context`, which reads every transcript chunk. A second POST in that window passes the 409 gate and starts a second detailed LLM run whose result overwrites the first. This needs a repeated request, so it does not happen in normal single-click use.
- Verified: read only.

### 6. [B] Cancellation can now strand a vision claim as `pending`

- Where: `app/workers/vision.py:627-635` (`enqueue`).
- Before: `_mark_pending` and `queue.put` ran with no suspension point between them (an unbounded `asyncio.Queue.put` does not yield). Now, if the awaiting task is cancelled while `_in_search_txn(_mark_pending)` runs in its thread, the thread still commits `pending`. The `except BaseException` removes the id from `_queued` and the file is never queued, so the row stays `pending` until the next start's `requeue_abandoned`. This only happens on cancellation (shutdown during the lifespan sweep, or a cancelled request), never in normal use.
- The claim-before-await ordering itself is correct. The gate in `_should_accept` (`vision.py:589`) runs after its last await and `_queued.add` follows synchronously, so two concurrent requests cannot both pass.
- Verified: read only.

### 7. [B] `video_visual._stage_lock` is redundant with the in-transaction recheck

- Where: `app/workers/video_visual.py:438`, `:609-641`.
- `_insert_run` re-checks for a queued or running run and inserts inside a single `get_search_db()` transaction. The write lock serializes it and the session begins after the lock is taken, so a second caller sees the first one's committed row. That is enough on its own. The asyncio lock adds nothing, and it is used nowhere else. Both are correct, and duplicate runs cannot occur. The only cost is that a reader cannot tell which of the two carries the guarantee.
- Verified: read only. `test_video_visual_worker.py` and `test_video_visual_router.py` pass.

## Checked, no finding

- Reset parity: the new `_reset_loft_refs_with_new_vtt` resets the same set as the old one. Temp audio wins over existing chunks, chunked lofts with VTT are skipped, and an `OSError` on either check counts as unlistable. The correlated `EXISTS` keeps the chunked skip (`test_spec_addon_001_loft_with_chunks_is_not_requeued` passes). The batch of 500 stays under SQLite's parameter limit.
- `_reconciliation_worker`: `reconcile()` swallows `Exception`, so a failed first pass waits a full interval, as the old startup reconcile followed by sleep did. `CancelledError` still returns cleanly.
- Nothing in lifespan or the routers waits for the first reconcile to finish. The `enqueue_unprocessed` and `requeue_abandoned` sweeps run before `start()` and read only the search DB.
- ORM objects returned from closed read sessions (`chapter_suggestions._load` chunks, `video_visual._load_file_row`) are used the same way as before, with attributes loaded and no lazy relationships touched.
- `refine._apply`: the `nonlocal` counters are mutated only while the coroutine awaits that thread. Aligner model loading is behind `aligner._lock`.
- `purge.py` and the lifespan functions moved to threads touch no loop-bound objects.
- Test files run at f5e46bd: vision worker and endpoints, video_visual worker and router, refine batch and endpoints, summaries, detailed-summary endpoints, chapter suggestions and purge (337 passed), plus the commit's own tests (60 passed).

TOTAL: 7 findings
