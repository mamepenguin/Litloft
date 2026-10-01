# PR-2c round 1 — Ask/Find/helpers per drive, global client removed, caller-inventory detector

Reviewed tree: `ecad3c1aec362ebda79b4b5974f00643ee1e8735` (commits `2a449c78`, `ecad3c1a` on `71d8b97`), worktree `scratchpad/wt-intel-pr2c`.
Baseline: full `tests/` = 2901 passed, 2 skipped. Mutation subset (inventory, routing, routing_callers, rag_*, find_*) = 698 passed.

## Touch points reached by the diff that are not in the invariants' touch-point list

The list names `app/rag/*`, `app/main.py`, `app/dependencies.py`, `app/evals/*`, router `enabled` checks. Reached and not listed:

1. **`app/routers/rag.py` `/status`-independent gate path via `app/routers/llm_gate.require_llm`** — covered by "router `enabled` checks"; not new.
2. **`app/main.py` `status_endpoint` (`/status` response `llm.provider/model/enabled`)** — `main.py` is listed only for "worker start-up gating". `/status` is an observable surface read by the dashboard; it now reports the *default* profile, not the profile any feature is routed to. No invariant covers it (no content is sent), so no candidate invariant — but it has no test at all (see F5).
3. **The `contextvars` binding (`llm_routing.bound`) held across `yield` in `service.stream_answer`, consumed by Starlette's `StreamingResponse`** — a lifetime/context surface outside every listed module's own control (Starlette iterates, asyncio finalizes). Candidate for inv 1 ("the profile resolved for the request's drive") only if it could leak across requests; measured: it does not (F2 is noise, not a leak).
4. **`tests/test_llm_caller_inventory.py`** — the detector itself; the list's "must stay unreachable" line for `app/evals/*` is what it enforces, but reachability is not what it measures (F3).
5. **The eval stage-1/stage-2 path (`app/evals/stages.py::run_stage1` → `transform_query_structured`)** — listed as `app/evals/*` but only as "must stay unreachable"; the diff changes what it *measures* (F1).

No place reached by the diff yields a missing invariant from 1/2/3/10/11: every content-sending Ask/Find call reads the client from the binding set by the service wrapper, and the router resolves it for the request's `X-Lit-Drive`.

## Mutation table

Suite column: `S` = inventory + routing + routing_callers + `test_rag_*` + `test_find_*` (698 tests); `D` = `test_llm_caller_inventory.py` only; `R` = `test_llm_routing.py`; `F` = full `tests/`.

