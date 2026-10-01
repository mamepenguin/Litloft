# PR-2b round 1 — vision / video visual / refine provenance

Reviewed tree: `6239fbf0babbe54ba1a8bd2dbbc508c4d77cfd3b` (commits `6d80dc36`, `6239fbf0` on `e33c44c`),
worktree `scratchpad/wt-intel-pr2b`. Baseline: `tests/` 2872 passed, 2 skipped.

In-scope invariants: 1, 2, 7 (model only), 9, 11.

## Touch-point question: where does the diff reach that the list does not name?

The list names `config.py`, the vision / video_visual / refine workers, `main.py` start-up gating,
router `enabled` checks, `video_visual_runs` / `transcript_chunks` provenance and the
"already described" checks. Places the diff reaches that are **not** in it:

1. **`app/llm_routing.py` itself** — `_Active.settings` identity check in `_current()` and the new
   `has_vision_profile()`. The resolver module is PR-1 territory, but these change its cache
   lifetime: every read of `_current()` now compares `app.config.settings` identity, and
   `has_vision_profile` builds a client for **every** profile (not only routed ones). This is
   reached from every `is_vision_describe_available` / `is_video_visual_index_available` call,
   i.e. per HTTP request in `routers/vision.py` and `routers/video_visual.py` (GET status too)
   and per `enqueue`.
2. **`routers/video_visual.py`** (`_require_available`, status `available=`) — not edited, but its
   meaning changed through `is_video_visual_index_available` (now "some profile has vision",
   previously "global `vision_model` set"). The route previously did not check `llm_client.enabled`;
   now it does, indirectly.
3. **`VideoVisualWorker.retry()`** — not edited, but it re-queues an existing run whose
   `vision_model` was stamped at the original enqueue, and processing now resolves anew
   (see F2).
4. **`VisionDescribeWorker.requeue_abandoned` / `enqueue_unprocessed`** — not edited, but they read
   `visual_description_status`, which the new `_clear_pending` rewrites to NULL (F1), and the
   new await inside `_should_accept` (F9).
5. **`_should_accept` concurrency** in both workers — a new `await llm_routing.resolve(...)` now sits
   between the "already queued / in flight" check and the claim (F9).

Candidates for a missing invariant: 1 (per-request client construction / availability meaning) and
5 (duplicate work). Neither is covered by an existing invariant; see F8/F9.

## Mutation table

Suite for every row: `test_vision_worker test_video_visual_worker test_vision_config test_vision_endpoints
test_refine_migration test_refine_speaker_id_clearing test_llm_routing test_llm_routing_callers
test_video_visual_router test_refine_batch test_refine_endpoints test_refine_aligner test_vision_llm_client`
(322 tests). Each mutation applied alone, tree restored with `git checkout -- .` after each.

