# PR-1 review, round 1 — `ac52d2cd` (intelligence addon)

Reviewed at `ac52d2cd67c2ced63bbe3571236cadb22ddaf076` in a worktree fixed at that SHA.
Baseline: full `tests/` 2788 passed, 2 skipped. Mutation runs used
`tests/test_llm_routing.py tests/test_policy_client.py` (plus the files named in
the row); the tree was restored after each (`git checkout -- <file>`, status clean at the end).

## Touch-point question

Where the diff reaches that is not in the invariants' touch-point list:

- `frontend/messages/{en,ja}.json` — new `policyFeatures.llmCloud` strings. The
  list names only `AdminLLMSettingsSection.tsx` / `AdminFeaturesSettingsSection.tsx`.
  The user-facing text of the ceiling is a touch point (see the answer on the
  policy row below).
- `app/policy_client.py` module state shared with existing callers:
  `lookup_feature` sets `_observed_healthy` (ends the cold-start grace window
  for `is_feature_enabled(..., default_on_failure=False)`, i.e. `transcription_cloud`)
  and `reset_cache()` now also clears `_strict_cache`. Both are consistent with
  the existing meaning (core answered 200), so no missing invariant follows.
- `app/llm_routing.set_routing` / the per-name client cache: the hot-swap
  mechanics land in this PR, not PR-3. Invariant 8 is listed as out of scope
  for PR-1 but the code that must hold it is here (F1).

Everything else (`config.py`, `llm.py` `create_llm_client`, `llm_overrides.PROVIDER_ENUM`,
`policy_client`, `manifest.json`) is on the list.

## Mutation table

| id | mutation | want | result |
|---|---|---|---|
| M01 | `resolve`: skip offhost check (`if False`) | kill | killed (7) |
| M02 | `unknown` verdict falls through instead of `Defer` | kill | killed (2) |
| M03 | `denied` branch never taken | kill | killed (4) |
| M04 | always Skip on denied (ignore `local_fallback`) | kill | killed (2) |
| M05 | `_usable` ignores `vision` / `vision_model` | kill | killed (1) |
| M06 | `_usable` drops `provider == "disabled"` | kill | killed (1) |
| M07 | `_usable` drops empty-model check | kill | killed (1) |
| M08 | unknown feature no longer raises | kill | killed (1) |
| M09 | legacy `offhost is not False` → `is True` | kill | killed (1) |
| M10 | profile `offhost is not False` → `is True` | kill | killed (1) |
| M11 | `api_key_env` set but env missing → inherit `base.api_key` instead of `""` | kill | **live** (F2) |
| M12 | allow `api_key` from YAML profile (drop `k != "api_key"`) | kill | **live** (F2) |
| M13 | drop `local_fallback must be offhost: false` check | kill | killed (1) |
| M14 | drop unknown-feature check in `routing.features` | kill | killed (1) |
| M15 | single-profile implicit default `== 1` → `== 0` | kill | killed (1) |
| M16 | drop profile-name regex | kill | killed (1) |
| M17 | drop provider enum check | kill | killed (1) |
| M18 | drop `llm.routing must be a mapping` check | kill | **live** (F3) |
| M19 | drop `_require_profile` on `routing.default` | kill | killed (2) |
| M20 | `set_routing` keeps `_clients` | kill | killed (1) |
| M21 | `_client_for` never caches | kill | killed (1) |
| M22 | `agentic` absent → True (`is not False`) | kill | **live** (F3) |
| M23 | drop `profiles.<name> must be a mapping` check | kill | **live** (F3) |
| M24 | `features` in routing dropped (`{}`) | kill | killed (7) |
| P01 | `features[feature] is True` → truthiness | live | live (core always sends `bool`; F5) |
| P02 | payload without `default` → `"allowed"` | kill | **live** (F5) |
| P03 | drop non-dict payload check | kill | **live** (F5) |
| P04 | cache a body-derived `unknown` (as denied) | kill | **live** (F4) |
| P05 | 404 → `unknown` | kill | killed (1) |
| P06 | `reset_cache` keeps `_strict_cache` | kill | killed (9) |
| P07 | `_strict_cache = _cache` (share with `is_feature_enabled`) | kill | **live** (F6) |
| P08 | transport error → `denied` | kill | killed (1) |
| P09 | non-200/404 → `denied` | kill | killed (2) |
| P10 | never read the strict cache (TTL hit path) | live | live (acceptable: no test on cache hit) |
| P11 | non-JSON body → `denied` | kill | killed (1) |
| P12 | non-dict `features` treated as `{}` | kill | killed (1) |
| P13 | cache 500 as denied | kill | killed (1) |
| P14 | ask core for the wrong drive (`params={"drive": "x"}`) | kill | **live** (F6) |
| P15 | ignore explicit feature value (always use default) | kill | killed (2) |
| C01 | `config.py` `llm_section` drops `profiles` (+ `test_config*.py`) | kill | **live** (F7) |
| C02 | `_load_from_settings` passes `{}` instead of `llm_section` | kill | **live** (F7) |
| X01 | remove `llm_cloud` from `manifest.json` `policy_features` (+ manifest parity tests) | kill | **live** (F8) |