| # | Mutation | want | got | suite / killer |
|---|---|---|---|---|
| M1 | `bound()` finally does not `reset` | kill | kill | S / `test_the_service_binds_its_profile_for_the_helpers_only_while_it_runs` |
| M2 | `answer_question` wrapper calls `_answer_question` without `bound` | kill | kill | S / same test |
| M3 | `stream_answer` wrapper iterates `_stream_answer` without `bound` | kill | **live** | S — no test drives the real wrapper; `bind_llm` monkeypatches `bound_client`/`bound_resolved` globally (F4) |
| M4 | `find_files` wrapper calls `_find_files` without `bound` | kill | **live** | S (F4) |
| M5 | `/ask` resolves `""` instead of the header drive | kill | kill | S / `test_ask_and_find_refuse_an_unresolved_drive[ask-…]` |
| M6 | `/ask` passes `resolved=None` to `_sse_stream` | kill | **live** | S (F4) |
| M7 | agentic gate ignores `profile.agentic` | kill | kill | S / `test_the_agentic_gate_reads_the_bound_profile[True-False-True]` |
| M8 | agentic gate ignores the allowlist | kill | kill | S / `…[False-True-True]` |
| M9 | agentic gate drops `resolved is None` guard | kill | kill | S / `test_rag_personal_history::…test_strict_short_circuit_emits_done_only` (AttributeError) |
| M10 | agentic gate drops `client.enabled` check | live | live | S — equivalent: `resolve` never returns a disabled client |
| M11 | helper builds `create_llm_client(config.settings.llm)` | kill | kill | D / `test_only_the_resolver_and_the_factory_construct_clients` |
| M12 | helper builds `_mk(_s.llm)` with `create_llm_client as _mk`, `settings as _s` | kill | **live** | D (F3) |
| M13 | helper builds via `getattr(app.llm, "create_"+"llm_client")(cfg.llm)` with `cfg = config.settings` | kill | **live** | D (F3) |
| M14 | helper takes `llm_routing._client_for(_current(), default profile)` (ceiling bypass) | kill | **live** | D (F3) |
| M15 | helper calls `resolve_without_ceiling("rag")` | kill | kill | D / `test_nothing_reachable_bypasses_the_ceiling` |
| M16 | `routers/rag.py` imports `app.evals.stages.run_stage3_once` | kill | **live** | D (F3; spec decision 14 "must not be reachable") |
| M17 | comment containing `settings.llm.model create_llm_client(x)` added | live | live | D — AST, comments not matched (detector rule 4 holds) |
| M18 | `/status` swaps provider and model | kill | **live** | S (F5) |
| M19 | `/status` `enabled=True` always | kill | **live** | S (F5) |
| M20 | `default_status` ignores `client.enabled` | kill | kill | R / `test_default_status_reports_the_default_profile[section2-…]` |
| M21 | `resolve_without_ceiling` ignores `routing.features` | kill | kill | R / `test_resolve_without_ceiling_ignores_the_drive_policy` |
| M22 | `resolve_without_ceiling` drops the enabled/vision Skip | kill | **live** | R (F6) |
| M23 | `_run_agentic` reads `settings.llm` for the model entry | kill | kill | D / `test_only_output_language_is_read_from_the_llm_settings` |
| M24 | `_run_agentic` client = `bound_client() or resolved.client` | live | live | equivalent |
| M25 | eval `run_stage3_once` drops the `isinstance(routed, Resolved)` guard | kill | **live** | F (F6) |
| M26 | `get_file_chunks` access filter with `drive=None` | kill | kill | S / `test_rag_tools::test_every_file_tool_gates_on_the_asks_drive[get_file_chunks]` |
| M27 | `_run_agentic` passes `drive=None` to `run_agentic_loop` | kill | **live** | S; also live at `71d8b97` (F7) |

Tree restored with `git checkout -- .` after each; `git status` clean at the end.

## Findings

### F1 — Medium — [introduced] — eval stage 1/2 silently stop using the LLM

`app/evals/stages.py:108` `run_stage1` calls `transform_query_structured(...)` outside any `llm_routing.bound(...)`. After this diff the helper reads `llm_routing.bound_client()` (`app/rag/query_transform.py:385`), which is `None` there, so it returns `StructuredQuery.passthrough`. At `71d8b97` the removed `_init_llm()` (`app/evals/__main__.py`) installed the global client, so stage 1 exercised the LLM transform. Stage 2 consumes stage 1's `keywords`/`required`, so its recall numbers change too; only stage 3 is bound (`stages.py:295`).

Reproduction (`scratchpad/pr2c-review/stage1.py`): with `resolve_without_ceiling` returning an enabled mock client, `run_stage1(case)` → `LLM called in stage1: 0 keywords: <raw query>`. A comparison against a pre-change baseline report would show a spurious stage-1/2 regression, and every new baseline measures passthrough.

Fix: resolve once per case (or run) in the runner and wrap `run_stage1` (and anything else calling a helper) in `llm_routing.bound(routed)`; add a stage-1 test that asserts the bound client is awaited.

Invariants: none broken (evals are outside the ceiling by spec decision 14). Bucket B, but it is a behaviour regression of the operator tool, not prose.

### F2 — Low — [introduced] — a client disconnect mid-stream raises `ValueError` from `ContextVar.reset` in the asyncgen finalizer

`app/rag/service.py:2302-2306`: `stream_answer` holds `with llm_routing.bound(resolved):` across `yield`. Starlette 1.3.1 `StreamingResponse.stream_response` never `aclose()`s `body_iterator`; when the disconnect lands while the generator is suspended at `yield` (the consumer is in `send()` — the normal case on the ASGI 2.4 path, where disconnect surfaces as `OSError` from `send`), the nested `stream_answer` generator is finalized later by asyncio's asyncgen hook in a *new* task/Context. `_bound.reset(token)` then raises `ValueError: <Token …> was created in a different Context`.