| id | where | mutation | want | result |
|---|---|---|---|---|
| M01 | workers/vision.py:743 | stored/sent model ← `settings.llm.vision_model` | kill | KILLED (`test_the_description_records_the_routed_vision_model`) |
| M02 | workers/vision.py:581 | success sticky only for same routed model | kill | KILLED (`test_success_stays_done_under_a_different_model`) |
| M03 | workers/vision.py:587 | unsupported compared with `settings.llm.vision_model` instead of routed | kill | **LIVE** → F6 |
| M04 | workers/vision.py:741 | drop `_clear_pending` on unresolved process | kill | KILLED (`test_a_claim_the_drive_can_no_longer_serve_is_dropped`) |
| M05 | workers/vision.py:356 | drop `AND status = 'pending'` guard in `_clear_pending` | kill | LIVE (only reachable when `_process_file` is driven without `enqueue`; noted, no finding) |
| M06 | workers/video_visual.py:600 | run `vision_model` ← `settings.llm.vision_model` | kill | KILLED (`test_the_run_records_the_routed_vision_model`) |
| M07 | workers/video_visual.py:546 | unsupported sticky compared with `settings.llm.vision_model` | kill | **LIVE** → F6 |
| M08 | workers/video_visual.py:546 | unsupported sticky regardless of model | kill | KILLED (`test_unsupported_sticky_clears_on_model_change`) |
| M09 | workers/video_visual.py:936 | first scene call via global `get_llm_client()` | kill | **LIVE** (masked by the repair retry, which still uses `resolved.client`) → F7 |
| M09b | workers/video_visual.py:958 | repair call via global client | kill | KILLED |
| M10 | workers/video_visual.py:785 | only Defer/None fail the run; Skip proceeds | kill | KILLED |
| M11 | workers/video_visual.py:538 | accept-time `vision=False` | kill | **LIVE** → F5 |
| M12 | workers/vision.py:571 | accept-time `vision=False` | kill | **LIVE** → F5 |
| M13 | workers/vision.py:733 | process-time `vision=False` | kill | **LIVE** → F5 |
| M14 | workers/video_visual.py:781 | process-time `vision=False` | kill | **LIVE** → F5 |
| M15 | workers/vision.py:571 | accept-time drive hard-coded `"family"` | kill | **LIVE** → F5 |
| M16 | workers/vision.py:733 | process-time drive hard-coded `"family"` | kill | **LIVE** → F5 |
| M17 | workers/video_visual.py:538 | accept-time drive hard-coded `"family"` | kill | **LIVE** → F5 |
| M18 | llm_routing.py:322 | `has_vision_profile` ignores `client.enabled` | kill | KILLED (`test_a_disabled_client_reads_as_not_configured`) |
| M19 | llm_routing.py:322 | `has_vision_profile` ignores `vision_model` | kill | KILLED (`test_missing_vision_model_is_rejected`) |
| M20 | llm_routing.py:246 | drop settings-identity staleness check | kill | KILLED |
| M21 | llm_routing.py:320 | always use cached `_current()` even for a foreign settings object | kill | KILLED |
| M22 | llm_routing.py:321 | `any` → `all` over profiles | kill | LIVE (every test has one profile; see F8) |
| M23 | workers/refine.py:648 | `refined_model = settings.llm.model` (a NameError in this module) | kill | **LIVE** → F4 |
| M24 | workers/refine.py:755 | drop per-chunk `orm.refined_model = …` | kill | **LIVE** → F4 |
| M25 | workers/refine.py:393 | drop `refined_model` in `rechunk_from_words` | kill | KILLED (`test_rechunk_drops_speaker_id_on_new_chunks`) |
| M26 | database.py:1018 | skip the `refined_model` migration | kill | KILLED (`test_migration_adds_refined_model`) |
| M27 | workers/refine.py:648 | `refined_model = profile.config.vision_model` | kill | **LIVE** → F4 |

## Findings

### F1 — A process-time unresolved job hides an existing description and hands it to the automatic sweep (inv 9) [introduced] — Medium

`workers/vision.py:737-742` → `_clear_pending` (`:352-359`) sets `visual_description_status = NULL`
but keeps `visual_description` / `_model` / `_generated_at` and the `vision_description` embedding.
A row that was `success` goes to `pending` on a manual regenerate (`_mark_pending`, `:330`), so if
the resolve at process time is Skip **or Defer** (a transient `llm_cloud` lookup failure is enough),
the described file ends with status NULL.

Consequences, both observed or read from code:
- `VisualDescriptionSection.tsx:363` renders the description only when `status === "success"`, and the
  poll loop (`:130`) does not stop on a NULL status. The description disappears from the UI while it
  is still in the DB and in retrieval.
- `enqueue_unprocessed` (`:680-689`, run at startup when `on_index`) selects `status IS NULL`, so the
  next sweep automatically regenerates a file that was already described — the thing spec §7 says a
  routing change never triggers. The same reset turns an earlier `failed` (manual-retry only) or
  `unsupported` row into "never attempted".

Reproduction (probe, 6239fbf): write `success`/"A cat."/`old-vision`; `enqueue(manual=True)`;
`use_llm(result=Skip(...))`; `_process_file` → row `('A cat.', None, 'old-vision')`; a fresh worker's
`enqueue_unprocessed()` → `1` queued. `_clear_pending` is new in this change, so no parent run.

