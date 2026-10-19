# PR-1 review, round 5 — fix commit `a755360e` (intelligence addon)

Reviewed `a755360ec9edbc35696256602497afc9e9a53474` on its own (parent `15b48d11`) in a
worktree fixed at that SHA. Baseline: full `tests/` 2837 passed, 2 skipped.
Mutation runs: `tests/test_llm_routing.py tests/test_policy_client.py tests/test_config.py`;
tree restored with `git checkout -- .` after each.

Invariant-4 probes: one script (`load_settings()` → `create_llm_client(settings.llm)` →
`generate()` with `httpx.AsyncClient.send` captured, plus `build_routing` legacy-profile
equality at the series SHAs) run against worktrees at `597ecc4` (before the series),
`15b48d11` (parent) and `a755360e`. Profile probes: `build_routing` + `resolve` with a
two-profile section (`local` offhost false, `cloud` offhost with `api_key_env: K`,
`local_fallback: local`), policy stubbed allowed/denied. Probe worktrees removed afterwards.

## R4 verification

| R4 | reproducing mutation | want | result | verdict |
|---|---|---|---|---|
| F1 (top level) | V1: wrong kind `raise ValueError` again (no `except` left, so it escapes `load_settings`) | kill | killed (8: `legacy_section[llm2]` `model: 123`, `[llm3]` `agentic_mode: False`, `[llm4]` `output_language: False`, plus the profile rows) | closed |
| F1 (top level) | V1b: wrong kind → `return LLMConfig(provider="disabled")` (the parent's outcome, without the exception) | kill | killed (5, same three legacy rows) | closed |
| F1 (profile) | V1 as above | kill | killed (`never_inherits…[*-123]`, `knob…[hot]`, `[True]`) | closed |
| F1 (probe) | same input at `15b48d11` vs `a755360e` | — | `agentic_mode: off`, `output_language: no`, `v1 overrides + agentic_mode: off`: parent disabled, now enabled with the same provider/model/body as `597ecc4` (table below) | closed |
| F1 (removed code) | `LLMConfigError`, `load_settings`'s `except → disabled`, `_build_profile`'s `except → _RoutingError` | — | gone; no remaining reference in `app/`, `tests/`, `scripts/` | closed |
| F2 | V2: delete the non-list `agentic_models` guard | kill | killed (`[llm9]` `agentic_models: 5`) | closed |
| F3 (M15) | V3: `knobs = base` (a blank/mistyped connection field inherits the top-level endpoint) | kill | killed (6: `never_inherits…[base_url|model|vision_model × None|123]`) | closed |
| F3 (M11b) | V3b: null/mistyped value resets to the field default instead of inheriting `start` | kill | killed (`knob…[hot]`, `[True]`); `[None]` survives because `None` takes the earlier `continue` | closed for mistyped; null half held by the `is None` line itself |
| F3 (key) | V11: profile without `api_key_env` inherits `base.api_key` | kill | killed (6) | held |

## Invariant 4: `597ecc4` vs `a755360e` (parent `15b48d11` for reference)

`llm:` section as shown (`provider: openai_compatible`, `base_url: http://h/v1`, `model: m`
unless the row is about them), `LLM_API_KEY` unset. "sent" is the captured request.
At `15b48d11`/`a755360e` the legacy `default` profile's config equalled `settings.llm` in every row.

| input | `597ecc4` | `15b48d11` | `a755360e` | worse than `597ecc4`? |
|---|---|---|---|---|
| `agentic_mode: off` (YAML → `False`) | enabled, `agentic_mode=False`, sent model `m` | disabled | enabled, `"off"`, same request | no — same wire |
| `output_language: no` (→ `False`) | enabled, `False` (read as `False or "auto"`) | disabled | enabled, `"auto"` | no |
| `api_key: 12345` (int) | enabled, **sent `Bearer 12345`** | disabled | enabled, **sent `Bearer not-needed`**, warning logs the value | **yes** — a provider that checks the key now 401s every job instead of working (R5-F2); the parent at least disabled cleanly |
| `model: 3.5` (float), openai_compatible | enabled, every `generate` raises `AttributeError: 'float' object has no attribute 'lower'` | disabled | `model=""` → disabled | no (was broken) |
| `model: 3.5`, ollama | enabled, sent `"model": 3.5` (JSON number) | disabled | disabled | no (a number is not a model name the server knows) |
| `max_tokens: 4096.0` | sent `max_tokens: 4096.0` | disabled | sent `8192` (field default) | ceiling rises 4096 → 8192; answers unaffected, cost ceiling only. B |
| `max_tokens: yes` (→ `True`) | sent `max_tokens: true` | disabled | sent 8192 | no (better) |
| `temperature: 1` (int for float) | sent 1 | sent 1 | sent 1 | no |
| `retry_attempts: 2.0` | `2.0` | disabled | 3 | no |
| `provider: 5` | enabled (anything but `disabled`/`ollama` is openai-compatible) | disabled | disabled | yes, same class as R4-F4 (recorded B) |
| `base_url: 8080` (int) | `create_llm_client` raises `TypeError` | disabled | disabled | no (was a crash) |
| `vision_model: 7` | `7` (vision on with a numeric model) | disabled | `""`, text features run | no |
| `reasoning: off` (→ `False`) | `"disabled"` | `"disabled"` | `"disabled"` | no |
| shipped example shape (quoted) | enabled | enabled | enabled | no |
| `agentic_mode: auto` + list `agentic_models` | enabled, `auto` | same | same | no |
| v1 `llm-overrides.json` over yaml (provider/base_url/model/output_language/vision_model) | overridden values, sent `m2` | same | same | no |
| v1 overrides `provider: disabled`, blanks | disabled | disabled | disabled | no |
| v1 overrides over a yaml with `agentic_mode: off` unquoted | enabled, sent `m2` | disabled | enabled, sent `m2` | no |

Valid top-level configs and v1 overrides: identical provider, model and request body across
all three SHAs. Of the round-4 wrong-typed list, only `api_key: 12345` is worse for the user
than before the series; `max_tokens: 4096.0` changes a ceiling, the rest are equal or better.

## Invariants 1 / 3 with wrong-typed profile values

`cloud` value changed one at a time; "allowed"/"denied" are the stubbed `llm_cloud` answer.

| `cloud` value | `15b48d11` | `a755360e` |
|---|---|---|
| `offhost: "false"` / `0` / `"no"`, `agentic: "yes"` / `1` | routing error | same — `offhost`/`agentic` still only `True`/`False` (V8 killed; V14 `bool(...)` equivalent under the check) |
| `provider: 5`, `api_key_env: 5` | routing error | same |
| `base_url: 8080` | routing error (all features Skip) | `url=""` → allowed: `Skip`; denied: `local` via `local_fallback`. Never the top-level `http://top/v1` |
| `model: 3.5` | routing error | `model=""` → `Skip` as above |
| `vision_model: 7` | routing error | `""` → vision `Skip`, text served by `cloud` (its own endpoint) |
| `temperature: "hot"`, `max_tokens: 4096.0` / `True`, `output_language: False`, `retry_attempts: 2.0` | routing error | inherit top-level knob (0.7, 16000, `auto`, 3); endpoint/key are `cloud`'s own |
| profile key | — | always `environ[api_key_env]` or `""`; top-level `api_key`/`LLM_API_KEY` never used (V11 killed) |

No wrong-typed value sends to an endpoint, or with a key, the user did not write for that
profile, and none turns an offhost profile local. Invariants 1 and 3 hold.

## Mutation table (this commit's code)

| id | mutation | want | result |
|---|---|---|---|
| V1 | wrong kind raises | kill | killed (8) |
| V1b | wrong kind → whole config disabled | kill | killed (5) |
| V2 | non-list `agentic_models` guard deleted | kill | killed (1) |
| V3 | `knobs = base` | kill | killed (6) |
| V3b | mistyped value → field default, not `start` | kill | killed (2) |
| V4 | `_same_kind` check removed (wrong kind kept) | kill | killed (5, profile rows only; the legacy rows assert provider/offhost only) |
| V6 | `_same_kind` int branch accepts `bool` | kill | **live** — killed at `15b48d11` by the `max_tokens=True` routing-error row this commit deleted. R5-F1 |
| V7 | float branch accepts `bool` | kill | killed (`knob…[True]`) |
| V8 | `offhost`/`agentic` bool check removed | kill | killed (2) |
| V11 | profile inherits `base.api_key` | kill | killed (6) |
| V12 | non-enum `reasoning` → `continue` (inherit `start`) instead of the field default | live (top-level `start` = defaults; no profile row) | live — see R5-F3 |
| V13 | legacy `offhost` `is not False` → `is True` | kill | killed (10) |
| V14 | profile `agentic=bool(raw.get(...))` | live (equivalent: value already checked bool) | live |

## Findings

### R5-F1 — LOW — [introduced] (V6 killed at `15b48d11`, live here) — A-candidate test gap — nothing holds "a bool is not an int"

The commit moved the wrong-type rows out of `test_invalid_routing_disables_every_profile_and_says_why`
and re-expressed them in `test_profile_knob_left_blank_or_mistyped_inherits_the_top_level_value`,
but only for `temperature` (a float field). The `max_tokens=True` row was the only thing that
killed V6; it was deleted and not carried over. Under V6, `max_tokens: yes`/`true` (YAML bool)
passes as an int and goes out as `"max_tokens": true` — the `597ecc4` behaviour the rule is
meant to end.
Suggested fix: parametrise the knob test over `(field, written, inherited)` and add
`("max_tokens", True, 16000)` (or add a `max_tokens: True` legacy row that asserts
`max_tokens == 8192` — the legacy rows currently assert provider/offhost only, which is also
why V4 is killed by profile rows alone).

### R5-F2 — LOW — [introduced] — B (and a small secret-handling point) — a numeric top-level `api_key` is dropped, and its value is written to the log

Two effects of the one `continue` path on `api_key`:
1. `api_key: 12345` (all-digit keys are plausible for self-hosted servers started with
   `--api-key`) worked at `597ecc4` (`Bearer 12345` on the wire). At `a755360e` the key is
   ignored and requests go out with `Bearer not-needed`; a server that checks the key 401s every
   job. The parent disabled LLM instead. Invariant 4 names provider/model only, so this is not an
   invariant break, and the triage ruled out per-key conversions; recorded for the supervisor as
   the one outcome in the round-4 list that is worse than before the series.
   `LLM_API_KEY` (env, always a string) is unaffected.
2. The new warning is `"Ignoring llm.%s=%r"`, so a mistyped `api_key` is logged in clear:
   `WARNING:app.config:Ignoring llm.api_key=98765432101234: expected str` (probe). The removed
   `LLMConfigError` message carried only the type name. Profiles cannot reach this (their key
   always comes from the environment as `str`).
Suggested fix: log the type, not the value (`type(value).__name__`) — that removes the leak
without adding a branch. Whether a numeric key should be read as its string form is the
supervisor's call; the rule as decided says no.

### R5-F3 — LOW — [pre-existing] (the `reasoning` branch predates this commit; profile reach since `11008ac1`) — B — `reasoning` is now the one key that does not follow the rule

After this commit every null or wrong-kind value is "absent" — it inherits `start` — except a
non-enum `reasoning`, which is reset to the field default (`"disabled"`). At top level the two
are the same (`start` is the defaults). In a profile they differ (probe, top-level
`reasoning: auto`):
`cloud.reasoning: null` → `"auto"` (inherits), `"atuo"` → `"disabled"`, `false` → `"disabled"`.
Nothing reaches another endpoint; the only effect is the OpenRouter reasoning-suppression field
being sent on that profile. V12 (make it `continue`) survives, so no test pins either reading.
Suggested fix (continues the convergence): drop the special reading and treat a non-enum
`reasoning` like any other wrong value — `continue` with the same warning — so the branch
collapses into the one rule. Not a fix for this PR unless the supervisor wants it.

## Trajectory

App-code shape of each fix diff, read in order with `git show`:

- `69174e17` (r1): removed a state (two globals → `_Active`), replaced inherit-then-subtract
  with one copy rule; **added** a profile-only type validator (a prediction).
- `11008ac1` (r2): removed `_usable` and the duplicate validator by moving it into
  `parse_llm_config`; **added** the same prediction at the top level plus
  `LLMConfigError` and the `except → disabled` branch.
- `15b48d11` (r3): removed the `agentic_models` rejection; widened the absence test from
  "key missing" to "value null"; one mapping helper. No new state or prediction.
- `a755360e` (r4, this round): **removed** `LLMConfigError`, the `except → disabled` branch in
  `load_settings` and the `except → _RoutingError` re-wrap in `_build_profile`; the
  wrong-type test now leads to the same `continue` as null. App code +10 / −18. Adds one
  warning log line, no branch, no state, no prediction. The prediction added in `11008ac1`
  is now a skip rather than a failure mode.

Does this round add a branch, a state or a prediction that the round before also added?
**No.** It removed an exception type and two branches, as the round-4 triage asked, and did
it with no per-key conversions. The series is **converging**. What is left of the per-key
special-casing inside `parse_llm_config` is `agentic_models` (a real shape conversion) and
`reasoning` (R5-F3), the latter now a leftover that could fold into the same rule; neither
was added by this round. The findings above are a test row and a log format, not new cases.

TOTAL: 3 findings
