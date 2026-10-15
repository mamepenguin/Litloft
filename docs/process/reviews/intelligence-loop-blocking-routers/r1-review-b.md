# r1 review B — intelligence `b6eeaea` (request handlers off the event loop)

Scope: is the loop actually free now, what the guard still misses, what the
admin settings / file detail / dashboard screens still wait on, threadpool
behaviour. Worktree at `b6eeaea`, Docker image from `Dockerfile.test`.

## Findings

### 1. [A] Read-only GETs on the file detail page and dashboard still take the write lock, so they hang for the whole writer hold (pre-existing, not a regression)

The loop is free now, but the request itself is not: these handlers open
`get_search_db()` (which acquires `_write_lock`) for pure reads, inside the
thread hop. While refine's `_apply` holds the lock (`app/workers/refine.py:774`,
one 10-chunk window of forced alignment plus `_reindex_keywords`), reconcile or
purge holds it, each of these requests waits for the full hold. After 300 s it
becomes a 500 (`WriteLockTimeout`, `app/database.py:1912`).

- Dashboard (both poll every 10 s): `GET /status` → `indexer.get_index_status`
  `app/indexer.py:278`, `app/main.py:506`; `GET /failed-jobs` → `app/routers/admin.py:1068`.
- File detail page on open: summary `app/routers/summaries.py:112,217`
  (two lock waits in sequence, three when the summary is absent, via
  `classify_missing_reason`); detailed summary `summaries.py:607` →
  `_require_file_in_drive` + `workers/summaries.py:_get_detailed_summary`; citations
  `app/citations.py:1637`; chapter suggestions `app/routers/files.py:52` (via
  `_require_allowed`) + `app/routers/chapter_suggestions.py:55`; transcript
  `files.py:87`; subtitles `files.py:142,156`; suggested tags `files.py:907`;
  visual description `app/routers/vision.py:86,104`; index details `files.py:52,354`;
  clip timestamps `files.py:489`; frame `files.py:840`; pdf-markdown `files.py:781`.
- Ask: `app/rag/context.py` (all session opens), `app/rag/coarse_retriever.py:114`,
  `app/rag/retriever.py:236`, `app/rag/clue_generator.py:82`.

Scenario: start a folder refine, open a video's detail page: the summary,
transcript, tags, chapters and visual-description sections stay on their
spinners until the current window's alignment commits, then load; Ask waits the
same way. Search, similar, pickup, visual-index and the admin settings screen
(see "Checked") do not wait, because they use `get_search_db_read` /
`get_search_engine` and no lock.

Verified: a script over the AST mapped every route to the session factories it
reaches (transitively, including closures handed to `to_thread`); I then read
each GET above to confirm the factory is `get_search_db` and the body only
reads. Not introduced by this commit (each was a `get_search_db` read before
too, on the loop); reported because it is the answer to "can the screens still
wait on the write lock" and because it feeds finding 2. Switching these reads
to `get_search_db_read` removes both.

### 2. [A, conditional on hold length and CPU count] Lock waiters fill asyncio's default executor, and lock-free endpoints then wait for the writer too

`asyncio.to_thread` runs on the loop's default `ThreadPoolExecutor`,
`max_workers = min(32, os.cpu_count() + 4)`. That pool is shared with every
worker loop's `to_thread` (metadata, text, clip×N, whisper×N, tfidf,
reconcile, auto_tags, chapters, summaries, vision, video_visual,
retrieval_keywords, refine (`app/indexer.py:205`, `app/main.py:212-348`)),
several of which also wait on `_write_lock` or run minutes of inference there.
A thread blocked in `_write_lock.acquire` cannot be cancelled when the client
goes away, so every finding-1 request that arrives during a hold keeps its slot
until the writer releases. The dashboard alone adds one per 10 s
(`frontend/FailedJobsAlert.tsx:53`, `setInterval` without an in-flight guard →
`admin.py:1059`); each file-detail open adds about six.

Once the slots are full, requests that never touch the lock queue behind them:
`GET /admin/embedding` (`admin.py:857`, read session only; on the admin settings
screen), `/pickup`, `/files/{id}/visual-index`, Ask's read hops
(`rag/service.py`), everything the workers offload. The loop still answers
`/health` (async, no DB), so the container healthcheck sees nothing wrong. The
symptom matches the outage, but it lasts only as long as the hold.

Verified (Docker, real `get_search_db` / `admin.get_failed_jobs` /
`admin.get_embedding_config`, temp SQLite, writer thread holds the lock 4 s):