Suggested fix: do not reset to NULL; restore what the row held before the claim (e.g. `success` when a
description is present, otherwise NULL), or record the pre-claim status at `_mark_pending` time and
put it back. Add a row with a pre-existing `success` to
`test_a_claim_the_drive_can_no_longer_serve_is_dropped` (Skip and Defer).

### F2 — A video visual run records the model resolved at enqueue, not the one that described its scenes (inv 7) [introduced] — Medium

`enqueue` stamps `VideoVisualRun.vision_model` from the accept-time resolve
(`workers/video_visual.py:600`), then `_process_run` resolves again (`:780-787`) and every scene is
sent to that second profile (`:822`, `:936`). Nothing updates the run when the two differ. They differ
whenever routing or `llm_cloud` changes between enqueue and claim (a queued on_index backlog runs for
hours; flipping a drive to `llm_cloud: false` makes the second resolve pick `local_fallback`), and
always for `retry()` (`:612-667`), which re-queues an old run without touching its model.

Reproduction (probe): enqueue with routed `cloud-vision`; switch resolve to `local-vision`; seed a
pending scene; `_process_run` → scenes described by `local-vision`, run row still says `cloud-vision`.
At the parent both values came from `settings.llm.vision_model`, so they could not diverge through
routing.

Suggested fix: write `run.vision_model = resolved.profile.config.vision_model` in `_process_run`
after the process-time resolve (or on the first scene write), so the stored model is the one used.

### F3 — A deferred video visual run is written as a failed run and never swept again (inv 2, inv 11) [introduced] — Medium

`workers/video_visual.py:780-787`: any non-`Resolved` result, including `Defer`, goes to
`_fail_run(run_id, "PolicyDisabled")`. Inv 2 requires a job whose `llm_cloud` lookup failed to write
nothing so a later sweep or request picks it up; here it writes a `failed` run, and
`enqueue_unprocessed` (`:669-687`) skips every file that has any run, so the on_index sweep never
returns to it. PR-2a settled this shape for the text workers (pr2a-r3: Defer writes nothing), and
the vision worker in this same change clears its claim instead (`vision.py:737-742`).

Reproduction (probe): `enqueue(on_index)`; `use_llm(result=Defer(...))`; `_process_run` → run
`('failed', 'PolicyDisabled')`; `use_llm(MagicMock())`; `enqueue_unprocessed()` → `0`.

The Skip half of the same branch is asserted deliberately by
`test_a_run_the_drive_can_no_longer_serve_fails_without_a_call`; inv 11 says a skipped job writes no
failed job record, so whether a `failed` run counts as one is for the supervisor. The Defer half has
no test.

Suggested fix: on Defer (and, if inv 11 is read strictly, on Skip), delete a staged run that has no
scenes, or return it to `queued` without re-claiming it in a loop; do not write `failed`.

### F4 — Refine's recorded model is not held by any test (inv 7) [introduced] — Medium (test gap)

No test runs `_run_refine_job` (`grep -rl _run_refine_job tests/` is empty). M23
(`refined_model = settings.llm.model`, which is a `NameError` in `workers/refine.py` because the module
only imports `app.config as config` — the job would die before its `try`), M27 (stamp the vision model)
and M24 (drop the per-chunk `orm.refined_model` write at `:755`) all survive. Only
`rechunk_from_words(refined_model=...)` is held, with the value passed in by the test. A test that
lets an inv 7 breach through is an A.

Suggested fix: one test that drives `_run_refine_job` with `resolved_with(client, model="routed")`
over two chunks with a stubbed aligner, and asserts `refined_model == "routed"` on the resulting
chunks — once with rechunking yielding rows and once yielding none (the per-chunk path is what
survives when `rechunk_from_words` returns nothing).

### F5 — The file's drive and `vision=True` are not held at any of the four vision resolve sites (inv 1) [introduced] — Medium (test gap)