## Findings

### F1 — HIGH — [introduced] — A (inv 1; also inv 8) — client cache keyed by profile *name* is poisoned by a swap during an `await`

`app/llm_routing.py:235-240, 250-272`. `resolve` reads `routing` once, then
awaits `policy_client.lookup_feature`. If `set_routing` runs during that await,
`_clients` is replaced by a new empty dict, and `_client_for(old_profile)` stores
the **old** profile's client into the **new** cache under the same name. The next
resolve of the new profile with that name returns the old client.

Reproduction (test outside the tree, run against the worktree):
old routing `fast = {openai_compatible, https://cloud.example/v1, offhost: true}`;
the fake lookup calls `set_routing(new)` with `fast = {ollama, http://ollama:11434, offhost: false}`
and returns `allowed`. Then `resolve("private", "summaries")` with a lookup that
raises if called:

```
r2 client base_url: https://cloud.example/v1
AssertionError: new on-host profile served by the old cloud client
  Resolved(profile=LLMProfile(name='fast', config=LLMConfig(provider='ollama', base_url='http://ollama:11434' ...), offhost=False ...), client=<LLMClient ...>)
```

The private drive is never asked (the profile is on-host) and its content goes to
the cloud client; the `Resolved.profile` also claims the on-host model, so
provenance (inv 7) would record the wrong model. Reachable once PR-3 calls
`set_routing` on a GUI save; the mechanism is this PR's.

Fix: make the client cache part of the snapshot (store it on / alongside the
`LLMRouting` object read at the start of `resolve`), or capture `clients = _clients`
together with `routing` at the top of `resolve` and write only into that dict.
Add the reproduction above as a test.

### F2 — MEDIUM — [introduced] — raise to supervisor (A if inv 1 is read as covering it) — a profile inherits the top-level *connection*, not only tuning knobs

`app/llm_routing.py:184-201`. `dataclasses.replace(base, **overrides)` inherits
`provider`, `base_url` and `api_key` from the top-level `llm` section, not only the
tuning knobs spec decision 1 names. Consequences:

- A profile written as `local: {model: qwen3:14b, offhost: false}` (no `base_url`)
  on an install whose top-level `llm` points at a cloud endpoint is a declared
  on-host profile that sends to the cloud URL; it passes the `local_fallback`
  check and serves `llm_cloud: false` drives. Violates inv 1 in effect while every
  declaration is "correct".
- A profile that overrides `base_url` (another vendor) without `api_key_env`
  sends the top-level key (`LLM_API_KEY` / YAML `api_key`) to that host
  (see test line 92: `local` gets `base-key`). M11 (env named but unset → falls
  back to base key) and M12 (YAML `api_key` accepted on a profile) both survive,
  so neither key rule is held by a test.

Suggested fix: in profiles mode, require `provider` and (for non-`disabled`)
`base_url` and `model` on each profile, and derive `api_key` only from
`environ[api_key_env or "LLM_API_KEY"]`; add rows for M11/M12.

### F3 — MEDIUM — [introduced] — A (inv 11 once callers move) — malformed profile values raise from `resolve` instead of disabling routing

`app/llm_routing.py:188-201, 243-247`. Override values are not type-checked.
Reproduction (build + `resolve("d", "vision_describe", vision=True)`):
`model: 123` → `AttributeError: 'int' object has no attribute 'strip'` (line 245);
`vision_model: null` → `AttributeError` (line 247); `model: null` likewise.
`build_routing(...).error` is `None` for all three, so nothing reports the bad
config, and in PR-2 the exception will escape a worker as a failure (a failed
JobRecord / event) rather than a `Skip`. Same class, all untested: `routing:` a
list (M18) and `profiles.x:` a non-mapping (M23) would raise `AttributeError`
from `build_routing` (not caught as `_RoutingError`) if their checks were lost;
`agentic` absent → True (M22) survives.

Fix: validate each overridden field against the `LLMConfig` field type (str for
`provider/base_url/model/vision_model/...`, numbers for knobs) and raise
`_RoutingError`; add table rows for `model: 123`, `vision_model: null`,
`routing: []`, `profiles.x: "str"`, and `agentic` absent → False.

### F4 — MEDIUM — [introduced] — A (test lets inv 2 through) — caching a body-derived `unknown` is not held

`tests/test_policy_client.py` `test_lookup_feature_does_not_cache_unknown` only
covers the 500 path, which returns before the cache write. P04 (cache every
verdict, `unknown` stored as `False`) survives: a malformed 200 body would then
read as `denied` for the TTL and select the fallback / skip instead of deferring.
Fix: add the same two-step test with first response `(200, {})` (and `(200, {"default": True, "features": "x"})`).

### F5 — LOW — [introduced] — A (test lets inv 1/2 through) — `_strict_verdict` rows missing