Reproduction (`scratchpad/pr2c-review/sse_ctx.py`, real `_sse_stream` + `stream_answer`, fake `_stream_answer`): cancel the consumer while it awaits outside the generator, `gc.collect()` → loop exception handler receives `Task exception was never retrieved ValueError(... was created in a different Context)`. Semaphore still released; the bound value is not visible in any other task (measured `None` in the main task), so **no cross-request leak** — concurrency check in the same script: two interleaved streams for `d1`/`d2` each saw only their own client in every helper call.

Effect: one ERROR-level log line per Ask abandoned mid-stream; noise that hides real errors.

Fix options: don't hold a token across `yield` — set the var inside the generator without resetting (the Context belongs to the request task), or have `bound()` swallow the cross-Context `ValueError`, or pass `resolved` explicitly instead of via contextvar for the streaming path.

### F3 — Low/Medium — [introduced] — the caller-inventory detector keys on the local spelling, so an alias, `getattr`, or the resolver's private cache evade it

`tests/test_llm_caller_inventory.py:24-38` matches a call only by `func.id`/`func.attr`, and `:57-73` matches `.llm` only when the base Name/Attribute is literally `settings`. Survivors (all in `app/rag/category_expander.py`, detector green):

- M12 `from app.llm import create_llm_client as _mk; from app.config import settings as _s; _mk(_s.llm)`
- M13 `getattr(app.llm, "create_llm_client")(cfg.llm)` with `cfg = config.settings`
- M14 `llm_routing._client_for(llm_routing._current(), <default profile>)` — hands the helper an offhost client without `resolve`, i.e. exactly the ceiling bypass the file's docstring says it forbids
- M16 a router importing `app.evals.stages` (spec decision 14: evals "must not be reachable from any route or worker"); the evals directory is excluded from the scan and nothing checks imports into it

Detector rules otherwise hold: declared expected sets with `==` (rule 1/5), AST so comments do not match (rule 4, M17), and test 1's non-empty expected set guards against an empty scan making test 2 pass vacuously.

Fix (not applied): record `ImportFrom` aliases of `create_llm_client`/`LLMClient`/`OllamaLLMClient`/`settings` per module and match `ast.Name` references (not only calls) against the alias set; flag any reference to `llm_routing._client_for`/`_current`/`_active` outside `app/llm_routing.py`; drop the `base_name == "settings"` condition (any `.llm` attribute other than `.llm.output_language` outside the two allowed files — `app.llm` module references appear only in import statements, which are not `Attribute` nodes); add `== set()` for modules outside `app/evals` that import `app.evals`. `getattr` with a computed string is not worth chasing.

### F4 — Medium — [introduced] — the production Ask-stream and Find bindings are untested (M3, M4, M6 live)

The only test of the wrapper binding (`tests/test_llm_routing_callers.py:437`) covers `answer_question`, which production does not use for Ask (router uses `stream_answer`). `tests/llm_helpers.py:34-69` `bind_llm` replaces `llm_routing.bound_client`/`bound_resolved`/`resolve` module-wide, so every service/stream/find test passes whether or not the wrapper binds. Consequences not caught:

- M3/M6: `/ask` with no binding (or `resolved=None`) → every helper passthrough and `llm.generate_stream` on `None` → the stream ends with `done{error}` for every Ask.
- M4: `/find` with no binding → decompose/expand passthrough on every request.

Neither sends content to a wrong profile (fail-closed), so invariants 1/2 hold; but the one surface users hit is unguarded, and a later refactor that, e.g., binds a resolve for another drive in the wrapper would be invisible for the same reason.

Fix: one table-driven test over (`stream_answer`, `find_files`) that patches `_stream_answer`/`_find_files` (as the existing `answer_question` test does) and asserts `bound_client()` inside is the handed client and `None` after; plus one router→service test for `/ask` asserting `_sse_stream`/`stream_answer` receives the `Resolved` returned for `X-Lit-Drive` (mirroring `test_find_hands_the_resolved_profile_to_the_service`).