M11–M17 all survive: hard-coding the drive to `"family"` or passing `vision=False` at
`vision.py:571`, `vision.py:733`, `video_visual.py:538`, `video_visual.py:781`. Every vision / video
fixture seeds its eligible file on `family`, so `asked == [("family", …)]` cannot tell the file's
drive from a constant, and the `use_llm` stub (`tests/conftest.py`) ignores `vision` unless the
vision model is empty, which no acceptance test sets. The drive argument is what inv 1 rests on:
resolving with any drive but the file's checks the wrong drive's `llm_cloud` and can send image bytes
or frames off-host for a `llm_cloud: false` drive. `vision=False` would let a `local_fallback` without
a `vision_model` resolve and then write a `failed` row (inv 11) instead of skipping.

Suggested fix: seed an eligible file on a second drive and assert the resolver was asked with that
drive and `vision=True` (extend `asked` in `use_llm` to record the flag), at accept and process time in
both workers.

### F6 — "Unsupported" stickiness against the routed model is unheld (inv 9 adjacent) [introduced] — Low (test gap)

M03 / M07 survive: comparing the stored unsupported model with `settings.llm.vision_model` instead of
the routed profile's. `use_llm` defaults the routed vision model to `settings.llm.vision_model`, so
the two are always equal in the tests. Suggested fix: a row with routed `vision_model` different from
`settings.llm.vision_model` in `test_unsupported_same_model_does_not_retry` and
`test_unsupported_sticky_clears_on_model_change`.

### F7 — The first scene call's client is masked by the repair retry [introduced] — Low (test gap)

M09 survives: sending the first scene request to the global client raises (no client initialised),
becomes `FAILURE_REQUEST_FAILED`, and the repair call on `resolved.client` then succeeds, so
`test_…label…` still sees the label. Assert `llm.generate_video_scene_json.await_count == 1` in the
success-path scene test.

### F8 — Availability means "some profile has vision", not "this drive's routing can serve vision" [introduced] — Low

`has_vision_profile` (`llm_routing.py:311-324`) is true when **any** profile has a `vision_model`
and an enabled client, regardless of `routing.features.vision_describe` / `video_visual_index`. With
profiles `cloud` (vision) and `local` (text only) and the vision features routed to `local`, every job
resolves Skip (`llm_routing.py:305`), yet `main.py` starts both workers, the routes answer as
available, GET returns `status: null` instead of `unsupported/not_configured`, and every generate
answers 409 `llm_unavailable`. The routes have the drive (`require_drive`), so the spec's "does the
resolver yield a usable profile for (drive, feature)" is answerable there. Also: M22 (`any`→`all`)
survives because every test configures one profile. Not an invariant breach; bucket B unless the
supervisor reads spec §5 as binding. Clients are cached per profile in `_Active.clients`, so this
builds each client once per settings object, not per request — no hot-path finding.

### F9 — Concurrent enqueues of one file are both accepted (duplicate LLM spend) [introduced] — Low

Both `_should_accept`s now `await llm_routing.resolve(...)` between the "already queued / in flight"
check and the claim (`vision.py:568-575` then `enqueue` `:612-615`; `video_visual.py:521-543` then the
run insert `:593-606`). Two requests for the same file (double click, two tabs, the on_index CLIP hook
racing a manual click) both pass the check. The llm_cloud lookup for an offhost candidate is a
network call on a cache miss, so the window is real.

Reproduction: resolve stubbed with `await asyncio.sleep(0.01)`; `asyncio.gather` of two
`enqueue(manual)` → vision: both `accepted`, `_queue.qsize() == 2`; video: two `queued` runs. Parent
`e33c44c` with the policy lookup slowed the same way: second call `already_queued`, qsize 1 / one run
— at the parent there is no await between the check and the claim. No invariant covers duplicate
work; bucket B.

Suggested fix: resolve before the in-flight check, or re-check `_queued` / in-flight after the await
(vision: add to `_queued` before awaiting and discard on refusal).

### Pre-existing, one line each

- [pre-existing] `requeue_abandoned` → `enqueue(manual=True)` refused (policy/llm_cloud lookup failed,
  or Skip) leaves the row `pending`; `enqueue_unprocessed` skips `pending`, so only a manual request
  or the next restart frees it. Same at `e33c44c` for a failed policy lookup; this change adds the
  Skip / Defer reasons to the same path.

TOTAL: 9 findings
