# PR-1 review, round 3 — fix commit `11008ac1` (intelligence addon)

Reviewed `11008ac1528cd92701ed990ce12587c98ba46f44` on its own (parent `69174e17`)
in a worktree fixed at that SHA. Baseline: full `tests/` 2827 passed, 2 skipped.
Mutation runs: `tests/test_llm_routing.py tests/test_policy_client.py tests/test_config.py`
(121 tests); tree restored with `git checkout -- .` after each. Top-level behaviour
was compared by running one `load_settings()` probe (`search-config.yml` with only an
`llm` section, `LLM_API_KEY` unset) against this SHA and against a second worktree
at `69174e17`.

## R2 verification

| R2 | reproducing mutation | want | result | verdict |
|---|---|---|---|---|
| F1 | F2c `environ.get(api_key_env, base.api_key)` | kill | killed (`test_named_but_unset_key_env_gives_no_key`) | closed |
| F2 | P04 cache every verdict (`if True:`) | kill | killed (`test_lookup_feature_does_not_cache_a_malformed_body`) | closed |
| F3 | F3i drop `profiles.<name> must be a mapping` | kill | killed (row `cloud`) | closed |
| F3 | F3g `agentic ... is not False` | kill | killed (`test_agentic_is_off_unless_declared`) | closed |
| F3 | F3h drop `llm.routing must be a mapping` | kill | **live** | **not closed** (R3-F3) |
| F4 | F3f drop the bool loop | kill | killed (rows `offhost`, `agentic`) | closed |
| F4 | F3j bool loop covers `offhost` only / `agentic` only | kill | killed / killed | closed |
| F5 | R5 skip the `reasoning` enum branch (bogus kept) | kill | killed (2) | closed |
| F6 | X03 manifest `i18n_key` typo | kill | killed | closed on the manifest side; the key's presence in `frontend/messages/{en,ja}.json` is still not held (not re-raised, B) |
| F7 | revert to `_usable` (provider/model only, no `base_url`) | kill | killed (`test_unusable_profile_skips[base_url]`) | closed |
| F8 | F3d float knob accepts only `float` | kill | killed (2) | closed |
| F9 | C04 drop `offhost` from `llm_section` | kill | killed (`test_load_settings_legacy_section[...False]`) | closed |

## Mutation table (this commit's code)