```
cpus=16 default_executor_max=20 lock_waiters=19 embedding_during_hold=0.00s
cpus=16 default_executor_max=20 lock_waiters=20 embedding_during_hold=3.80s
cpus=16 default_executor_max=20 lock_waiters=30 embedding_during_hold=3.81s
```
(loop tick stays at 0.0000 s throughout; script
`scratchpad/r2b-tools/repro_executor.py`). In production the writer itself runs
inside `to_thread`, so the threshold is one lower. I did not measure the
production VM's CPU count or real hold lengths, which is why this is conditional.
On a 4–8 CPU VM (8–12 slots), a minute-long hold during indexing reaches the
threshold in ordinary use. Compared with the parent, this is strictly better:
there the loop itself blocked. Fix directions: finding 1's read-session switch,
or a dedicated small executor for lock-taking hops.

### 3. [B] Guard blind spots (no live instance at `b6eeaea`)

`tests/test_event_loop_discipline.py` does not flag these shapes (each checked
with `_detect` / `_detect_sources` in Docker, `scratchpad/r2b-tools/gaps.py`):

- a blocking sync helper passed as a callback to an async wrapper that calls it
  on the loop (`await _run(_h)`, where `_run` does `fn()`): `_offenders_in`
  only looks at calls, and a bare reference is never flagged
  (`test_event_loop_discipline.py:171-206`);
- a lambda that runs on the loop (`sorted(xs, key=lambda x: _h())`): `visit_Lambda`
  treats every lambda as off-loop (`:192`);
- a method called on another object (`w.load()`): `resolve` handles only
  `self`/`cls`/module aliases (`:89-101`);
- `get_search_engine().connect()` and `get_write_lock()`: not in
  `_SESSION_FACTORIES` (`:26-30`). Raw engine connections skip `_write_lock`,
  but a write through one waits on SQLite's 120 s busy timeout.

Verified that none occur in `app/` now. I ran an over-approximating copy of the
guard: attribute calls resolve by bare name to every sync def in `app/`, and
`get_search_engine`, `get_write_lock` and `_write_lock_held` count as
factories. Its only hits were `_SILENCE_*_RE.search` in
`workers/transcription/splitter.py:316,320`, which are false positives. Further
scans found: no blocking callable referenced inside an async def except as the
argument to `to_thread`/`run_in_threadpool`/`run_in_executor`; no lambda calling
a blocking def outside those; no direct `.query/.execute/.commit` on a
session/conn/engine inside an async def; no DB-touching properties; no relative
imports (which `bind_imports` skips at `:62`).

## Checked, no finding

- **Q3, plain `def` handlers** (`get_transcript`, `get_clip_timestamps`,
  `get_frame`, `get_suggested_tags`, `dismiss_suggested_tags`, `/status`): they
  run on anyio's worker pool (CapacityLimiter 40), separate from asyncio's
  default executor. `/status` polling at 10 s would need about 400 s of hold to
  fill it, longer than `WriteLockTimeout` (300 s). In normal use they cannot
  exhaust it. Previously the same waits blocked the whole loop.
- **Admin settings screen** (`manifest.json` `admin-intelligence-sections` →
  `/admin/{features,llm,llm/exposure,embedding,rag,transcription}`): only
  `/embedding` touches the DB, through `get_search_db_read` in `to_thread`. It
  cannot wait on the write lock, only on finding 2's pool exhaustion.
- **Removing `_PENDING`**: the zero-offender assertion now covers all of `app/`
  except `evals/`. `test_guard_covers_the_service_tree` and every detector
  self-test are unchanged. The removed tests only exercised the removed
  helpers. The guard, reindex, write-lock-discipline and refine-endpoint tests
  pass at `b6eeaea` (63 passed).
- **Reindex claim** (`files.py:278-336`): the `is_queued`/`_reindex_in_flight`
  check and the claim have no `await` between them, and `finally` releases on
  the 404 path.
- **Refine split** (`routers/refine.py:112-126,186-193`): no other caller uses
  the old `start_refine_job(session, …)` signature, and `create_task` stays on
  the loop.
- **Ask's bound LLM client**: `to_thread` copies contextvars, so
  `llm_routing.bound_client()` resolves the same profile in the offloaded
  `assemble_contexts` / citation builders. No offloaded helper (transitively)
  calls loop-bound asyncio APIs.
- **BackgroundTasks targets** (`generate_summary`, `generate_detailed_summary`,
  `_recalculate_citations`) are `async def` and so inside the guard's scope.

TOTAL: 3 findings