### F5 — Low — [introduced] — `/status` `llm` block has no test (M18, M19 live)

`app/main.py:461,564-568` switched from the global client to `llm_routing.default_status()`. `default_status` itself is tested (M20 killed), but nothing calls `status_endpoint`; swapping provider/model or hard-coding `enabled=True` survives. Note also that `/status` reports the `default` profile, which is not the profile `rag` or any other feature uses once `routing.features` assigns one — the dashboard can show "enabled" for a default profile while Ask skips (or the reverse). Acceptable until PR-3/PR-4 if intended; worth a one-line test so the shape is held.

### F6 — Low — [introduced] — eval-only guards are untested (M22, M25 live)

`resolve_without_ceiling`'s enabled/vision `Skip` (`app/llm_routing.py:374-376`) and the eval runner's `isinstance(routed, Resolved)` guard (`app/evals/stages.py:296-297`) can be deleted with the full suite green. With both gone, an eval against a disabled profile binds a disabled client and reports passthrough numbers as a real run. Operator tool only; a `Skip` row in `test_resolve_without_ceiling_…` covers the first.

### F7 — Medium — [pre-existing] — the Ask's drive reaching the agentic tools is untested at the service boundary (M27 live, also at `71d8b97`)

`app/rag/service.py:1031-1034` passes `drive=drive` into `run_agentic_loop`, which builds the tools' `context.drive`. Replacing it with `None` keeps all tests green, here and at the parent. With `context.drive=None` the tools' access filter (`filter_accessible(..., drive=None)`) and `get_file_detail`'s drive check (`app/rag/tools/get_file_detail.py:183-188`, which skips when `context.drive` is falsy) no longer confine files to the Ask's drive, so another drive's content is sent to the profile that was resolved (and ceiling-checked) for the Ask's drive — invariants 10 and 1. The tool-level test (`test_every_file_tool_gates_on_the_asks_drive`, M26 killed) holds each tool given a context; nothing holds that the service hands it the right drive. Pre-existing, but this PR makes it load-bearing for the per-drive ceiling. Fix: assert in a `_run_agentic`/`_stream_agentic` test that `run_agentic_loop` receives the Ask's drive (a row, not a new file).

### F8 — Medium — [introduced] — design question for the supervisor: `profile.agentic: true` bypasses the global `agentic_mode: off` kill switch, and the allowlist opens the gate for non-legacy profiles

Truth table measured with `_agentic_gate_open` (`scratchpad/pr2c-review/gate.py`, `app/rag/service.py:992-1000`, `app/rag/agentic.py:65-71`):

| agentic_mode | profile.agentic | model allowlisted | gate |
|---|---|---|---|
| off | true | any | **open** |
| off | false | any | closed |
| auto | true | any | open |
| auto | false | yes | open |
| auto | false | no | closed |

- Invariant 4 holds: the legacy `default` profile is always `agentic=False` (`app/llm_routing.py:112`) with `config = settings.llm`, so its rows equal the pre-change gate (`71d8b97` read `agentic_capability_supported(settings.llm.model, settings.llm)` and the global client's `enabled`/`chat_with_tools`).
- `agentic_mode` is not a profile key (`_PROFILE_KEYS` excludes it) and `config.py:661` documents `agentic_mode="off"` as the kill switch; the service comment at `service.py:1106-1111` says rollback is "one config edit away". With a profile marked `agentic: true`, setting `agentic_mode: off` no longer disables agentic Ask. A reader who trusts that comment would flip the wrong knob during an incident.
- Spec decision 8 says the gate reads `agentic: true` and `agentic_models` "stays readable for the legacy single profile". The code applies the inherited allowlist to every profile, so a new non-legacy profile without `agentic: true` whose `model` string matches an old allowlist entry runs agentic. Arguably reasonable (same model, same capability) — but it is a deviation, and the two rules together mean neither knob alone turns agentic off.

Not an A (no declared invariant covers it). Raise to the supervisor: either `agentic_mode: off` stays a global kill switch (`and config.agentic_mode != "off"` ahead of the `or`), or the comment at `service.py:1106` is deleted and the GUI (PR-4) exposes `agentic` per profile as the only switch.

TOTAL: 8 findings
