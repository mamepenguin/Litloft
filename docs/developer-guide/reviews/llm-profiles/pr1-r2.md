# PR-1 review, round 2 — fix commit `69174e17` (intelligence addon)

Reviewed `69174e175b864c0cb7067af06ea584b92d603c35` on its own (parent `ac52d2cd`,
reviewed in round 1) in a worktree fixed at that SHA. Baseline: full `tests/`
2812 passed, 2 skipped. Mutation runs: `tests/test_llm_routing.py
tests/test_policy_client.py` (plus files named in the row); tree restored with
`git checkout -- .` after each.

## Per-finding verification (round-1 F1–F8)

| F | round-1 defect | reproducing mutation (now) | result | verdict |
|---|---|---|---|---|
| F1 | swap during `await` stores old client in new cache | F1a `_client_for(_current(), profile)` (write into whatever is current) | killed (1: `test_swap_during_a_policy_lookup_never_hands_out_the_old_client`) | fixed |
| F1 | cache survives a swap | F1b `set_routing` carries `_active.clients` into the new `_Active` | killed (2) | fixed |
| F2 | provider inherited | F2a `raw.get("provider", base.provider)` | killed (1) | fixed |
| F2 | base_url/model/vision_model inherited | F2b / F2f drop fields from `_CONNECTION_FIELDS` | killed (3 / 1) | fixed |
| F2 | no `api_key_env` → top-level key | F2d `environ.get(api_key_env or "LLM_API_KEY")` | killed (1) | fixed |
| F2 | M12: YAML `api_key` on a profile | F2e allow `api_key` in `_PROFILE_FIELDS` | killed (1) | fixed |
| F2 | M11: `api_key_env` named but unset → base key | F2c `environ.get(api_key_env, base.api_key)` | **live** | **not fixed** (R2-F1) |
| F3 | wrong-typed values raise at resolve | F3a drop `_same_kind` check | killed (5) | fixed |
| F3 | unknown key accepted | F3b drop `_PROFILE_FIELDS` membership check | killed (1) | fixed |
| F3 | M18 `routing: []` | F3h drop `llm.routing must be a mapping` | **live** | **not fixed** (R2-F3) |
| F3 | M23 `profiles.x: "str"` | F3i drop `profiles.<name> must be a mapping` | **live** | **not fixed** (R2-F3) |
| F3 | M22 `agentic` absent → True | F3g `is not False` | **live** | **not fixed** (R2-F3) |
| F4 | body-derived `unknown` cached | P04 cache every verdict (`if True:`) | **live** | **not fixed** (R2-F2) |
| F5 | P02 no `default` → allowed | P02 | killed (3) | fixed |
| F5 | P03 non-dict body | P03 | killed (1) | fixed |
| F5 | P01 non-bool feature value | P01 truthiness | killed (1, new row) | fixed |
| F6 | P14 wrong drive asked | P14 | killed (1) | fixed |
| F6 | P07 shared cache | P07 `_strict_cache = _cache` | killed (1) | fixed |
| F7 | C01 `profiles` not copied | C01 | killed (1) | fixed |
| F7 | C02 `_load_from_settings` ignores section | C02 | killed (1) | fixed |
| F8 | X01 `llm_cloud` removed from manifest | X01 / X02 (`default: false`) | killed (1 / 1) | fixed (i18n key not held, R2-F6) |

## Mutation table (this round)

`want` declared before running.

| id | mutation | want | result |
|---|---|---|---|
| F1a | `_client_for(_current(), profile)` | kill | killed |
| F1b | new `_Active` inherits previous `clients` | kill | killed |
| F2a | `provider` falls back to `base.provider` | kill | killed |
| F2b | `_CONNECTION_FIELDS = ("provider", "api_key")` | kill | killed (3) |
| F2c | unset `api_key_env` → `base.api_key` | kill | **live** |
| F2d | no `api_key_env` → `LLM_API_KEY` | kill | killed |
| F2e | `api_key` allowed as a profile setting | kill | killed |
| F2f | `vision_model` inherited | kill | killed |
| F3a | skip `_same_kind` | kill | killed (5) |
| F3b | skip `_PROFILE_FIELDS` check | kill | killed |
| F3c | `_same_kind` bool branch returns True | live (no bool field in `LLMConfig`; equivalent) | live |
| F3d | float knob rejects int (`isinstance(value, float)`) | kill (legit `temperature: 0` rejected) | **live** |
| F3e | int knob accepts bool | kill | killed |
| F3f | drop `offhost`/`agentic` bool check | kill | **live** |
| F3g | `agentic` absent → True | kill | **live** |
| F3h | drop `llm.routing must be a mapping` | kill | **live** |
| F3i | drop `profiles.<name> must be a mapping` | kill | **live** |
| F3j | bool check covers `offhost` only | kill | **live** |
| P01 | feature value truthiness | kill | killed |
| P02 | missing `default` → allowed | kill | killed (3) |
| P03 | drop non-dict payload check | kill | killed |
| P04 | cache body-derived `unknown` (as False) | kill | **live** |
| P07 | share `_cache` | kill | killed |
| P14 | ask about drive `"x"` | kill | killed |
| C01 | drop `profiles` from `llm_section` | kill | killed |
| C02 | `_load_from_settings` passes `{}` | kill | killed |
| C03 | drop `routing` from `llm_section` | kill | killed |
| C04 | drop `offhost` from `llm_section` | kill | **live** |
| X01 | remove `llm_cloud` from manifest | kill | killed |
| X02 | manifest `default: false` | kill | killed |
| X03 | manifest `i18n_key` typo | kill | **live** |

