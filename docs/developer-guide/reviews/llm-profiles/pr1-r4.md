# PR-1 review, round 4 — fix commit `15b48d11` (intelligence addon)

Reviewed `15b48d1122b3271a1359eb5b6448b0b0ab76958a` on its own (parent `11008ac1`) in a
worktree fixed at that SHA. Baseline: full `tests/` 2833 passed, 2 skipped.
Mutation runs: `tests/test_llm_routing.py tests/test_policy_client.py tests/test_config.py`;
tree restored with `git checkout -- .` after each. Invariant-4 probes ran one
`load_settings()` + `build_routing` + `create_llm_client` script against worktrees at
`597ecc4` (before the series), `11008ac1` (parent) and `15b48d11`.

## R3 verification

| R3 | reproducing mutation | want | result | verdict |
|---|---|---|---|---|
| F1 (null) | M1: `if name not in raw: continue; value = raw[name]` (parent's absence test) | kill | killed (`test_load_settings_legacy_section[llm3]` api_key null, `[llm4]` vision_model null) | closed |
| F1 (non-list `agentic_models`) | M2: non-list `agentic_models` raises `LLMConfigError` again | kill | killed (`[llm7]` `agentic_models: "x"`) | closed; but the guard itself is unheld, see R4-F2 |
| F1 (probe) | same `load_settings` input at `11008ac1` vs `15b48d11` | — | `api_key:` / `agentic_models:` / `agentic_models: {}` / `vision_model:` / `output_language:`+`temperature:`+`max_tokens:` null: parent `disabled`, fix runs with the same provider/model as `597ecc4` (table below) | closed |
| F2 (B) | — | — | `reasoning:` null now reads as absent → `"disabled"` (differs from `597ecc4`'s `None`, as recorded) | as triaged |
| F3 | M7: parent's `routing or {}` + check | kill | killed (`routing=[]` row, needle `llm.routing must be a mapping`) | closed |
| F3 | M5: `_mapping` returns non-dicts unchecked | kill | killed (3 rows: `routing=[]`, `routing="x"`, `features=[]`) | closed |
| F3 | M6: parent's `features or {}` + check | kill | killed (`features=[]` row) | closed |
| F3 | M4: `_mapping(None)` raises | kill | killed (16) | null = absent for routing held |
| F4 | M8: `parse_llm_config` ignores `base` | kill | killed (`test_profile_inherits_tuning_knobs_only`, 0.7 ≠ default 0.3) | closed |
| F4 | M9: `_build_profile` builds over `LLMConfig()` | kill | killed (same test) | closed |

## Invariant 4: `597ecc4` vs `15b48d11` (parent `11008ac1` for reference)

`search-config.yml` with only the `llm` section shown (plus `provider`/`base_url`/`model`
where not the subject), `LLM_API_KEY` unset. "enabled" is `create_llm_client(settings.llm).enabled`;
at `11008ac1`/`15b48d11` the legacy `default` profile's config was also checked to equal
`settings.llm` (it did in every row).

| input | `597ecc4` | `11008ac1` | `15b48d11` | differs from `597ecc4`? |
|---|---|---|---|---|
| `api_key:` (null), openai_compatible | enabled, `api_key=None` (client sends `"not-needed"`) | disabled | enabled, `api_key=""` (client sends `"not-needed"`) | no (same wire) |
| `agentic_models:` (null), mode `"off"` | enabled | disabled | enabled, `()` | no |
| `agentic_models: {}` | enabled (kept `{}`, never iterated) | disabled | enabled, `()` | no |
| `vision_model:` (null) | enabled, vision guarded off | disabled | enabled, `""` | no |
| `reasoning:` (null) | `None` → field not sent | `"disabled"` | `"disabled"` → field sent | **yes** — R3-F2, recorded B |
| `output_language:`/`temperature:`/`max_tokens:` (null) | enabled, `None`s reach the client | disabled | enabled, `auto`/0.3/8192 | values differ; the `None`s at `597ecc4` were passed raw to the provider, so the fix is the sane reading |
| `model:` (null) | disabled | disabled | disabled | no |
| `provider:` (null) + base_url + model | **enabled** (`LLMClient` treats anything but `disabled`/`ollama` as openai-compatible) | disabled | disabled | **yes** — R4-F4 |
| `offhost:` (null), legacy | n/a | offhost true | offhost true | — (never reads false) |
| `offhost: false`, legacy | n/a | offhost false | offhost false | — |
| `agentic_mode: off` (unquoted → YAML bool `False`) | **enabled** (`False != "off"`, empty `agentic_models` → agentic never on) | disabled | **disabled** | **yes** — R4-F1 |
| `output_language: no` (unquoted → `False`) | **enabled** (`False or "auto"`) | disabled | **disabled** | **yes** — R4-F1 |
| `api_key: 12345` (YAML int) | **enabled** | disabled | **disabled** | **yes** — R4-F1 |
| `model: 3.5` (YAML float) | **enabled** | disabled | **disabled** | **yes** — R4-F1 |
| `max_tokens: 4096.0` | **enabled** | disabled | **disabled** | **yes** — R4-F1 (already in R3's table) |
| `temperature: 1` (int for float) | enabled | enabled | enabled | no |
| `llm:` (null) / no `llm` section | disabled | disabled | disabled | no |
| shipped example shape (quoted `"auto"`, `"disabled"`, `"off"`, `[]`, `""`) | enabled | enabled | enabled | no |
| `agentic_mode: auto` + list `agentic_models` | enabled, same entries | same | same | no |
| v1 `llm-overrides.json` (provider/base_url/model/output_language/vision_model) over a yaml | enabled, overridden values | same | same | no |
| v1 overrides `provider: disabled`, blanks | disabled | disabled | disabled | no |
| v1 overrides over a yaml with `api_key:`/`vision_model:` null | enabled | disabled | enabled | no |
| v1 overrides over a yaml with `agentic_mode: off` unquoted | enabled | disabled | **disabled** | **yes** — R4-F1 (the GUI cannot repair it: `agentic_mode` is not an override key) |

### Null in a profile (question 2b)

Probed `build_routing` with a two-profile section, `cloud` offhost with `api_key_env: K`:

| `cloud` value | `11008ac1` | `15b48d11` |
|---|---|---|
| `offhost: null` | routing error `offhost must be true or false` → every feature Skips | same — **never reads as false** |
| `agentic: null` | routing error | same |
| `api_key_env: null` | profile has no key (requests go out keyless → provider 401 per job) | same — pre-existing since `69174e17` (at `ac52d2cd` it inherited the base key); never another provider |
| `model: null` / `base_url: null` | whole routing disabled | profile built with `""` → client disabled → that profile's features `Skip`; others still serve. Never falls through to another profile or to the top-level endpoint |
| `vision_model: null` | routing disabled | `""` → vision features Skip on that profile |
| `temperature: null` / `max_tokens: null` | routing disabled | inherits the top-level knob (0.7 / 16000 in the probe) |
| `provider: null` | routing error | same |
| `agentic_models: null` | unknown-keys error | same |

So null = absent is applied inside `parse_llm_config` only; `offhost`/`agentic` still reject
null, which is the safe direction for invariant 3. No profile value silently becomes a
*less* restrictive one. Which of "inherit" vs "field default" a null knob means in a profile
is not held by a test (R4-F3).

## Mutation table (this commit's code)

| id | mutation | want | result |
|---|---|---|---|
| M1 | absence test back to `name not in raw` | kill | killed (2) |
| M2 | non-list `agentic_models` raises | kill | killed (1) |
| M3 | delete the non-list `agentic_models` guard (`continue`) | kill | **live** — the only row, `"x"`, iterates harmlessly as characters; with `agentic_models: 5` the mutant raises `TypeError` out of `load_settings()` at module import (probe), so the addon would not start. R4-F2 |
| M4 | `_mapping(None)` raises | kill | killed (16) |
| M5 | `_mapping` skips the dict check | kill | killed (3) |
| M6 | features back to `or {}` + check | kill | killed (1) |
| M7 | routing back to `or {}` + check | kill | killed (1) |
| M8 | `parse_llm_config` ignores `base` | kill | killed (1) |
| M9 | profile knobs built over `LLMConfig()` | kill | killed (1) |
| M10 | knobs keep top-level `vision_model` and reset `temperature` | kill | killed (2) |
| M11b | a *present* null resets to the field default instead of inheriting `start` | live at top level (start = defaults); kill for profiles | **live** — no profile row with a null knob. R4-F3 |
| M12b | present `reasoning: null` → `"auto"` | live (R3-F2 recorded B; rows assert provider only) | live |
| M13 | routing `None` no longer absent (`isinstance` only) | kill | killed (6) |
| M14 | present null `api_key`/`vision_model` → `""` explicitly | live (equivalent: defaults are `""`) | live |
| M15 | in `_build_profile`, a null connection field inherits the top-level value | kill (a profile must never inherit the endpoint) | **live** — `test_profile_never_inherits_the_top_level_endpoint_or_key` passes `""` only. Held today only structurally (knobs are cleared before parsing). R4-F3 |

## Findings

### R4-F1 — MEDIUM — [introduced] by `11008ac1`, unchanged by `15b48d11` (parent and fix identical in the probe) — candidate A (invariant 4) — a wrongly *typed* top-level scalar still turns every LLM feature off, including YAML 1.1 booleans a user did not mean as booleans

`parse_llm_config` → `_same_kind` → `LLMConfigError` → `load_settings` replaces the whole
section with `LLMConfig(provider="disabled")`. Round 4 made null absent but left every other
kind mismatch on that path. The cases that matter are not exotic: PyYAML reads unquoted
`off`/`no`/`yes`/`on` as booleans, so `agentic_mode: off` (the docs' own comment reads
`# off | auto`) and `output_language: no` (Norwegian's BCP 47 tag) are `False`. At `597ecc4`
both ran (`agentic_mode == "off"` false but empty `agentic_models` keeps agentic off;
`False or "auto"` → auto). At `15b48d11` all LLM features are off, with one `logger.error`,
and the admin GUI cannot repair it (`agentic_mode` is not an override key). Numeric
`api_key: 12345`, `model: 3.5`, `max_tokens: 4096.0` are the same shape (R3 put the numeric
ones to the supervisor; the triage did not decide them, and the YAML-bool cases were not
in R3's table).

This is the same class as R3-F1 — an authoring quirk the pre-change code tolerated — so
the user's "one uniform rule" left half the class open.

Suggested fix (not applied; supervisor's call): extend the single rule rather than adding
cases — "a value that is null **or** not the field's kind is absent, with a warning", on both
surfaces, and delete the `except LLMConfigError → disabled` branch. For a profile that
still fails safe: a wrong-kind connection field becomes `""` → client disabled → `Skip`;
`offhost`/`agentic` keep their own strict check. Add rows for `agentic_mode: off` and
`output_language: no` asserting the provider survives. Do **not** add bool-to-string
coercion per key; that is the patching shape the trajectory question warns about.

### R4-F2 — LOW — [introduced] (guard added in this commit) — test gap — the non-list `agentic_models` guard is held by no test

M3 survives: the test row `agentic_models: "x"` is iterated character by character and every
entry is skipped, so deleting the guard changes nothing the suite sees. With `agentic_models: 5`
(or `true`) the mutant raises `TypeError` from `settings = load_settings()` at import and the
addon does not start (probe). At `597ecc4` that input was ignored.
Suggested fix: change the row's value to `5` (or add one), keep the assertion.

### R4-F3 — LOW — [introduced] (null = absent is new here) — B — null in a *profile* is only half-held

M11b (present null → field default instead of inheriting the top-level knob) and M15 (present
null connection field → inherit the top-level endpoint) both survive; no profile row carries a
null. Today's code is right on both (null inherits the knob; a null connection field is `""`,
because knobs are cleared before parsing), so nothing a user hits now. M15 is the one that
matters: the "never inherits the endpoint" test uses `""` only, so a later "null means inherit"
edit in `_build_profile` would send a profile with `model:`/`base_url:` left blank to the
top-level endpoint unnoticed.
Suggested fix: add `None` to the parametrisation of
`test_profile_never_inherits_the_top_level_endpoint_or_key`.

### R4-F4 — LOW — [introduced] by `11008ac1`, unchanged here — B — `provider:` left blank at the top level no longer runs

At `597ecc4`, `provider: None` built an `LLMClient` (anything but `disabled`/`ollama` is
openai-compatible) and ran if `base_url`/`model` were set. Now null = absent = `"disabled"`.
That reading is the defensible one and matches the rule the user chose; recorded because it
is a config that ran before. Suggested fix: none.

## Trajectory

- `ac52d2cd`: the change.
- `69174e17` (r1): removed a state (two globals → `_Active`), replaced inherit-then-subtract
  with one copy rule, **added** a profile-only validator (predictions about valid values).
- `11008ac1` (r2): **removed** `_usable` and the duplicate validator by moving it into
  `parse_llm_config`; **added** the same type prediction to the top level plus the
  `except → disabled` branch and an `agentic_models` rejection (source of R3-F1).
- `15b48d11` (r3): **removed** the `agentic_models` rejection (now a skip), **widened** the
  existing absence test from "key missing" to "value null" (no new branch), and replaced two
  inline mapping checks with one helper whose only new behaviour is `None → {}` (the `or {}`
  it replaces already did that). App code +18/−13. No new state, no new prediction.

Does this round add a branch, state or prediction the round before also added? **No.** It
narrows round 2's top-level prediction instead of adding exceptions to it, and the per-field
cases R3 warned about (null for `api_key`, null for `agentic_models`, …) were not added — one
rule was. The series is **converging**.

The caveat is R4-F1: the top-level type prediction added in `11008ac1` is still the source of
the only remaining invariant-4 differences. If round 5 answers it with per-key coercions
(`False → "off"`, float → int, …) that would be a second round adding cases to the same
validator, i.e. patching. Answering it by removing the prediction (wrong kind = absent, drop
the `except` branch) would continue the convergence.

TOTAL: 4 findings