| id | mutation | want | result |
|---|---|---|---|
| N01 | on `LLMConfigError`, `LLMConfig()` instead of `LLMConfig(provider="disabled")` | live (equivalent: default provider is `disabled`) | live |
| N02 | on `LLMConfigError`, build the config unvalidated (parent behaviour) | kill | killed (`model: 123` row) |
| N03 | `_same_kind` int branch accepts bool | kill | killed |
| N04 | `_coerce_agentic_models` non-list → `()` instead of raise | kill (declared rejection) | **live** — see R3-F1 |
| N05 | `parse_llm_config` ignores `base` (`start = LLMConfig()`) | kill (profiles inherit tuning knobs) | **live** — R3-F4 |
| N06 | profile starts from `base` without clearing connection fields | kill | killed (3) |
| N07 | drop the `vision and not vision_model` Skip | kill | killed |
| N08 | drop the unknown-keys check | kill | killed (2) |
| N09 | `reasoning: null` kept as `None` (parent's guard) | kill (behaviour changed at top level) | **live** — R3-F2 |
| N10 | drop `not client.enabled` | kill | killed (3) |
| N11 | drop the `_same_kind` check in `parse_llm_config` | kill | killed (6) |
| N12 | str branch of `_same_kind` returns True | kill | killed (4) |
| N13 | bool branch of `_same_kind` returns True | live (no bool field in `LLMConfig`) | live |
| N14 | profile `LLMConfigError` swallowed (config = knobs) | kill | killed (5) |
| N15 | unknown `reasoning` falls back to `start.reasoning` instead of the field default | live for the top level (start is the default); kill for profiles | live — the test's `BASE.reasoning` is the default, so the two are indistinguishable; which one a profile should get is unspecified (not raised) |
| N16 | pass `offhost`/`agentic`/`api_key_env` into `parse_llm_config` | live (non-fields ignored) | live |
| N17 | `api_key_env` not in `_PROFILE_KEYS` | kill | killed (36) |
| N18 | profiles accept `agentic_models`/`agentic_mode`/`agentic_min_capability` | kill | **live** — pre-existing (same set at `69174e17`, no row then either); ledger, B |

## Top-level probe: same input, parent vs this commit

`provider`/`enabled` are the effective top-level `LLMConfig` and `create_llm_client(...).enabled`.

| `llm` value (plus a working provider/base_url/model) | `69174e17` | `11008ac1` |
|---|---|---|
| `api_key:` (null), openai_compatible | kept None, client uses `"not-needed"`, **enabled** | **provider `disabled`, all LLM off** |
| `agentic_models:` (null), `agentic_mode: off` | kept None, never iterated, **enabled** | **disabled** |
| `agentic_models: {}` / `"qwen"` | kept, never iterated with mode off, enabled | disabled |
| `vision_model:` (null) | kept None; `llm.py` guards `not vision_model` / `vision_model or ""`; text **enabled** | **disabled** |
| `output_language:` / `temperature:` / `max_tokens:` (null) | kept None, enabled | disabled |
| `reasoning:` (null) | None → reasoning not suppressed (`!= "disabled"`) | `"disabled"` → suppression field sent |
| `max_tokens: 4096.0`, `retry_attempts: 3.0`, `min_request_interval_ms: 250.5` | passed through, enabled | disabled |
| `max_tokens: "4096"`, `temperature: "0.3"`, `model: 123`, `provider: null`, `agentic_mode: true` | passed through (wrong type reaches the client) | disabled |
| `temperature: 0`, `reasoning: bogus`, `provider: bogus`, list `agentic_models`, `llm: null`, `offhost: false` | same | same |

Nothing that `69174e17` rejected at the top level is accepted now (the parent rejected nothing
there). On a profile, `reasoning: null` / `reasoning: 5` were rejected at the parent and now fall
back to `"disabled"`, matching the top level; not a finding.

## Findings

### R3-F1 — HIGH — [introduced] — A (breaks invariant 4) — a YAML null in the top-level `llm` section now turns every LLM feature off

`app/config.py` `load_settings`: the `llm` section goes through `parse_llm_config`, whose
`_same_kind` rejects `None` for every `str`/`int`/`float` field and whose
`_coerce_agentic_models` raises on a non-list; the new `except LLMConfigError` then replaces
the whole section with `LLMConfig(provider="disabled")` (only a `logger.error`).

Evidence (probe above, same file both SHAs): `api_key:` left blank — the ordinary YAML
spelling for "no key", e.g. an ollama or keyless local `openai_compatible` install with
`LLM_API_KEY` unset — ran at `69174e17` (`enabled=True`, `LLMClient` sends
`api_key or "not-needed"`) and is fully disabled at `11008ac1`. The same for
`agentic_models:` with its entries commented out (the example ships `agentic_models: []`
followed by commented entries; mode `off` never iterates it) and for `vision_model:` left
blank (the client already guards a falsy `vision_model`). Through the legacy routing these
installs now resolve `Skip` for every feature. Invariant 4 requires an install without
`llm.profiles` to keep sending to the same provider/model. N04 surviving shows the
`agentic_models` rejection is not held by any test either way; no test covers a null value.

The probe also shows float-for-int (`max_tokens: 4096.0`) and wrongly typed values
(`"4096"`, `123`) now disable; those were already broken or half-broken at the parent
(the value reached the client), so whether the top level should be strict for them is a
design choice for the supervisor. The null cases are not: they worked.

Suggested fix (not applied): make "null means absent" the one rule in `parse_llm_config`
(skip a `None` value, both surfaces), and treat a non-list `agentic_models` as absent
rather than raising at the top level; add `load_settings` rows for `api_key: null`,
`agentic_models: null`, `vision_model: null` asserting the provider survives. Whether any
remaining top-level type error should disable LLM or be dropped per key is the supervisor's
call — the round-2 triage asked for one parser for profiles, not for a stricter top level.

### R3-F2 — LOW — [introduced] — B — `reasoning: null` at the top level changes meaning, unheld

Parent: `raw_reasoning is not None` guard kept `None`, so `LLMClient` (`reasoning != "disabled"`)
did **not** send the suppression field. Now `None not in LLM_REASONING_ENUM` → `"disabled"`
→ the field is sent (one 400 then dropped on providers that reject it). N09 survives.
Arguably the better reading (null = absent = default), and consistent with R3-F1's
suggested rule; recorded because it is a top-level change no test states.
Suggested fix: if "null means absent" is adopted, this becomes that rule's row.

### R3-F3 — LOW — [pre-existing] (R2-F3 carry-over; the row added here does not hold it) — A (inv 11 once callers move) — `routing` non-mapping check still unheld

The new row `s.update(routing=[])` never reaches the check: `llm_section.get("routing") or {}`
turns `[]` into `{}`, and the row passes on "`llm.routing.default is required with several
profiles`", whose text contains the needle `routing` (the R2-F4 shape). F3h survives. Under
F3h, `routing: "x"` (truthy non-mapping) raises `AttributeError: 'str' object has no attribute
'get'` out of `build_routing` (probe), so every `resolve` would raise.
Suggested fix: use `routing="x"` (or `["local"]`) and the needle `must be a mapping`.

### R3-F4 — LOW — [introduced] (new `base` parameter; the test was already weak) — B — inheritance of tuning knobs into profiles is unheld

N05 (`parse_llm_config` ignores `base`) survives: `test_profile_inherits_tuning_knobs_only`
checks `temperature == 0.3`, which is also the field default. A profile silently losing the
top-level `max_tokens` / `request_timeout_seconds` would pass.
Suggested fix: give `BASE` a non-default knob (e.g. `max_tokens=16000`) and assert it on
the profile.

### R3-F5 — LOW — [introduced] — B — whitespace-only `model` now resolves instead of skipping

`resolve` reads `client.enabled`, which is `bool(config.model)`; the removed `_usable`
used `model.strip()`. A profile with `model: " "` now returns `Resolved` with a client that
sends a blank model id (request failure per job rather than `Skip`). Unlikely input.
Suggested fix: none required; if wanted, strip in the parser, not in `resolve`.

### R3-F6 — LOW — [introduced] — B — "LLM features disabled" log is wrong when profiles exist

With `llm.profiles` present, a wrongly typed top-level knob logs
"Invalid llm section, LLM features disabled", but the profiles still serve (built over
`LLMConfig()` defaults, so every top-level tuning knob is silently dropped for them).
An operator reading the log would look in the wrong place. Suggested fix: drop the clause
or name the profiles case; no behaviour change needed.

## Trajectory

- `ac52d2cd` (change) — baseline.
- `69174e17` (round-1 fix): F1 **removed** a state (two globals → one `_Active` snapshot);
  F2 replaced an inherit-then-subtract rule with one copy rule (neutral/converging);
  F3 **added** a profile-only validator (`_PROFILE_FIELDS`, `_same_kind`, bool loop) —
  predictions about valid values, a second parser beside `config.py`.
- `11008ac1` (round-2 fix): **removed** the `_usable` prediction (now read from
  `client.enabled`) and **removed** the duplicate validator by moving it into
  `parse_llm_config`. Net app code: `llm_routing.py` −41/+20; `config.py` +71/−45 of which
  most is the moved coercion. The profile path now has one rule instead of two.

So the answer to "does each round add what the round before added?" is **no** for the
profile side: this round removed more predictions than it added, and the R2 findings closed
without new special cases in `_build_profile`. It did add **one** thing no finding asked
for: applying the type prediction to the top-level section plus a new branch
(`except LLMConfigError → disabled`) and a new rejection (`agentic_models` non-list). That
single addition is where R3-F1 comes from. If round 4 answers R3-F1 by adding per-field
exceptions (null for `api_key`, null for `agentic_models`, …) to the parser, that would be
the second round adding predictions to the same validator; one uniform rule ("null is
absent") or keeping the top level as lenient as it was would not.

TOTAL: 6 findings
