# cloud-sync is configured from /admin/settings instead of a hand-edited file

SPEC-ID: SPEC-ADDON-005
SPEC-ID: SPEC-ADDON-006
SPEC-ID: SPEC-ADDON-007

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

Today cloud-sync is configured only by hand: the owner writes
`addons/cloud-sync/sync-config.json`, bind-mounts it read-only into the backend, and
restarts the backend for a schedule change to take effect. The schedule is a cron
expression evaluated in UTC, so `0 3 * * *` runs at 12:00 in Japan. A file that is invalid
when the backend starts leaves the scheduler off until the next restart, even after the
file is fixed.

This change moves the configuration into the app. An admin edits the schedule,
`max_delete` and the mappings in a Cloud Sync section of `/admin/settings`. The addon
stores the result in `data/addons/cloud-sync/sync-config.json` and applies it at once,
without a restart. The schedule gains an optional time zone. There are no existing users
to migrate, so `addons/cloud-sync/sync-config.json` is no longer read at all: a fresh
install has no mappings until the admin adds them in the GUI. Creating or re-authorizing
rclone remotes stays on the host (`rclone config`); the GUI picks among the remotes the
container can see.

- SPEC-ADDON-005: the configuration is stored in the data directory, read and replaced
  through admin-only routes, and a replacement that breaks any rule is refused whole.
- SPEC-ADDON-006: a saved configuration takes effect without a restart, and the schedule
  is evaluated in its configured time zone.
- SPEC-ADDON-007: the Cloud Sync settings section in `/admin/settings`, and the dashboard
  card's way to it.

## Required items

### 1. Normal flow

1. An admin opens `/admin/settings`. The System tab shows a **Cloud Sync** section,
   injected through the existing `admin-settings-sections` slot (no core change).
2. The section loads `GET /api/addons/cloud-sync/config`, which returns the saved
   configuration (or an empty one), the drives the running backend knows
   (`config.load_drives()`, the same cached list the sync itself resolves drives
   from), each with whether its cloud-sync policy is on, and the rclone remotes the
   container can see (from `rclone listremotes`).
3. The admin edits:
   - **Schedule**: Off; Daily at HH:MM; Every N hours (N ∈ 1, 2, 3, 4, 6, 8, 12);
     Weekly on a weekday at HH:MM; or Custom (a 5-field cron expression).
   - **Time zone**: a select (see "Time zone control").
   - **Max deletions per sync** (`max_delete`, default 200).
   - **Mappings**: add, edit, delete. Each row has a drive (select from the drive
     list; a drive whose cloud-sync policy is off is offered with "(cloud sync off)"
     and can be saved, its card then shows **Off** as today), a folder inside it (text,
     empty = whole drive), a remote (select from the listed remotes) and a path on that
     remote (text). Under the drive select the section says that a drive added or
     renamed in the Drives section appears here after the backend restarts.
4. The admin presses **Save**. The section sends the whole configuration with
   `PUT /api/addons/cloud-sync/config`.
5. The addon takes the save lock, validates the body against every rule in
   "Validation", writes the file atomically, restarts the scheduler from what it wrote,
   releases the lock, and returns the saved configuration in the same shape as `GET`.
   The section renders from that response and shows "Saved".
6. The dashboard card (`/admin`) reads `GET /status` as today and shows the new mappings,
   schedule and next sync time.

### Stored file

`data/addons/cloud-sync/sync-config.json`, at `config.DATA_DIR / "addons" /
"cloud-sync"` resolved when it is used (not a module-level constant, so tests that patch
`config.DATA_DIR` take effect):

```json
{
  "schema_version": 1,
  "schedule": "0 3 * * *",
  "timezone": "Asia/Tokyo",
  "max_delete": 200,
  "mappings": [
    { "drive": "動画", "path": "仕事/録画", "remote": "gdrive:litloft/録画" }
  ]
}
```

