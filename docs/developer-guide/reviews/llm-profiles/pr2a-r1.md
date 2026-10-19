# PR-2a review, round 1

Reviewed SHA: `0a2fd4f712539bb6f203d2ca8699a7f54aab7bca` (intelligence addon, parent `dcce2f7`).
Worktree: `scratchpad/wt-intel-pr2a`. Baseline: full `tests/` green at this SHA.

## Touch-point question: where does the diff reach that the list does not name?

1. **`app/llm_routing.py` `retry_later`** — a new in-memory deferred-requeue
   mechanism (sleep 30 s, then call the worker's `enqueue`). The list names the
   resolver's inputs (`config.py`, `llm.py`, `policy_client.py` for `llm_cloud`)
   but not a requeue state. Through it the diff reaches each worker's
   **`enqueue` gate**, which runs its own per-feature policy lookup:
   `is_file_feature_enabled` (fail-open) for auto_tags / summaries /
   retrieval_keywords, and `is_chapter_suggestions_enabled` (fail-closed) for
   chapters. Those gates decide whether a deferred job survives (finding F1).
2. **`llm_routing._PROFILE_KEYS`** — `output_language` removed from the keys a
   profile may carry. This is load-time validation from PR-1: a profile that
   carries `output_language` now makes the whole `llm.profiles` section invalid,
   i.e. every LLM feature skips (finding F6).
3. **`app/indexer.py` enqueue fan-out** (not edited, but reached via the
   `main.py` start-up change): summaries / chapter / retrieval_keywords workers
   now run when the global client is disabled, so the indexer's on_index
   enqueues now drain (each job resolves and skips) instead of accumulating in a
   queue with no consumer.
4. **`generate_detailed_summary` `DETAILED_STATUS_FAILED` write** removed for the
   disabled-client case — reaches the detailed-status state machine the
   frontend polls (a `file_summaries` column, not listed as a touch point
   beyond provenance).
5. **`app/routers/files.py` auto-tags regenerate / batch** — *not* reached by the
   diff, although they are LLM-feature routers listed under "router `enabled`
   checks". They still delete/enqueue without resolving (finding F4).

Everything else the diff touches (the five workers, their routers, `main.py`
start-up gating, provenance `model` values) is on the list.

## Mutation table

Test set (unless noted): `test_llm_routing_callers test_auto_tags test_summaries
test_chapter_suggestions test_retrieval_keywords_worker test_refine_endpoints
test_detailed_summary_endpoints test_detailed_edit_endpoints
test_file_insights_regenerate test_llm_routing`.

| # | file | mutation | want | got |
|---|---|---|---|---|
| M01 | workers/auto_tags.py:246 | resolve with `""` instead of the file's drive | kill | KILLED |
| M02 | workers/auto_tags.py:246 | feature `summaries` instead of `auto_tags` | kill | KILLED |
| M03 | workers/auto_tags.py:248 | Defer: drop `retry_later` | kill | KILLED |
| M04 | workers/auto_tags.py:247-249 | Defer handled as Skip (falls through to local) | kill | KILLED |
| M05 | workers/auto_tags.py `_tags_via_llm` | model suffix from `settings.llm.model` | kill | KILLED |
| M06 | workers/summaries.py:1277 | resolve with `""` drive | kill | KILLED |
| M07 | workers/summaries.py:1280 | short Defer: drop `return` (detailed still runs) | live | LIVE (harmless: detailed resolves on its own) |
| M08 | workers/summaries.py:1292 | detailed resolves `summaries` | kill | KILLED |
| M09 | workers/summaries.py:1294 | detailed Defer: drop `retry_later` | kill | **LIVE** → F6 |
| M10 | workers/summaries.py `_generate_short_long` | stored model from `settings.llm.model` | kill | KILLED |
| M11 | workers/summaries.py `generate_detailed_summary` | `model = settings.llm.model` (status + stored row) | kill | **LIVE** → F8 |
| M12 | workers/summaries.py `generate_detailed_summary` | send through `get_llm_client()` | kill | KILLED |
| M13 | workers/retrieval_keywords.py:228 | resolve with `""` drive | kill | KILLED |
| M14 | workers/retrieval_keywords.py | model label from `settings.llm.model` | kill | **LIVE** → F8 |
| M15 | workers/retrieval_keywords.py:232 | drop the Skip guard | kill | LIVE — equivalent today: `Skip.client` raises inside the `try` at :311 and is swallowed, nothing written |
| M16 | workers/chapter_suggestions.py:361 | resolve with `""` drive | kill | **LIVE** → F5 |
| M17 | workers/chapter_suggestions.py:361 | feature `summaries` | kill | KILLED |
| M18 | workers/chapter_suggestions.py:363 | Defer: drop `retry_later` | kill | KILLED |
| M19 | workers/chapter_suggestions.py (INSERT) | model from `settings.llm.model` | kill | **LIVE** → F8 |
| M20 | workers/chapter_suggestions.py:365 | drop the Skip guard | kill | **LIVE** → F7 (emits `failed` event on Skip) |
| M21 | workers/refine.py:644 | `llm = get_llm_client()` instead of `resolved.client` | kill | **LIVE** → F5 |
| M22 | routers/refine.py (both) | `require_llm("")` | kill | KILLED (by the single-file test only) |
| M35 | routers/refine.py folder | `require_llm("")` in `refine_folder` only | kill | **LIVE** → F5 |
| M36 | routers/refine.py file | feature `summaries` | kill | KILLED |
| M23 | routers/summaries.py:261 | remove the gate from `regenerate_summary` | kill | **LIVE** → F9 |
| M24 | routers/summaries.py | move the gate after DELETE + re-embed | kill | **LIVE** → F9 |
| M25 | routers/summaries.py:469 | remove the gate from `batch_summaries` | kill | **LIVE** → F9 |
| M26 | routers/summaries.py (regenerate_detailed) | `generating` status model from `settings.llm.model` | kill | **LIVE** → F8 |
| M27 | routers/summaries.py `_require_detailed_enabled` | resolves `summaries` | kill | **LIVE** → F5 |
| M28 | routers/summaries.py `_require_llm_enabled` | resolves `detailed_summaries` | kill | **LIVE** → F5 |
| M34 | routers/summaries.py (both BackgroundTasks) | pass a `summaries`-resolved profile | kill | KILLED |
| M29 | routers/chapter_suggestions.py | remove `require_llm` | kill | **LIVE** → F9 |
| M37 | routers/chapter_suggestions.py | resolves `summaries` | kill | **LIVE** → F5 |
| M30 | routers/llm_gate.py | Defer → 400 | kill | KILLED |
| M31 | routers/llm_gate.py | Skip passes the gate | kill | KILLED |
| M32 | llm_routing.py:306 | drop `await asyncio.sleep(delay)` (hot requeue) | kill | **LIVE** → F10 |
| M33 | llm_routing.py `_PROFILE_KEYS` | allow `output_language` again | kill | KILLED |
| M38 | main.py | re-gate summaries worker start on `llm_client.enabled` | kill | **LIVE** → F10 |
| M39 | workers/auto_tags.py:260 | local-only label changed | kill | KILLED |

20 of 39 mutants live; M07 was expected and M15 is equivalent, leaving 18 unexpected survivors.

## Findings

### F1 — A deferred chapter job is dropped by its own retry (inv 2) [introduced] — Medium

`retry_later` calls `ChapterSuggestionsWorker.enqueue`, whose gate
`is_chapter_suggestions_enabled` (chapter_suggestions.py:50-65, :281) is
**fail-closed**. `DEFER_RETRY_SECONDS` (30 s) equals the policy cache TTL
(`policy_client._TTL_SECONDS`, 30 s), so when the retry fires the cached
`chapter_suggestions` answer has expired; if the policy backend is still down
the gate returns False and `enqueue` returns without queuing. The job is gone:
deferred once, then skipped — the opposite of inv 2. For `on_index` it comes
back only on the next restart's `enqueue_unprocessed`; a manual (force)
generate never comes back.

Context, [pre-existing]: `_process_file` also calls the fail-closed gate
(:359) *before* `resolve`, so during an outage longer than the TTL the job is
silently dropped there and never reaches the Defer branch at all. At the parent
this was the only behaviour; the new Defer path is reachable only in the window
where the `chapter_suggestions` answer is cached but the `llm_cloud` lookup
fails, and in exactly that window the retry is lost.

Reproduction (reviewer test, run against a `git archive` of the SHA):
backend down (`httpx.AsyncClient.get` raises `ConnectError`), fresh cached
`chapter_suggestions=True`, routing with one offhost profile →
`_process_file(force=True)` defers (1 retry scheduled); clear the policy cache
(TTL elapsed); `await retry()` → `False`, `worker._queue.qsize() == 0`.
Output: `F1 requeue result: False qsize: 0`.

Suggested fix (not applied): the retry should put the job back on the queue
without the fail-closed enqueue gate (the `_process_file` recheck still guards
the send), or the chapter gate should use the tri-state `lookup_feature` so an
"unknown" answer defers instead of skipping — which also removes the
pre-existing drop at :359.

### F2 — A stale forced chapter retry re-runs after a later success and resets the user's decision [introduced] — Low

While a deferred job waits in `retry_later`, the file is in neither `_queued`
nor `_processing`, so the dedupe in `enqueue` (chapter_suggestions.py:283)
does not see it. If the user generates again once policy is back, that run
completes, and the user dismisses/accepts the candidates, the stale retry then
fires with `force=True`: a second LLM run, and the upsert resets
`status='pending'` with new chapters.

Reproduction: Defer (`force=True`) → user `enqueue(force=True)` + process with a
resolved fake → `UPDATE suggested_chapters SET status='dismissed'` → `await
retry()` returns True, processing it → status `pending`, FakeLLM calls 2 → 4.
Output: `F2 status after stale retry: pending calls: 2 4`.

Suggested fix: count the deferred file as pending (e.g. keep it in `_queued`
until the retry runs, so a new request coalesces with it), or drop the retry when
a newer enqueue for the same file happened.

### F3 — auto_tags on Skip writes a row, and the file is never revisited when routing later allows it (inv 11, spec §5 "skip writes nothing … picked up again") [introduced] — Medium, design question for the supervisor

auto_tags.py:250-260 + :281: on `Skip` the worker stores `clip+tfidf`
suggestions. The commit message says this is deliberate. But after that row
exists, `_has_suggested_tags` (:217), `enqueue_unprocessed`'s
`NOT IN (SELECT file_id FROM suggested_tags)` (:169) and the indexer's
`no_tags` gate never select the file again, so a drive whose `llm_cloud` is later
turned on (or which gains a `local_fallback`) keeps local-only suggestions until
someone presses regenerate per file. The spec's Skip contract ("no insight row …
the file is picked up again if routing later makes it routable") is not met for
this feature. What is new: at the parent a drive with an enabled LLM always got
LLM tags; the `llm_cloud: false` → Skip → local row path exists only because of
this change. Held by `test_auto_tags_skip_keeps_local_candidates_without_an_llm`
(the test asserts the row is written).

Nothing leaves the host on this path: `_generate_candidates` (CLIP zero-shot on
stored vectors, TF-IDF, k-NN) is local, and `resolve` returns before any client
is touched.

Options: write nothing on Skip (matches inv 11), or keep local suggestions but
mark them (e.g. model label) so the on_index sweep re-queues `clip+tfidf`-only
rows when the drive becomes routable. Needs a supervisor decision; I do not
assign the bucket.

### F4 — Short summary generated on a drive that turned `summaries` off [pre-existing] — Medium (ledger)

`SummariesWorker.enqueue` accepts a file when `detailed_summaries` is on for its
drive even if `summaries` is off, and `_process_file` computes `want_short`
(summaries.py:1246-1249) from the global mode only, never from the drive policy.
The file's transcript is sent for a short/long summary on a drive whose owner
disabled that feature. `llm_cloud` is still honoured (resolve runs), so inv 1
holds; the per-drive feature policy does not.

Reproduced identically at the SHA (`F3 short-summary LLM calls on a
summaries-off drive: 1`) and at parent `dcce2f7` (`F3 parent calls: 1`), so
[pre-existing].

### F5 — Drive and feature passed to `resolve` are unheld for chapters, refine and the summaries/chapter routers (inv 1) [introduced] — Medium

The following mutants survive the whole relevant suite:

- M16: chapter worker resolves with `""` instead of the file's drive. The only
  chapter routing test checks `[feature for _, feature in asked]`, not the drive.
- M21: `_run_refine_job` sends through the global `get_llm_client()` instead of
  the router-resolved client — exactly the regression this PR removes, and
  nothing fails.
- M35: `refine_folder` resolves with `""` (only `refine_file` is tested).
- M27 / M28 / M37: the summaries, detailed and chapter routers resolve the wrong
  feature (so e.g. a detailed summary is sent through the profile assigned to
  `summaries`).

Suggested fix: assert `asked == [(<file's drive>, <feature>)]` in the chapter
worker test; a refine job test whose fake resolved client records the call while
`get_llm_client` is patched to raise; the same `asked` assertion for
`refine_folder` and the three routers.

### F6 — Detailed on_index Defer is unheld (inv 2) [introduced] — Low

M09: dropping `retry_later` in the detailed branch (summaries.py:1294) loses the
job silently; no test covers the detailed Defer branch (only Skip). Add a
parametrised Defer row to `test_detailed_on_index_resolves_its_own_feature`.

### F7 — Chapter Skip guard is unheld; without it a Skip emits a `failed` event (inv 11) [introduced] — Medium

M20: removing `if not isinstance(resolved, Resolved): return`
(chapter_suggestions.py:365) survives. With it removed, `resolved.client` on a
`Skip` raises `AttributeError` inside the `try` at :377, the `except` at :454
catches it and emits `_FAILED_EVENT` with `reason: generation_error` — an event
on a skipped job. No chapter test drives a `Skip`. Add a Skip row alongside
`test_deferred_policy_sends_nothing_and_retries` asserting no row, no emitted
event, no retry.

### F8 — Stored/status model labels are unheld in four places [introduced] — Low

M11 (`generate_detailed_summary`: `generating` status and stored row), M14
(retrieval_keywords label), M19 (chapter row), M26 (regenerate_detailed
`generating` status) all survive being switched back to `settings.llm.model`.
M19 survives because the chapter tests set `settings.llm.model="test-model"`
and `use_llm(..., model="test-model")` — the same value, so the expectation
cannot tell the two sources apart (detector rule 5). Provenance proper is PR-2b,
but these values are written by this PR. Use a routed model name that differs
from the global one and assert it on the stored row.

### F9 — "Routers resolve before changing any state" is unheld for summaries regenerate/batch and chapter generate (inv 9) [introduced] — Medium

M23 (gate removed from `regenerate_summary`), M24 (gate moved after the
`DELETE FROM file_summaries` + re-embed), M25 (gate removed from
`batch_summaries`) and M29 (gate removed from the chapter generate route) all
survive. M24 is the inv-9 case: a regenerate on a drive that no longer
resolves would delete the stored summary and enqueue a job that skips, and no
test notices. Only `regenerate_detailed_summary` and `refine_file` have the
"rejects before touching" test. Add the same shape for `regenerate_summary`
(DELETE not executed on Skip/Defer) and `batch_summaries`/chapter (nothing
enqueued).

Related, not reached by the diff: the auto-tags regenerate route
(routers/files.py:931-955) still deletes `suggested_tags` before anything
resolves. With F3's current behaviour that replaces LLM suggestions with
local-only ones on a drive that now skips; it is a user-initiated regenerate,
so I do not count it as an inv-9 break, but it is the one LLM regenerate route
that behaves differently from the rest.

### F10 — `retry_later` delay and "workers always start" are unheld; defer cycles have no backoff [introduced] — Low

- M32: removing `await asyncio.sleep(delay)` survives — that turns every Defer
  into an immediate requeue, i.e. a hot loop against a down policy backend. The
  only test uses `delay=0`. Assert the requeue has not run before the delay.
- M38: gating the summaries worker start on `llm_client.enabled` again survives;
  nothing tests the new "workers always start" start-up (spec §5). Then the
  indexer's on_index enqueues would accumulate in a queue with no consumer.
- The retry is a fixed 30 s with no backoff for as long as the outage lasts, and
  auto_tags runs its CPU-heavy candidate pass (auto_tags.py:236, "tens of
  seconds" per its own comment) *before* `resolve`, so a deferred auto_tags file
  recomputes candidates every cycle. Resolving before Phase 1 (keeping
  candidates for the Skip branch) avoids that.

### F11 — `output_language` in a profile now disables the whole routing [introduced] — Low (B)

`_PROFILE_KEYS` drops `output_language` (llm_routing.py:49), and an unknown key
makes `build_routing` return `_disabled(...)`, so every LLM feature skips with
one error log line. A YAML written against PR-1 (which accepted and tested the
key) loses all LLM features on upgrade instead of having one key ignored. Only
matters if PR-1 reached anyone's config; if not, nothing to do.

## Security notes (no finding)

- Every worker resolves with `indexed_file["drive"]` / the file row's drive, not
  a caller-supplied value. Routers resolve with the `X-Lit-Drive` drive and then
  confine the file to that drive (`_require_file_in_drive`,
  `_fetch_indexed_file(..., drive)`, `filter_transcript_file_ids(session, drive, …)`,
  `_require_allowed`), so the router-resolved profile is always the file's
  drive's. A `503`/`400` from the gate precedes the 404 but does not depend on
  the file, so it reveals nothing about other drives.
- Refine and manual detailed summaries hand the request-time `Resolved` to the
  background job; a later routing change does not re-route a running job
  (consistent with inv 8).
- No path in the six workers still sends through `get_llm_client()` or stores
  `settings.llm.model`; the remaining users are vision, video_visual, RAG and
  `main.py` `/status`, all out of scope for 2a.

TOTAL: 11 findings