Probes run outside the tree (`build_routing` / `resolve` against the worktree `app/`):

- Accepted as intended: `temperature: 0`, `temperature: 1`, `request_timeout_seconds: 60`,
  `request_connect_timeout_seconds: 5`, `retry_base_delay: 2`, `vision_temperature: 0`,
  `reasoning: auto`, `output_language: en`, `min_request_interval_ms: 250`,
  `provider: disabled`. Tuning knobs not set on a profile inherit (`reasoning`,
  `output_language`, `temperature` from the base).
- Rejected (whole routing disabled): `max_tokens: 4096.0`, `output_language: false`,
  `agentic_mode`, `agentic_models`, `agentic_min_capability` on a profile (none is in
  spec decision 1's list, so this is consistent with the design).
- Accepted but wrong: `reasoning: bogus` (R2-F5); `max_tokens: -1`, `temperature: -3`
  (no range check anywhere, same as the top-level section; not a finding).
- Legacy path (no `profiles`): `config == BASE`, `api_key_env == "LLM_API_KEY"`,
  `api_key == base.api_key`; `profiles: null` still disables. The fix does not touch
  the legacy branch beyond renaming the constant. Invariant 4 holds.
- `_Active`: `_client_for` writes only into the `_Active` captured at the top of
  `resolve`; the fallback profile is read from the same snapshot; nothing else writes
  to a clients dict. No path writes into another routing's cache.

## Findings

### R2-F1 — MEDIUM — [pre-existing] (round-1 F2, not fixed) — A (test lets inv 1 through) — unset `api_key_env` falling back to the top-level key is not held

`app/llm_routing.py` `_build_profile`, `knobs["api_key"] = environ.get(api_key_env, "") ...`.
F2c (`environ.get(api_key_env, base.api_key)`) survives. `base.api_key` carries
`LLM_API_KEY` (config.py merges the env var into `llm.api_key`), so under F2c a
cloud profile whose own env var is missing sends the top-level key to its endpoint —
the leak round 1 named as M11. The code is right today; no row holds it.
Suggested fix: add `("api_key_env set, env missing", environ={"LLM_API_KEY": "top-key"})`
→ `api_key == ""` to `test_profile_never_inherits_the_top_level_endpoint_or_key`.

### R2-F2 — MEDIUM — [introduced] — A (test lets inv 2 through) — the new F4 test cannot see a cached `unknown`

`tests/test_policy_client.py::test_lookup_feature_does_not_cache_a_malformed_body`.
P04 (cache every verdict; `unknown` is stored as `False`) survives: the second step
expects `"denied"`, which is exactly what the poisoned cache entry returns. So a
malformed 200 body still can be read as `denied` for the TTL (fallback/skip instead of
defer) without a test failing.
Suggested fix: make the second response `(200, {"default": True, "features": {}})` and
expect `"allowed"` (as `test_lookup_feature_does_not_cache_unknown` already does).

### R2-F3 — LOW — [pre-existing] (round-1 F3, not fixed) — A (inv 11 once callers move) — the rows round 1 asked for were not added

F3h (`routing: []` check dropped), F3i (`profiles.x: "str"` check dropped) and F3g
(`agentic` absent → True) all survive. Under F3h/F3i `build_routing` raises
`AttributeError` (not `_RoutingError`), so `_current()` raises on every `resolve`.
The code is correct; nothing holds it.
Suggested fix: rows `lambda s: s.update(routing=[])`, `lambda s: s["profiles"].update(x="str")`
in the invalid-routing table, and `agentic is False` for a profile without the key.

### R2-F4 — LOW — [introduced] — B — the `offhost: "no"` row passes for an unrelated reason

`test_invalid_routing_disables_every_profile_and_says_why[...offhost]` mutates the
`local` profile, which is also `local_fallback`. With the bool check removed (F3f, F3j)
`"no"` reads as offhost and the routing is disabled by
"`local_fallback 'local' must be offhost: false`", whose text contains the needle
`offhost`. The bool check for `offhost` and `agentic` is therefore unheld. Both
unchecked readings fail safe (`"no"` → offhost, `"yes"` → not agentic), so no user can
reach harm; recorded as B.
Suggested fix: mutate `cloud` (`offhost="no"`) and assert the needle `must be true or false`;
add `agentic="yes"`.

### R2-F5 — LOW — [pre-existing] (ac52d2cd; the new validator is where it belongs) — B — a profile's `reasoning` is not checked against the enum

Probe: `profiles.p.reasoning: bogus` is accepted. The top-level section coerces an
unknown value to `"disabled"` with a warning (`config.py`), but on a profile it is
kept, and `LLMClient` treats anything other than `"disabled"` as "do not suppress
reasoning" — so a typo like `reasoning: disable` on a profile turns reasoning *on*,
the opposite of the same typo at the top level, and reasoning models return empty
bodies on `finish_reason="length"`. Same shape for any future enum-valued knob:
`_same_kind` checks the Python type of the default, not the value set.
Suggested fix: validate enum knobs with the same rule as the top-level section
(reject → `_RoutingError`, or reuse `LLM_REASONING_ENUM`); see the trajectory note on
one parser.

### R2-F6 — LOW — [pre-existing] (round-1 F8 part not done) — B — manifest `i18n_key` is not held

X03 (typo in `intelligence.policyFeatures.llmCloud`) survives. The new manifest test
asserts names and defaults only; round 1 also asked that the key exist in both
message files. A broken key shows a raw key string on the AddonPolicy row.
Suggested fix: assert `i18n_key` resolves in `frontend/messages/{en,ja}.json`.

### R2-F7 — MEDIUM — [introduced] — A (inv 11 once PR-2 callers move) — a profile without `base_url` resolves instead of skipping

Before this fix a profile inherited `base_url`; now it gets `""`. `_usable` checks
`provider` and `model` only, so `{provider: openai_compatible, model: m, offhost: false}`
resolves to `Resolved` with a client whose `_enabled` is `False` (probe: `Resolved`,
`_enabled False`). That client returns `TextGeneration(None, FAILURE_REQUEST_FAILED)` /
`VisionGeneration(None, FAILURE_REQUEST_FAILED)` for every call, so once callers
use `resolve` each job records a request failure rather than a `Skip`, and
`build_routing(...).error` says nothing about the missing URL. (Not an inv-1 break:
an empty URL disables the client rather than defaulting to a vendor URL.)
Suggested fix: require a non-empty `base_url` for a non-`disabled` provider in
`_build_profile` (→ `_RoutingError`), or add `base_url` to `_usable`; add a row.

### R2-F8 — LOW — [introduced] — B — accepting an int for a float knob is not held

F3d (`_same_kind` float branch accepts only `float`) survives. Under it
`temperature: 0`, `request_timeout_seconds: 60`, `retry_base_delay: 2` — the common YAML
spellings — each disable every profile. Today's code accepts them (probe), no test says so.
Suggested fix: one accepted-values row (`temperature: 0`, `request_timeout_seconds: 60`)
asserting `routing.error is None` and the value is set.

### R2-F9 — LOW — [pre-existing] (ac52d2cd) — B — the legacy `offhost` key's load path is not held

C04 (drop `offhost` from the keys copied into `llm_section`) survives: a legacy YAML
with `llm.offhost: false` would silently become offhost. Fail-safe direction (more
lookups, possible skips on `llm_cloud: false` drives), so B.
Suggested fix: extend `test_load_settings_builds_routing_from_yaml_and_v1_overrides`
with `offhost: false` in the YAML and assert it on the `default` profile.

## Trajectory

Round 1 was the change itself; this is the first fix round, so the two-rounds rule
cannot fire yet. Reading the fix diff against `ac52d2cd`:

- **F1 converges.** Two independently swapped globals (`_routing`, `_clients`)
  became one `_Active` snapshot. That removes a state rather than adding one.
- **F2 converges in shape.** `dataclasses.replace(base, **overrides)` (inherit
  everything, subtract `api_key`) became "copy knobs, never the connection". One
  inheritance rule instead of an exception list.
- **F3 adds.** `_PROFILE_FIELDS`, the bool loop for `offhost`/`agentic`, and
  `_same_kind` with four type branches are new predictions about what a valid value
  looks like. They are a second parser of `LLMConfig` beside the one in
  `config.py` (which coerces `reasoning` and `agentic_models` but checks no types),
  and the two already disagree (R2-F5; R2-F7 is the connection-side gap of the same
  validator). If round 3 answers R2-F5 and R2-F7 by adding an enum branch and a
  `base_url` branch to this validator, that is the second consecutive round adding
  predictions to it — the pattern the workflow calls a design being patched.
  The shape that does not grow: build each profile's `LLMConfig` through one
  function shared with the top-level section (the same coercion and the same
  rejections for both), so a new knob or enum is handled once.

TOTAL: 9 findings