A mapping's `path` is stored in its normalized form (the path rule of SPEC-ADDON-003),
so `GET` and the PUT response return `仕事/録画` for a typed `仕事//録画/`. `schedule` and
`timezone` may be `null` or absent. A `schedule` with a null or absent
`timezone` is evaluated in UTC. The file is written to a temporary file in the same
directory and moved into place with `os.replace`; a failed write removes the temporary
file.

### Remote field

A mapping's `remote` is stored as one string, as today. The section splits a stored
remote at its first `:` into a name (`gdrive:`, with the colon) and a path (everything
after the colon, as written). On save it joins them as name + path, with no separator
added and nothing normalized: `x:/a` and `x:a` are different places on some backends,
so the path is stored exactly as typed. The remote-root rule below drops empty segments
only to decide whether the path is empty.

### Time zone control

A select whose options are `UTC` followed by `Intl.supportedValuesOf("timeZone")`. Its
initial value:

- for a configuration with a `timezone`, that zone;
- for a saved configuration whose `timezone` is null, `UTC` (the zone it already runs
  in, so saving an unrelated edit does not move the schedule);
- for `source: "none"` or `"invalid"`, the browser's zone
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`) when it is among the options,
  otherwise `UTC`.

A stored zone that is not among the options (a tzdata alias such as `Etc/UTC` or
`Asia/Calcutta`) is added as an extra option and stays selected. The GUI always saves a
zone name, including when the schedule is Off. A zone the backend rejects is a
validation error like any other.

### Section never changes what the admin did not edit

Opening the section and saving with no edits writes back the same drive, path, remote,
schedule and time zone for every mapping (the path in its normalized form, and a null
`timezone` as `UTC`, which is the zone it already ran in). Unlisted drives, remotes and
zones stay selected; preset recognition only maps a cron to a preset when the preset
writes back exactly that cron; the remote split and join return the stored string.

### Validation

**Load-time rules** apply whenever the file is read (every `GET /status`, `GET
/config`, start, schedule tick, and startup). They are today's `SyncConfig` rules plus
the ones marked *new*:

- `schema_version` is `1` (*new*).
- `max_delete` is an integer ≥ 1.
- Every mapping `path` follows the path rule of SPEC-ADDON-003.
- No two mappings have the same drive and normalized path.
- No two remotes overlap by the remote rule of SPEC-ADDON-003.
- A remote does not start with `-` and contains `:`.
- A remote's path part (after the first `:`, empty segments dropped) is not empty
  (*new*): `gd:` and `gd:/` are refused, because a mirror into a remote's root deletes
  everything else on it.
- `schedule`, when not null, is a valid cron expression with exactly 5 fields (*new*;
  croniter also accepts 6). `""` is not null and fails this rule.
- `timezone`, when not null, is a name `zoneinfo.ZoneInfo` accepts (*new*).

A stored file that fails any of them is `invalid`: no mappings, no schedule, no
scheduler loop, `max_delete` 200 (as an invalid file behaves today).

**Save-time rules** apply only to `PUT /config`, in addition to the load-time rules
(the body carries no `schema_version`; the addon writes `1`). They check the environment,
which can change after a save, so a stored file is not re-checked against them on load;
the run's preflight handles a drive or folder that disappears later.

- Every mapping's drive is a name in `drives.json`.
- Every mapping's folder, the drive root itself when the folder field is empty, resolves
  (`realpath`) to an existing directory inside the drive root. A directory with no files
  is accepted; the sync refuses it at run time as `source_empty`.
- Every mapping's remote name (up to and including the first `:`) is in the output of
  `rclone listremotes`.

**Refusal shape.** Every refusal of a PUT body, including a body that is not an object,
is missing a key, or has a wrong type, answers `422` with
`{"errors": [{"mapping": int|null, "other": int|null, "field": str, "code": str,
"message": str}]}` and never FastAPI's default `{detail}`. The route takes the raw JSON
body and validates it itself. All violations are collected, not only the first.

- `mapping`: 0-based index of the row; `null` for a top-level field. For a duplicate or
  an overlap it is the later row, and `other` is the earlier row; `other` is `null`
  otherwise.
- `field` is one of `body`, `schedule`, `timezone`, `max_delete`, `mappings`, `drive`,
  `path`, `remote`.
- `code` is one of `invalid_body`, `missing_field`, `invalid_type`, `invalid_cron`, `invalid_timezone`,
  `max_delete_below_one`, `invalid_path`, `duplicate_mapping`, `remote_format`,
  `remote_root`, `remotes_overlap`, `unknown_drive`, `folder_not_found`,
  `remote_not_listed`, `remotes_unavailable`.
- `message` is English, for logs and API users. The section shows its own en/ja text
  chosen by `code`; row numbers in that text are 1-based.

The PUT body requires `schedule`, `timezone`, `max_delete` and `mappings` (the first two
may be `null`), and each row requires `drive`, `path` and `remote`. Keys not listed here,
`schema_version` included, are ignored. Malformed bodies map as follows:

| Case | `field` | `code` | `mapping` |
|---|---|---|---|
| Body not a JSON object | `body` | `invalid_body` | `null` |
| Top-level key missing | that key | `missing_field` | `null` |
| Top-level value of the wrong type (`mappings` not a list, `max_delete` not an integer, `schedule` or `timezone` not a string or null) | that key | `invalid_type` | `null` |
| Row not an object | `mappings` | `invalid_type` | row index |
| Row key missing | that key | `missing_field` | row index |
| Row value not a string | that key | `invalid_type` | row index |

When a row has a shape error, the other rules are not applied to that row.

### Saves are serialized

One `asyncio.Lock` covers validation, write and scheduler restart of a PUT. A second PUT
waits for the first. The scheduler restart cancels the old task and creates the new one
with no `await` in between, from the configuration just written. `start_scheduler`
cancels any task it replaces, so startup and a save cannot leave two loops.

`rclone listremotes` runs as an async subprocess (`asyncio.create_subprocess_exec`), and
the folder checks (`realpath`, `isdir`) and the file write run in a worker thread
(`asyncio.to_thread`), so a save never blocks other requests.

### 2. Failure cases

| Step | Failure | What happens |
|---|---|---|
| 2 | No saved file | `GET /config` returns `source: "none"` and an empty configuration (no schedule, `max_delete` 200, no mappings, `timezone` null). `/status` has no mappings and no schedule. |
| 2 | Saved file unreadable, not JSON, or fails a load-time rule | `GET /config` returns `source: "invalid"`, the reason, and an empty configuration; the section shows the reason and an empty form, and saving replaces the file. `/status` has no mappings and no schedule, and one `ERROR` line is logged per load, as for an invalid file today. |
| 2 | `rclone listremotes` fails, is missing, or takes longer than 10 s | The process is killed on timeout. `GET /config` answers `200` with `remotes: []` and `remotes_error` with the reason. The section says the container cannot see any rclone remotes. The rest of the form works. |
| 2 | `drives.json` cannot be read | `GET /config` answers `500`. The section shows "Could not load the Cloud Sync settings" with a **Retry** button and no form. |
| 2 | A stored mapping names a drive or remote not in the current lists | The select keeps the stored value as an extra option marked "not found" and selected; nothing is replaced silently. A save with it fails `unknown_drive` or `remote_not_listed` until the admin changes the row. |
| 5 | Any validation rule fails | `422` with the errors; the file, the scheduler and every run are unchanged. The section shows each error next to its field or row (cross-row errors above the list) and keeps the admin's edits. |
| 5 | `rclone listremotes` fails during a PUT that has mappings | One error `{mapping: null, field: "mappings", code: "remotes_unavailable"}` instead of a `remote_not_listed` per row; nothing changes. |
| 5 | `drives.json` cannot be read during a PUT | `500`; nothing changes; the section shows "Could not save the settings". |
| 5 | Writing the file fails (disk full, permissions) | `500`; the temporary file is removed; the previous file and the scheduler are unchanged; the section shows "Could not save the settings". |
| 2, 5 | Any other response (`403`, `502`, `504`) or a network failure | GET: as for a `500` (message, **Retry**, no form). PUT: "Could not save the settings"; the admin's edits stay in the form. |
| 5 | A mapping is removed or changed while it is syncing | The run continues to its end with the remote and `max_delete` it was reserved with, and stays in `/status` with its Cancel button until it ends (see "Running runs in /status"). |

### Running runs in /status

`get_status` lists the file's mappings in file order, then every reserved run whose
`(drive, path)` is not a mapping of the file, in the order they were reserved. Such an
entry carries the remote it is running against. When the run ends, the entry is dropped
and the mapping no longer appears.

A run's remote and `max_delete` are fixed when `start_sync` reserves it: `_run_rclone`
receives both and does not read the file again.

`GET /{drive}/log` looks the mapping up in the file and then among the reserved runs, so
the log of such a run can be read while it runs; after it ends the route answers `404`
as for any unknown mapping. The dashboard widget reloads `/status` when it receives
`sync:complete` or `sync:error`, so a card whose mapping was removed disappears when its
run ends instead of offering **Sync Now** / **Retry** that would answer `404`.

### 3. States

Configuration: `none` (no file) → `saved` on the first successful PUT; `saved` →
`saved` on each successful PUT; `invalid` → `saved` on a successful PUT. A refused PUT
never changes the state. Deleting every mapping saves a valid file with no mappings.

`saved` → `invalid` (a hand edit, a newer schema) and `saved`/`invalid` → `none` (the
file deleted on the host) happen only outside the app and are not supported: `/status`
reads the file on every call and follows it at once, while the scheduler keeps the loop
it had until the next save or restart.

Scheduler: set at startup from the stored file and at every successful PUT from the
file just written: `off` when that configuration has no schedule (or is `none` or
`invalid`), `running(schedule, timezone)` otherwise. Every successful PUT stops the
running loop, if any, and starts at most one new loop.

Per-mapping run states are unchanged from SPEC-ADDON-003.

### 4. Data read and written

- `data/addons/cloud-sync/sync-config.json`: read on every use, written by `PUT /config`.
  The directory is created on the first save.
- `addons/cloud-sync/sync-config.json`: no longer read. The `.example` file is removed
  from the addon repository; the `.gitignore` entry stays, so a leftover local file stays
  ignored and the submodule does not show as dirty.
- `drives.json` through `config.load_drives`, `config.get_drive_path`: read.
- Each mapping's folder: `realpath` and `isdir` at save time.
- `rclone listremotes`: run on every `GET /config` and every `PUT /config`. A PUT with no
  mappings never fails on it; its response carries the listing or `remotes_error` as
  `GET` does.
- The in-memory status map: an entry that is not syncing and whose `remote` differs from
  its mapping's current remote is not shown; `/status` shows that mapping as a fresh
  `idle` entry. This compares the stored entry's own `remote`, so it covers a remote
  changed during a run and a mapping removed and re-added with another remote.
- `data/cloud-sync-logs/`: unchanged.

### 5. External services

`rclone listremotes` only reads the rclone config; it makes no network call. It runs with
a 10 s timeout and is killed when the timeout passes. rclone and the cloud provider are
otherwise used as today.

### 6. Authorization

The new routes live on the existing router, which has `Depends(require_admin)`, so only
admins reach them (`403` otherwise, as for the other cloud-sync routes). The settings
section is rendered inside `/admin/settings`, whose layout already applies the admin
gate. `GET /config` lists every drive the backend knows and its cloud-sync policy; an
admin can already see every drive and edit every policy, so this reveals nothing new.

### 7. Effect on existing features

- `configure.py` no longer writes the `sync-config.json` bind mount, and `.cmux/setup`
  no longer links `addons/cloud-sync/sync-config.json` into a worktree.
- An existing `docker-compose.override.yml` that still mounts
  `./addons/cloud-sync/sync-config.json` is harmless while the host file exists (the
  container ignores it). If the host file is missing, as in a fresh worktree, Docker
  creates a directory at that path. The docs tell the owner to remove the mount line and
  the old file before the next `docker compose up`.
- The rclone config mount (`~/.config/rclone:/root/.config/rclone:ro`) is still written
  by the owner and now also fills the remote list.
- Every run, the schedule and `/status` read the new file; the per-mapping safeguards of
  SPEC-ADDON-003/004 (policy, source check, `max_delete`, one rclone per mapping, cancel
  before launch) are unchanged.
- The behaviour noted in SPEC-ADDON-003 item 7, that a file invalid at startup leaves the
  scheduler off until restart, is gone: the file changes through a save, and every save
  restarts the scheduler. A hand edit of the data file still needs a restart for its
  schedule; that is not a supported path.
- Data in `data/addons/cloud-sync/` is visible to independent-service addons that mount
  `./data:/data:ro`, as other addon data already is (accepted in
  `.claude/rules/design-decisions.md`). It holds remote names and paths, no credentials.
- Messages that say to edit `sync-config.json` (the empty-dashboard text, the
  `delete_limit` instructions and the stored `delete_limit` message) point to the
  settings section instead.
- Core is not changed apart from `configure.py`, `.cmux/setup` and docs.

### 8. Error behavior

- Refused save: each error shown by `code` next to its field or row; cross-row errors
  (`duplicate_mapping`, `remotes_overlap`) above the list naming both rows. Logged at
  `INFO` with the error list.
- `remotes_unavailable` on save: "Could not list the rclone remotes, so the mappings
  could not be checked."
- Write failure or `drives.json` unreadable on save: "Could not save the settings";
  `ERROR` log with the exception.
- Load failure: "Could not load the Cloud Sync settings" with **Retry**; `ERROR` log.
- Invalid saved file: "The saved settings could not be read: <reason>. Saving will
  replace them." `ERROR` log per load, as today.
- No remotes: "No rclone remotes are visible to Litloft. Create one on the host with
  `rclone config` and mount the rclone config into the backend." with a link to the docs.

### 9. User-visible behavior

- `/admin/settings` System tab: a **Cloud Sync** section after the core sections. It
  appears only when the cloud-sync addon is installed.
- Schedule presets are recognized from the stored cron: `M H * * *` is Daily,
  `0 */N * * *` with N in the list is Every N hours, `M H * * D` with one weekday 0–6 is
  Weekly; anything else is Custom with the expression. Saving a preset stores exactly
  that shape.
- The section shows the next sync time from the backend (`next_sync_at`, computed in the
  configured zone), formatted in the browser's locale and zone.
- Mapping rows keep the order of the file; a new row is appended; rows are not
  reordered.
- After a save the section shows "Saved" until the next edit; the dashboard card shows
  the new configuration the next time it loads `/status`.
- Dashboard card: a **Settings** link to `/admin/settings`. With no mappings the card
  reads "Cloud Sync is not set up yet." with the same link.
- The card's schedule line:
  - `*/N * * * *`: "Every N minutes" (as today).
  - `M */N * * *` with a numeric minute: "Every N hours" (as today).
  - `M H * * *`: "Daily at HH:MM (<zone>)".
  - `M H * * D`: "Weekly on <weekday> at HH:MM (<zone>)". Today's `describeCron` shows
    this as daily; that is fixed here.
  - Anything else: the expression followed by "(<zone>)".
  - `<zone>` is the configured zone, or `UTC` when it is null.
- `GET /status` gains `timezone`.

New routes under `/api/addons/cloud-sync`:

| Method | Path | Body / response |
|---|---|---|
| `GET` | `/config` | `{source: "none"\|"saved"\|"invalid", error: string\|null, config: {schedule, timezone, max_delete, mappings[]}, drives: [{name: string, enabled: bool}], remotes: string[], remotes_error: string\|null, next_sync_at: string\|null}` |
| `PUT` | `/config` | Body `{schedule, timezone, max_delete, mappings[]}`; `200` with the same shape as `GET`; `422` as in "Refusal shape" |

### 10. Non-functional

- `GET /config` and `PUT /config` run `rclone listremotes` once per call (10 s cap). The
  section loads `GET` on open and on **Retry**, and renders from the PUT response after
  a save.
- One scheduler loop at most, whatever the number or overlap of saves.
- No new dependency: `zoneinfo` and `croniter` are already available in the backend
  image (`Asia/Tokyo` resolves in the running container).

## Touch points

Addon repository (`addons/cloud-sync`, submodule):

- `backend/schemas.py`: `SyncConfig` gains `schema_version`, `timezone`, the cron and
  remote-root rules; the PUT body validation that collects every error; response models
  for `/config`; `SyncStatusResponse.timezone`.
- `backend/service.py`: config location and `_load_config`, the save routine (lock,
  validation, atomic write, scheduler restart), `rclone listremotes`, `start_sync` and
  `_run_rclone` (remote and `max_delete` fixed at reservation), `_get_next_sync_at` and
  `_scheduler_loop` (time zone), `get_status` (`timezone`, running runs not in the file,
  stale-remote entries), the `delete_limit` stored message.
- `backend/router.py`: `GET /config`, `PUT /config`, `get_log` (reserved runs);
  `ADDON_META.slots` gains `admin-settings-sections` with entry id
  `cloud-sync-settings`, the key `slots.ts` registers the section under.
- `frontend/`: a new settings section component (Container/Presenter, per
  `.claude/rules/frontend-conventions.md`), `slots.ts`, `api.ts`, `CloudSyncWidget.tsx`
  (`describeCron`, settings link, empty state, reload `/status` on a run's end),
  `SyncDriveCard.tsx` (`delete_limit`
  text), `messages/en.json`, `messages/ja.json`, tests (including
  `SyncDriveCard.test.tsx`, which asserts the `sync-config.json` wording).
- `tests/` (backend), including the fixtures that write the old file location
  (`mapping_world.py`, `test_folder_mapping_config.py`, and any in `test_router.py`,
  `test_config.py`), and `test_preflight.py`, which patches `_load_config` for
  `max_delete` and moves to the value fixed at reservation.
- `sync-config.json.example` (removed), `README.md`.

Core repository:

- `addons/cloud-sync` gitlink (pointer bump after the addon merges).
- `configure.py` (drop the sync-config mount and nothing else: the rest of the generated
  override stays byte-identical; a HIGH risk zone) and `tests/test_configure.py` (assert
  it is not written).
- `.cmux/setup` (drop the sync-config link).
- `docs/addons/cloud-sync.md`, `docs/reference/configuration.md`,
  `docs/reference/api.md` (`GET`/`PUT /config`, `timezone` in `/status`),
  `docs/admin-guide/settings-gui.md` (the new section),
  `docs/admin-guide/backup-restore.md` (the config now lives in `data/`),
  `docs/ADDON-DEVELOPMENT.md` (cloud-sync's slots and settings surface).
- Rules passed through: `.claude/rules/design-decisions.md` (drive boundary, addon
  policy, addon data mount exposure), `.claude/rules/backend-conventions.md` (`import
  app.config as config`, atomic writes, realpath containment),
  `.claude/rules/frontend-conventions.md` (DESIGN.md, i18n in the addon's messages,
  Container/Presenter).
- No protected path is edited.

## Invariants

I1. Neither the addon nor `configure.py` uses `addons/cloud-sync/sync-config.json`: the addon never reads it, `configure.py` never mounts it, and with no file in `data/addons/cloud-sync/` there are no mappings, no schedule and no scheduler loop.
I2. At startup and after each save, a stored file that fails any load-time rule, including `schema_version` other than 1, a remote with an empty path, a cron without exactly 5 fields, or an unknown time zone, yields `source: "invalid"`, no mappings, no schedule and no scheduler loop.
I3. A `PUT /config` that fails any load-time or save-time rule, has a malformed body, or fails to write leaves the stored file byte-for-byte unchanged with no temporary file behind, the scheduler as it was, and every run untouched; a rule or body failure answers `422` in the `{errors}` shape. No reader ever sees a partially written file.
I4. After any sequence of saves, including overlapping ones, exactly one scheduler loop runs when the stored schedule is non-null and none when it is null, and that loop uses the schedule and time zone of the last file a save wrote; the next `GET /status` reflects the save without a restart.
I5. A save never terminates, restarts or re-targets a run in progress: the run keeps the remote and `max_delete` it was reserved with, stays listed in `/status` with its cancel route working until it ends, and records its end.
I6. A schedule with a `timezone` fires at the wall-clock time it names in that zone (`0 3 * * *` with `Asia/Tokyo` fires at 18:00 UTC), and one without a `timezone` fires in UTC.
I7. A save whose mapping names a drive not in `drives.json`, a folder (or, with an empty folder, a drive root) that does not resolve to a directory inside its drive root, or a remote whose name is not in `rclone listremotes` is refused.
I8. Every `/config` route answers `403` to a non-admin and never reads or writes the file for one.
I9. Opening the settings section and saving without edits leaves every mapping's drive, path, remote and the schedule unchanged, and the time zone unchanged (a null zone saved as `UTC`), including a drive, remote or zone that is not in the current lists.
I10. `/status` never shows, for a mapping that is not syncing, a `last_synced_at`, `last_result` or error recorded against a remote other than the mapping's current one.

## Checked, no action

- Reading the old `addons/cloud-sync/sync-config.json` as an initial value: rejected by
  the owner; there are no existing users, and the GUI is the only way to configure.
- Creating or re-authorizing rclone remotes from the GUI: out of scope. OAuth needs a
  browser on the host and a writable rclone config.
- Optimistic concurrency (ETag) on `PUT /config`: not added. One admin edits the
  settings; saves are serialized and the last one wins.
- Re-checking save-time rules on load: not done. A drive unmounted after a save is
  already handled by the run's `source_empty` preflight, and refusing the whole file for
  it would stop every other mapping.
- A folder picker for the mapping's folder: a text field with a save-time existence
  check. A picker can come later without changing the stored format.
- Reordering mappings: not added; order only decides the order of cards.
- A per-mapping schedule: not added; one global schedule, as before.
- The schedule on a DST transition (a skipped or repeated hour): croniter's behavior in
  the zone is accepted.
- Normalizing the remote path: not done; some backends treat `x:/a` and `x:a` as
  different places.
- WebSocket events broadcast without a drive scope, the `403`/`500` responses shown as
  "No drives configured", the `-15` display on cancel, and `last_synced_at` set on a
  failed run: pre-existing, out of scope.
- A restart banner: not needed; nothing here requires a restart.
- An invariant on the exact preset recognition and card wording: presentation, fixed in
  item 9 and checked by the component tests.
- Hand edits and deletion of `data/addons/cloud-sync/sync-config.json` on the host: not
  supported; `/status` follows the file, the scheduler follows the next save or restart.
- Reading `drives.json` from disk for the drive list: not done. The sync resolves drives
  from the running backend's cached list, so a drive that is not yet live could not be
  synced anyway; the section says a restart brings it in.
- Refusing a mapping for a drive whose cloud-sync policy is off: not done; the admin may
  set up the mapping before turning the policy on. The drive is marked in the select and
  the card shows **Off**.
- `GET /config` answering 200 when `rclone listremotes` fails: a failure-table row
  checked by the acceptance tests, not an invariant; failing it shows an error, it does
  not silently mislead.