`app/policy_client.py:209-220`. P02 survives: a 200 with `{"features": {}}` and
no `default` could be read as `allowed` and no row notices. P03 survives: without
the dict check a list body raises `AttributeError` out of `lookup_feature`
(only `ValueError` is caught) and no row notices. P01 (non-bool feature value)
survives; core coerces with `bool(...)` so it is not reachable today — note only.
Fix: add rows `(200, {"features": {}})` → `unknown`, `(200, [])` → `unknown`,
`(200, {"default": "yes", "features": {}})` → `unknown`.

### F6 — MEDIUM — [introduced] — A (test lets inv 1 through) — the drive asked and the cache separation are not held

- P14: `lookup_feature` can ask core about the wrong drive and every test passes;
  the fake `_Client.get` ignores `params`. The routing test holds the drive passed
  to `lookup_feature`, but not the drive sent to core.
- P07: sharing `_cache` with `is_feature_enabled` survives. That is exactly the
  hazard the separate cache exists for: `is_feature_enabled` caches its fail-open
  reading of a malformed body as `True`, which `lookup_feature` would then return
  as `allowed`.

Fix: make the fake client record `params` and assert `{"drive": "d", "addon": "intelligence"}`;
add a test that calls `is_feature_enabled("d", "llm_cloud")` against a malformed
200 body, then `lookup_feature("d", "llm_cloud")` against a failing client → `unknown`.

### F7 — MEDIUM — [introduced] — A (test lets inv 3/4 through) — the load path from `search-config.yml` / `llm-overrides.json` is untested

`app/config.py:1090-1094`, `app/llm_routing.py:212-215`. C01 (drop `profiles` from
the copied keys) and C02 (`_load_from_settings` ignores `llm_section`) both survive
with `test_config*.py` included. Under C01 every install with profiles silently
becomes the legacy single profile built from the top-level `llm` — the question
"can a YAML with `profiles` run the legacy path with a cloud base config" is
answered "no" by the code today, but nothing holds it. The plan's PR-1 row
"legacy config and v1 overrides resolve to the pre-change provider/model" is
tested only by passing `BASE` directly to `build_routing`; no test writes a v1
`llm-overrides.json` and checks the resolved `default` profile.
Fix: one `load_settings()`-level test per case: YAML with profiles → `current_routing()`
has those profiles; YAML without profiles + v1 overrides file → `default` profile
has the override provider/model and `offhost is True`.

### F8 — LOW — [introduced] — A (test lets inv 1 through) — `llm_cloud` row in `manifest.json` is not held

X01 (remove the `policy_features` entry) survives `test_admin_manifest_parity.py`,
`test_manifest_navigation.py`, `test_webhook_secret_scope.py`. Without the row the
AddonPolicy screen cannot show the switch, core answers `default: True`, and an
operator has no GUI way to turn the ceiling off. Fix: assert
`CLOUD_POLICY_FEATURE` is among `manifest.json` `policy_features` names with
`default: true` and an i18n key present in both message files.

### F9 — LOW — [introduced] — B — `resolve` trusts `local_fallback` to be on-host

`app/llm_routing.py:265-270`. The on-host property of `local_fallback` is checked
only in `build_routing`; `set_routing` accepts any `LLMRouting`, and `resolve`
returns the fallback without re-checking `offhost`. With a hand-built routing
whose `local_fallback` is offhost, a `denied` drive gets an offhost `Resolved`.
Not reachable from config today (every routing comes from `build_routing`).
Fix (cheap defence): after switching to the fallback, `Skip` if `profile.offhost`;
or have `set_routing` accept only the output of `build_routing`.

## Answers to the brief's questions

- **Offhost `Resolved` without `allowed` for that drive?** Through `build_routing`
  + `resolve` as written: no — every offhost candidate goes through `lookup_feature`,
  only `"allowed"` continues, and the fallback is validated on-host. The two
  inputs that break it are the swap race (F1; the cached client is offhost while
  the profile says on-host) and a hand-built routing (F9). F2 is the config-level
  way to get the same effect with every declaration "valid".
- **Malformed profile → legacy path with a cloud base config?** No. The legacy
  branch runs only when the `profiles` key is absent; `profiles: null`, `{}`,
  a bad name/provider or a non-mapping profile all go to `_disabled` (no
  profiles, `Skip`). Wrongly typed values do not disable either — they raise at
  resolve time (F3). Untested at the load level (F7).
- **`llm_cloud` row visible with no effect until PR-2?** Not reachable by a core
  user as long as the plan's order holds: core bumps the submodule only in PR-5,
  after PR-2 and PR-4. If the submodule were bumped before PR-2, the row and its
  help text ("When OFF, only local profiles are used") would claim a ceiling that
  no caller enforces — that would be an inv-1 break in the user's terms. Treat
  "no core bump before PR-2 merges" as the condition; no code finding.
- **Invariant 11 (`Skip`)**: `Skip` is a pure value with no side effects in this
  PR; the risk is exceptions that should have been `Skip` (F3).

TOTAL: 9 findings
