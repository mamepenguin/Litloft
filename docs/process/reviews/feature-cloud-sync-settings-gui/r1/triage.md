# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: `tzdata` from PyPI now decides which zone names the backend accepts. Item 10 of the spec assumed only the image's system zoneinfo.; If `SyncConfig` rejects a body that settings.py accepted, PUT answers 500 instead of 422. This can only happen if the two copies of the rules drift apart.
- claude-read: `tzdata` from PyPI now decides which zone names the backend accepts. Item 10 of the spec assumed only the image's system zoneinfo.
- claude-read: If `SyncConfig` rejects a body that settings.py accepted, PUT answers 500 instead of 422. This can only happen if the two copies of the rules drift apart.

## Findings

A: 0
B: 3
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The change adds a new runtime dependency (`tzdata`, unpinned) to `addons/cloud-sync/backend/requirements.txt`, a file the touch-point list does not name, and the spec it implements says the change adds no new dependency.
Impact: Every backend image build now installs an extra, unpinned package from PyPI (backend/Dockerfile:21-23 pip-installs every addon requirements.txt). Its version moves with each rebuild. Zone acceptance (`is_valid_timezone`, which the I2/I6/I9 behaviour relies on, including the `Asia/Calcutta` alias the tests expect) now depends on that package instead of the image's system tzdata. Nobody planned or reviewed this as a build-surface change.
Evidence: addons/cloud-sync/backend/requirements.txt: `+# Keeps legacy zone names (Asia/Calcutta) that browsers report and slim tzdata drops.` `+tzdata`. backend/Dockerfile:21-23 installs it into the backend image. The spec's item 10 says: 'No new dependency: `zoneinfo` and `croniter` are already available in the backend image'. The touch-point list names backend/schemas.py, service.py and router.py, and does not name requirements.txt.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `backend/requirements.txt` (tzdata) to the touch points and correct the spec's 'No new dependency' line, or drop the package if the system zoneinfo is enough. Consider pinning a version range, as croniter is pinned.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The PUT body validation was put in a new module, `addons/cloud-sync/backend/settings.py`, which the touch-point list does not name; the list places that validation in `backend/schemas.py`.
Impact: The load-time rules now exist twice: once in the `SyncConfig`/`SyncMapping` validators (schemas.py) and once in settings.py (`_check_row`, `_check_cross_rows`, `_check_schedule`, and so on). If a later rule change touches only one copy, PUT and load disagree. A body that settings.py accepts but `SyncConfig` rejects raises inside `checked.to_config()` (service.py save_config) and answers 500 instead of the 422 `{errors}` shape. The file is still not written in that case, so I3's 'unchanged file' part holds, but its '422 in the {errors} shape' part would not.
Evidence: New file addons/cloud-sync/backend/settings.py (208 lines: `check_body`, `BodyCheck.to_config`). It is imported in service.py as `from .settings import ConfigError, check_body`. The touch-point list says: '`backend/schemas.py`: ... the PUT body validation that collects every error'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `backend/settings.py` to the touch points.

</details>

### claude-read:TP-3 — bucket B, INFO, open

Claim: Three new frontend modules sit outside the settings-section component and are not the listed `api.ts`: `frontend/settingsApi.ts` (the GET/PUT /config client), `frontend/settingsDraft.ts` (remote split/join, zone choice) and `frontend/scheduleForm.ts` (cron/preset round trip).
Impact: These modules carry the I9 round-trip logic (scheduleToCron/cronToSchedule, splitRemote and the join in toBody, initialZone). The touch-point list names `api.ts` for the API client and a Container/Presenter component for the section. A reviewer who follows that list would look for the /config client and the round-trip logic in the wrong files.
Evidence: New files in the diff: addons/cloud-sync/frontend/settingsApi.ts, settingsDraft.ts and scheduleForm.ts. `api.ts` changes only `SyncStatusResponse.timezone`. The touch points say: '`frontend/`: a new settings section component (Container/Presenter ...), `slots.ts`, `api.ts`, ...'.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List settingsApi.ts, settingsDraft.ts and scheduleForm.ts in the touch points.

</details>

## Not verified

- claude-read: Whether commit 230fc0b on its own (subject 'docs: record R-5') touches only docs/process/reviews. I could not run git, so I reviewed the branch diff that was supplied.
- claude-read: The truncated tail of the diff (after test_settings_config.py), which may touch further addon files such as .gitignore, test_router.py or test_preflight.py.
- claude-read: Whether python:3.12-slim's system zoneinfo already includes Asia/Calcutta, which would decide whether tzdata is needed at all.
- claude-verify: I could not run git diff, so I did not confirm that tzdata, settings.py, settingsApi.ts, settingsDraft.ts and scheduleForm.ts were introduced by commit 230fc0b rather than earlier.
- claude-verify: Whether the slim image's zoneinfo lacks the legacy zone names without the tzdata package.
- claude-verify: The declared invariants I1-I10. They were not part of the findings to verify.

TOTAL: 3 findings
