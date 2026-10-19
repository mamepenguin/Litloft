# PR-2c round 2 — fix commit reviewed on its own

Reviewed tree: `92be2340a6066a64dda0b92d6fcb8298acecfde2` (parent `ecad3c1a`), worktree `scratchpad/wt-intel-pr2cr2`.
Record read: `invariants.md`, `pr2c-r1.md`, diffs of `2a449c78`, `ecad3c1a`, `92be2340`.
Baseline: full `tests/` = 2916 passed, 2 skipped.

## 1. Did the commit close F1–F8?

Suite for every mutation below unless noted: `S` = `test_llm_caller_inventory`, `test_llm_routing*`, `test_rag*`, `test_find*`, `test_evals_not_in_runtime`, `test_evals_stage3_location`, `test_main*`. `D` = `test_llm_caller_inventory` (+ `test_evals_not_in_runtime` where noted).

| r1 finding | closed? | reproducing mutation (this round's id) | result / killer |
|---|---|---|---|
| F1 eval stage 1/2 unbound | **yes, at `_run_routed`**; not at `main()` or inside stage 3 (N1) | M12 `_run_routed` calls `_run` outside `bound` | kill — `test_the_eval_runner_runs_every_stage_with_the_rag_profile_bound` |
| F2 `ValueError` from `reset` in another Context | **yes** | M8 restore the across-`yield` wrapper | kill — `test_a_stream_closed_from_another_context_does_not_raise`. r1 script `sse_ctx.py` rerun: parent `ecad3c1` logs `ValueError(... was created in a different Context)`, `92be234` logs nothing; semaphore released; concurrent streams each see their own client |
| F3 detector evasions | **mostly**: import alias (r1 M12) closed; `from app.llm_routing import _x` and `llm_routing._x` closed; module-alias access to privates still evades (N3) | M17 `from app.llm import create_llm_client as _mk` in `category_expander` | kill — `test_only_known_modules_import_the_client_types` |
| | | M20 `llm_routing._client_for(llm_routing._current(), default)` | kill — `test_nothing_reaches_into_the_resolver_or_the_eval_runner` |
| | | M21 `routers/rag.py`: `from app.evals import stages` | kill — both the new check and the pre-existing `test_evals_not_in_runtime::test_no_shipped_module_imports_an_eval_harness` (N4) |
| F4 wrappers untested | **wrappers yes; router half no** (N6) | M11 drop `bound` around `anext`; M23 `find_files` without `bound` | kill / kill — `test_the_stream_binds_its_profile_for_every_step`, `test_find_binds_its_profile_for_the_helpers` |
| | | M24 `/ask` hands `resolved=None` to `_sse_stream` (r1 M6) | **live** |
| F5 `/status` untested | **yes, for `_llm_status()`** | M25 swap provider/model; M26 `enabled=True` | kill / kill — `test_status_reports_the_default_profile` |
| | | M27 `status_endpoint` builds `LLMStatus` itself instead of calling `_llm_status()` | live — accepted by the triage's shape (helper extracted and held); not a finding |
| F6 eval-only guards | `resolve_without_ceiling` Skip **yes**; runner guard **no** (N2) | M28b drop the enabled/vision `Skip` in `resolve_without_ceiling` | kill — `test_resolve_without_ceiling_skips_an_unusable_profile` |
| | | M13 drop the `isinstance(routed, Resolved)` guard in `_run_routed` | **live** |
| F7 agentic loop's drive | **yes** | M29 `_run_agentic` passes `drive=None` | kill — `test_the_agentic_loop_is_given_the_asks_drive` |
| F8 kill switch / allowlist | **yes** | M1 gate ignores `agentic_mode` | kill — `test_the_agentic_gate_reads_the_bound_profile[True-off-False]` |
| | | M2 gate ignores `profile.agentic` | kill — `…[False-auto-False]`, `test_rag_stream_agentic::test_stream_answer_skips_agentic_when_model_not_allowlisted` |
| | | M3 gate re-admits the allowlist (`agentic or allowlisted`) | kill — `…[False-auto-False]` |
| | | M4/M5 legacy `agentic=False` / `True` | kill / kill — `test_the_legacy_profile_is_agentic_by_the_allowlist` |
| | | M6 non-legacy profile takes `agentic` from the inherited allowlist | kill — `test_a_profile_is_not_agentic_by_the_inherited_allowlist` |

## 2. What did it break?

### Invariant 4, legacy profile — gate parity with `71d8b97`

`scratchpad/r2/legacy_gate.py` enumerates `agentic_mode ∈ {off, auto, on}` × allowlist `{listed, not listed, empty model}` × client `{enabled+chat_with_tools, enabled without chat_with_tools (Ollama), disabled, none}` = 36 rows, running the real `_agentic_gate_open` at `71d8b97` (patched `settings.llm` + `get_llm_client`) and at `92be234` (real `build_routing({}, cfg, {})` → `Resolved` → `bound`). Output files `gate_wt-r2-base.txt` / `gate_wt-intel-pr2cr2.txt`: **identical**; open only for `auto|on` + listed + tool-capable client. (At `92be234` the "none" row is the `Skip` path: no binding, gate never reached — same observable result.) Invariant 4 holds.

`profile.agentic` is read only by the gate (`grep '\.agentic\b' app`), so computing it at build time cannot drift from `profile.config`: both come from the same `base`, and `llm-overrides.json` changes need a restart (`PUT /admin/llm` returns `restart_required`), which rebuilds both.

### Importing `app.rag.agentic` inside `build_routing`

- No cycle: five import orders (`app.rag.agentic` first, `app.config` → `is_vision_describe_available()`, `app.main` → `_llm_status()`, `app.evals.__main__`, `app.database` → `has_vision_profile()`) all complete.
- Cost: the first build now pulls `app.rag.*`, `app.rag.tools.*`, `app.search`, `app.database`, `app.workers.{clip,blip,embedder}`, numpy, sqlalchemy — 0.23 s measured in the test image. In the service they are already loaded by `main`; `has_vision_profile(foreign settings)` rebuilds per call but the import is cached.
- Eval runner: `_run_routed` now resolves (and so imports `app.database`) **before** `_setup_snapshot` sets `INTELLIGENCE_SEARCH_DB_PATH`. Safe: the path is read inside `init_search_db()` → `_resolve_search_db_path()` at call time, and `_search_engine` is `None` at import. Checked, no finding.

### Per-step stream wrapper

`scratchpad/r2/stream_edges.py` against `92be234`:

| case | observed |
|---|---|
| inner raises mid-stream | `KeyError` propagates to the consumer; inner `finally` saw the binding; binding `None` afterwards |
| consumer task cancelled mid-step | `CancelledError` propagates; inner `finally` saw the binding; `None` afterwards |
| `aclose()` after the inner is exhausted | no error |
| `aclose()` on an outer never started | no error |
| outer abandoned mid-stream, finalized by the asyncgen GC hook | inner `finally` ran with the binding; loop exception handler empty |

Between steps the consumer no longer sees the binding (at `ecad3c1` it leaked into the request task's Context while the generator was suspended). The only consumer, `routers/rag.py::_sse_stream`, calls `_format_sse_event` and `semaphore.release()` — no `bound_client()`/`bound_resolved()` reader; the `asyncio.gather` calls inside `_stream_answer` create their tasks during a step, so they copy the binding. Nothing lost.

### Eval runner

- Every stage runs under `_run_routed` when entered through `main()`; `run_case` → `run_stage1`/`run_stage2`/`run_stage3_once` has no other caller in `app/`, `tests/`, `scripts/`. `app/evals_citations` makes no LLM call.
- rag unrouted: `python -m app.evals` → stderr `No LLM profile serves rag: profile 'default' cannot serve rag`, **exit 2**, before touching the snapshot. At the parent the same config ran stages 1–2 unbound and raised `RuntimeError` in stage 3 (`run_case` always runs stage 3: `max(1, runs_stage3)`), so refusing up front loses no usable mode.
- M14 (`return 2` → `return 0`), M13 (guard deleted), M15 (stage 3 passes `resolved=None`), M16 (`main()` calls `_run` directly) all survive — N1, N2.

### Detector

- Not vacuous by construction: `test_nothing_reaches_…` asserts `== set()`, but it shares `_sources()` with `test_only_known_modules_import_the_client_types` and `test_only_the_resolver_and_the_factory_construct_clients`, whose declared non-empty expected sets fail on an empty scan.
- Comments and strings: M22 (a string literal `'from app.evals import x; llm_routing._current()'` plus a comment `# from app.llm import create_llm_client`) — want live, got live. AST only; detector rule 4 holds.
- `ast.Import` branch uses `startswith("app.evals")`, which also matches `app.evals_citations`/`app.evals_transcription`; `test_evals_not_in_runtime` forbids those too, so no false positive in practice.

## Mutation table

Tree restored with `git -C <wt> checkout -- .` after each; `git status --short` empty at the end.

| # | mutation | want | got | killer |
|---|---|---|---|---|
| M1 | gate: drop `agentic_mode == "off"` | kill | kill | `test_the_agentic_gate_reads_the_bound_profile[True-off-False]` |
| M2 | gate: drop `not profile.agentic` | kill | kill | `…[False-auto-False]`, `test_stream_answer_skips_agentic_when_model_not_allowlisted` |
| M3 | gate: `agentic or allowlisted` | kill | kill | `…[False-auto-False]` |
| M4 | legacy `agentic=False` | kill | kill | `test_the_legacy_profile_is_agentic_by_the_allowlist[auto-…-True]` |
| M5 | legacy `agentic=True` | kill | kill | same test, `False` rows |
| M6 | non-legacy `agentic` also from inherited allowlist | kill | kill | `test_a_profile_is_not_agentic_by_the_inherited_allowlist` |
| M7 | legacy `agentic` computed with `agentic_mode` forced to `auto` (gate still checks the mode) | live | **kill** | `…[off-…-False]` — behaviour-preserving change fails (N5) |
| M8 | stream: bind across `yield` (parent shape) | kill | kill | `test_a_stream_closed_from_another_context_does_not_raise` |
| M9 | stream: `aclose()` without `bound` | kill | kill | same |
| M10 | stream: no `aclose()` in `finally` | kill | kill | same |
| M11 | stream: no `bound` around `anext` | kill | kill | `test_the_stream_binds_its_profile_for_every_step` |
| M12 | `_run_routed` runs `_run` unbound | kill | kill | `test_the_eval_runner_runs_every_stage_with_the_rag_profile_bound` |
| M13 | `_run_routed` drops the `Resolved` guard | kill | **live** | N2 |
| M14 | `_run_routed` returns 0 on unrouted rag | kill | **live** | N2 |
| M15 | `run_stage3_once` passes `resolved=None` | kill | **live** | N1 |
| M16 | `main()` runs `_run` instead of `_run_routed` | kill | **live** | N1 |
| M17 | `category_expander`: `create_llm_client as _mk` + `_c.settings.llm` | kill | kill | `test_only_known_modules_import_the_client_types` |
| M18 | `category_expander`: `from app import llm_routing as lr`; `lr._client_for(lr._current(), …)` | kill | **live** | N3 (D) |
| M19 | `category_expander`: `import app.llm_routing`; `app.llm_routing._client_for(app.llm_routing._current(), …)` | kill | **live** | N3 (D) |
| M20 | `category_expander`: `llm_routing._client_for(llm_routing._current(), …)` | kill | kill | `test_nothing_reaches_into_the_resolver_or_the_eval_runner` |
| M21 | `routers/rag.py`: `from app.evals import stages` | kill | kill | new check **and** `test_evals_not_in_runtime` (N4) |
| M22 | string + comment containing the needles | live | live | — |
| M23 | `find_files` without `bound` | kill | kill | `test_find_binds_its_profile_for_the_helpers` |
| M24 | `/ask` hands `resolved=None` to `_sse_stream` | kill | **live** | N6 |
| M25 | `_llm_status` swaps provider/model | kill | kill | `test_status_reports_the_default_profile` |
| M26 | `_llm_status` `enabled=True` | kill | kill | same |
| M27 | `status_endpoint` bypasses `_llm_status()` | kill | live | accepted shape of the F5 fix |
| M28b | `resolve_without_ceiling` drops the enabled/vision `Skip` | kill | kill | `test_resolve_without_ceiling_skips_an_unusable_profile` |
| M29 | `_run_agentic` passes `drive=None` | kill | kill | `test_the_agentic_loop_is_given_the_asks_drive` |

## Findings

### N1 — Low — [introduced] — F1 is held at `_run_routed`, not at the entry point or inside stage 3 (M15, M16 live)

`test_the_eval_runner_runs_every_stage_with_the_rag_profile_bound` calls `_run_routed` directly with `_run` replaced. `main()` switching back to `asyncio.run(_run(args))` (M16) reintroduces F1 exactly — every stage unbound, stage 1/2 passthrough, stage 3 `resolved=None` — with the suite green. Likewise `run_stage3_once` now reads `llm_routing.bound_resolved()` (this commit), and replacing it with `None` (M15) is green: no test runs a stage under a binding.

Fix (not applied): drive the test through `main([...])` (a sync test; patch `_run` to record `bound_client()`), and add one `run_stage3_once` row asserting `answer_question` receives the bound `Resolved`.

### N2 — Low — [introduced] — the relocated eval guard and its exit code are untested (M13, M14 live)

The guard moved from `run_stage3_once` to `_run_routed`; r1 F6 asked for it to be held and it still is not. Without it, a `Skip` is bound and the first helper raises `AttributeError: 'Skip' object has no attribute 'client'`; `return 0` would report success for a run that did nothing. Fix: one `Skip` row in the runner test asserting `== 2` and that `_run` was not called.

### N3 — Low — [introduced] — module-alias access to the resolver's privates evades the new check (M18, M19 live)

`test_nothing_reaches_into_the_resolver_or_the_eval_runner` matches an `Attribute` only when its value is the bare `Name` `llm_routing`. `from app import llm_routing as lr; lr._current()` and `import app.llm_routing; app.llm_routing._current()` both hand a helper an offhost client without `resolve` — the ceiling bypass F3 was about — with the detector green. Fix: per module, collect the local names bound to the module (`import app.llm_routing as X`, `from app import llm_routing as X`) plus the dotted `app.llm_routing`, and match `_`-prefixed attributes on any of them.

### N4 — Low (B) — [introduced] — the new `app.evals` import check duplicates an existing, stronger detector

`tests/test_evals_not_in_runtime.py::test_no_shipped_module_imports_an_eval_harness` already fails on M21 (and on r1's M16 — r1 measured that mutation against the inventory file only). It also resolves relative imports, which the new check does not. No mutation is killed by the new `app.evals` branch alone (`tests.md`: delete it or fold it). Fix: drop the `app.evals` branches from `test_nothing_reaches_…`, keep the private-name part.

### N5 — Low (B) — [introduced] — the legacy-agentic test's `off` row holds a derivation, not behaviour (M7 killed while behaviour-preserving)

`profile.agentic` is read only by `_agentic_gate_open`, which checks `agentic_mode == "off"` itself. Computing the legacy flag without the mode (M7) changes no gate result, yet `test_the_legacy_profile_is_agentic_by_the_allowlist[off-…-False]` fails. It is a change check kept (`tests.md`). The gate-level `[True-off-False]` row already holds the kill switch. Fix: drop the `off` row, or assert through `_agentic_gate_open` instead of the field.

### N6 — Low — [introduced by `2a449c78`, not closed here] — `/ask`'s hand-off of the resolved profile is untested (M24 = r1 M6, live)

The F4 fix covered the service wrappers but not the router half r1 proposed. `/ask` passing `resolved=None` into `_sse_stream` makes every Ask end in `done{error}` (fail-closed, no invariant broken) with the suite green. Fix: one router test mirroring `test_find_hands_the_resolved_profile_to_the_service`, asserting `stream_answer` receives the `Resolved` for `X-Lit-Drive`.

### N7 — Low — [pre-existing] — the eval report records the top-level `llm.model`, not the rag profile that ran

`app/evals/__main__.py` `ReportMeta(llm_model=settings.llm.model, llm_base_url=settings.llm.base_url)`. With `llm.profiles` configured, the model that ran is `routed.profile.config.model`; the report (and `--baseline` comparisons read by an operator) names another. Same at `ecad3c1`. Now that `_run_routed` holds `routed`, the fix is to pass its profile's model/base_url into the meta.

## 3. Trajectory

Read in order: `2a449c78` (introduce the binding, per-profile gate), `ecad3c1` (test), `92be234` (this fix).

This round **removed one prediction and added one state**:

- **Removed:** the allowlist no longer opens the gate at request time for any profile; the gate is two conjuncts (`mode != off and agentic`) instead of a disjunction plus mode-in-allowlist. The allowlist survives as a build-time derivation for the legacy profile only. Net branches in the gate: equal; decisions made per request: fewer.
- **Added:** the stream wrapper grew a manual step loop, a second binding site and an explicit `aclose()` to manage the lifetime of the contextvar that `2a449c78` introduced. That is handling added for a mechanism, not for a case.
- Eval: resolve + guard moved from stage 3 to the runner (one branch removed, one added, `raise` → exit 2). Relocation.
- Detector: tests only.

Only one fix round exists so far, so the two-in-a-row test cannot fire. The one to watch is the contextvar: if the next round adds more handling around the binding's lifetime (another wrapper, another context hop), that is the second addition to the same mechanism, and passing `resolved` explicitly down the Ask path would be the design question.

TOTAL: 7 findings
