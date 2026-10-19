# cloud-sync mirrors a folder inside a drive, not only a whole drive

SPEC-ID: SPEC-ADDON-003
SPEC-ID: SPEC-ADDON-004

Approval: sha256:3e90603f758d2fb357a6e81d15f5e3f9e49b1d46c8f0a9e56a0cf04f824a33bc Yuichi Senga 2026-10-07

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <commit sha> <name> <date>` here (the name may contain spaces) and
moves the ledger row in docs/specs/INDEX.md to approved. A spec that defines several behaviors gives each its own
SPEC-ID and its own ledger row.
-->

## Summary

Today a cloud-sync mapping in `addons/cloud-sync/sync-config.json` names a drive and an
rclone remote, and every sync runs `rclone sync <drive root> <remote>`. Everything in the
addon is keyed by the drive name: the in-memory status, the running-process and
reservation sets, the routes `/{drive}/start|cancel|log`, the `sync:*` WebSocket payloads,
the log file and the dashboard card. The owner wants one folder of a drive mirrored to the
cloud automatically, without mirroring the rest of the drive.

This change adds an optional `path` to a mapping, a folder relative to the drive root.
The sync stays a one-way mirror: `rclone sync <drive root>/<path> <remote>`. A drive may
have several mappings, each for a different folder. A mapping is identified by its drive
and its path, and every per-drive key in the addon becomes that pair. All the safeguards
from the previous change (per-drive policy, the missing/empty source check, `max_delete`,
one rclone per mapping, cancel before launch) apply per mapping. Because several mappings
now make it easy to point two mirrors at the same place, a configuration whose remotes are
equal or nested is rejected as a whole.

- SPEC-ADDON-003: folder mappings, identified by drive and path, with per-mapping status,
  controls, events and log.
- SPEC-ADDON-004: a configuration with a duplicate mapping, an invalid path, or overlapping
  remotes is rejected as a whole and syncs nothing.

The owner accepted the mirror semantics: a file deleted in Litloft is deleted from the
remote on the next sync. On Google Drive rclone moves deleted files to the Drive trash
(`--drive-use-trash`, rclone's default), and Drive keeps replaced versions, both for 30
days; that is the accepted recovery window.

## Required items

### 1. Normal flow

1. The owner adds a mapping to `sync-config.json`:
   `{ "drive": "動画", "path": "仕事/録画", "remote": "gdrive:litloft/録画" }`.
   `path` is optional; absent or `""` means the whole drive, exactly as today.
2. On `GET /status` (and on every use) the addon loads the file. A valid file yields one
   status entry per mapping, in file order, each carrying `drive` and `path`.
3. The schedule fires, or the owner presses **Sync Now** on a mapping's card
   (`POST /api/addons/cloud-sync/{drive}/start?path=<path>`; no `path` = `""`).
4. `start_sync(drive, path)` finds the mapping, resolves the drive root, checks the drive's
   policy, reserves the mapping, marks it `syncing`, and starts the run.
5. The run checks the source folder `<drive root>/<path>`, for every mapping including
   whole-drive ones: `realpath(source)` must equal `realpath(drive root)` or lie under it,
   and the folder must contain at least one file. rclone receives the joined path
   `<drive root>/<path>` as written, not the resolved one. Then it starts
   `rclone sync <source folder> <remote> --max-delete <max_delete> ...`.
6. Progress, completion and errors are broadcast as `sync:progress`, `sync:complete`,
   `sync:error` with `drive` and `path`, and stored under the mapping.
7. The run ends; the reservation and any cancel mark of that mapping are released.

### Path and remote rules

**Mapping path.** `path` is split on `/`. Empty segments and `.` segments are dropped, so
`"仕事/録画/"`, `"./仕事//録画"` and `"仕事/録画"` are the same folder, and `""`, `"."` and
`"./"` are the whole drive. The normalized form is the remaining segments joined by `/`
(`""` for the whole drive). `"path": null` is the same as an absent `path`. It is
rejected if it is not a string (a number, array or object), if the raw string starts with
`/`, if any segment is `..`, or if it contains a NUL. Nothing else is changed: whitespace is kept, a
backslash is an ordinary character, and case and Unicode normalization are kept as
written. `GET /status` entries and event payloads carry the normalized form. The `?path=`
query of `start`, `cancel` and `log` is normalized the same way before the lookup; an
absent query is `""`; a query that is rejected by these rules, or names no mapping, is a
`404`.

**Remote overlap.** A remote string is split at its first `:` into a name and a path. The
path is split on `/` with empty segments dropped, so `gd:a`, `gd:/a` and `gd:a/` are the
same place and `gd:` and `gd:/` are the remote's root. Two remotes overlap when their names
are equal and one segment list is a prefix of the other (equal included). The root is a
prefix of every path on that remote. Names and segments are compared exactly, case
included. So `gd:a` and `gd:a/b` overlap, `gd:a` and `gd:ab` do not, `gd:` and `gd:x`
overlap, and `gd:a` and `GD:a` do not.

**Log file name.** A whole-drive mapping keeps today's name, `<safe drive>.log`. A folder
mapping's file is `<safe drive>.<h>.log`, where `<safe drive>` is today's sanitized drive
name and `<h>` is the first 16 hex digits of SHA-256 over the drive name, a NUL byte, and
the normalized path (UTF-8). The sanitizer turns `.` into `_`, so no folder mapping's name
can equal any whole-drive mapping's name.

### 2. Failure cases

| Step | Failure | What happens |
|---|---|---|
| 2 | `path` rejected by the path rules above | The whole file is rejected (SPEC-ADDON-004): logged, treated as having no mappings (and so no schedule and the default `max_delete`, as any invalid file is today), card shows **No drives configured**. |
| 2 | Two mappings with the same drive and the same normalized path | Whole file rejected, as above. |
| 2 | Two mappings whose remotes overlap by the rule above, whatever their drives | Whole file rejected, as above. |
| 3 | `start` or `log` for a drive/path pair not in the file | `404` with detail "Mapping not found in sync config", nothing started. |
| 3 | `cancel` for a pair that has no reserved run (idle, error, disabled, or not in the file) | `404` with detail "No sync in progress for this mapping"; nothing changes. Cancel finds its target among the reserved runs, not in the file, so a running mapping can be cancelled even after the file was edited or broken. |
| 4 | The mapping's drive is not in `drives.json` | Manual start: `404` with detail "Drive not found". The schedule logs a warning and skips that mapping; other mappings still start. |
| 4 | Policy of the mapping's drive Off, or lookup raises | `403` for a manual start; the schedule skips the mapping; nothing started. |
| 4 | The same mapping already reserved | `409`; the schedule skips it. |
| 5 | Source folder missing, not a folder, has no files, or resolves outside the drive root (a symlink pointing out) | rclone not started; `error`, `error_kind="source_empty"`; previous `last_synced_at`/`last_result` kept. |
| 5 | Cancel before rclone starts | rclone not started (or terminated right after spawn); `error` with the cancel message; previous result kept. |
| 5 | rclone exceeds `max_delete` | rclone stops; `error_kind="delete_limit"`. |
| 5 | rclone fails otherwise | As today (`auth_expired` or `null`). |

### 3. States

Per mapping, unchanged from today: `idle` → `syncing` → `idle` | `error`; `error` →
`syncing`. `disabled` is computed in `GET /status` for a mapping whose drive's policy is
Off and is never stored; a mapping that is `syncing` is reported as `syncing` even if its
drive was turned Off during the run. The state of one mapping never changes the state of
another mapping, including another mapping of the same drive.

Refused, per mapping:

| From | Request | Result |
|---|---|---|
| `syncing` | start (manual or schedule) | `409` / skipped; the running run is untouched |
| `disabled` | start | `403` / skipped; nothing stored |
| `idle`, `error`, `disabled` | cancel | `404`; nothing changes, no cancel mark is left for the next run |
| any | a run ending in `disabled` | never: a run ends in `idle` or `error`; `disabled` is only computed |

### 4. Data read and written

- `addons/cloud-sync/sync-config.json`: read (new optional key `mappings[].path`).
- `drives.json` through `config.get_drive_path` and `config.is_addon_feature_enabled`: read.
- The source folder: read (walked for the file check, then read by rclone).
- In-memory status, process, reservation and cancel maps: keyed by `(drive, path)`.
- `data/cloud-sync-logs/`: written, one file per mapping. A whole-drive mapping keeps
  today's name, `<drive>.log`, so an upgrade does not orphan the existing log. A folder
  mapping's file name is derived from both drive and path so two mappings never share a
  file.
- The rclone remote: written by rclone, as today.

### 5. External services

rclone and the cloud provider, unchanged. Slow or down: the run fails as today and the
mapping shows `error`. Google Drive's trash and revision history are the recovery window
for deletions and overwrites; other providers may have none, and the docs say so.

### 6. Authorization

Unchanged: every route keeps `Depends(require_admin)`. The per-drive addon policy
(`drives.json` `addons.cloud-sync`, umbrella feature `index`) applies to every mapping of
that drive. There is no per-folder policy.

### 7. Effect on existing features

- A file without `path` behaves exactly as today: same source, same log file name, same
  routes without `?path=`. Its status entries and event payloads gain `path: ""`.
- A file that today has two mappings with equal or nested remotes (for example two drives
  into one remote folder) stops syncing anything after the upgrade and logs why. This is
  intended: those mirrors delete each other's files.
- The schedule is read only when the backend starts, as today. A file that is invalid at
  startup leaves the scheduler off until the next restart, even after the file is fixed;
  the cards come back at once. The `ERROR` line and the docs say that a restart is needed
  for the schedule.
- The core is not changed. The core docs that describe cloud-sync are updated in the
  pointer-bump PR.
- The dashboard widget's cards, its progress map and its WebSocket handling are keyed by
  the pair instead of the drive.

### 8. Error behavior

- Rejected configuration: one `ERROR` log line per load of the file, as for invalid JSON
  today (the file is loaded on every `GET /status`), naming the reason (duplicate mapping,
  invalid path, overlapping remotes) and the offending values. The card shows
  **No drives configured**, and the schedule line is not shown, as for any invalid file
  today.
- `source_empty`: the stored `error_message` is "The folder is missing or empty, so nothing
  was synced. Check that the drive is mounted and the folder exists." The card shows
  title and body from the catalogue, with no path in them (the card title already names
  the folder):
  - en: "Folder is missing or empty" / "Nothing was synced. Check that the drive is mounted
    and that the folder exists, then try again."
  - ja: "フォルダがないか、空です" / "何も同期していません。ドライブがマウントされていて、フォルダがあるか確認してから、もう一度試してください。"

  The same text is used for whole-drive and folder mappings.
- `403` "Cloud sync is turned off for this drive" and `409` "Sync already in progress"
  keep today's details. The `404` details are those in the failure table.

### 9. User-visible behavior

- One card per mapping, in file order. A card's title is the drive name; a folder
  mapping adds its path after it (`動画 / 仕事/録画`). The remote is shown as today.
- **Sync Now**, **Cancel**, **Retry** and **Log** act on that card's mapping only.
- A card for a mapping whose drive is Off is grey and marked **Off**, as today.
- The `source_empty` card text changes as given in item 8.
- The dashboard matches an event or a status entry to a card on both `drive` and `path`.
  Where a string key is needed (the progress map, React `key`), it is a collision-free
  encoding of the pair such as `JSON.stringify([drive, path])`, never the two joined with a
  separator that a drive name or path can contain.
- `sync:progress`, `sync:complete`, `sync:error` payloads gain `path`.
- `GET /status` entries gain `path`.
- `POST /{drive}/start`, `/{drive}/cancel` and `GET /{drive}/log` accept `?path=`. The
  `start` and `cancel` response bodies gain `path` (normalized):
  `{"status": "started", "drive": ..., "path": ...}`.
- The frontend percent-encodes `path` in the query (folder names may contain `&`, `#`, `+`,
  `?`).

### 10. Non-functional

- Mappings run in parallel, one rclone per mapping, as drives do today. Two mappings of
  the same drive may run at the same time; they only read the source.
- The source check stops at the first file it finds, as today.
- No new dependency. No change to `max_delete` (it stays a per-run cap).
- Privacy: none new; a folder mapping sends less than a drive mapping.

## Touch points

Addon repository (`addons/cloud-sync`, submodule):

- `backend/schemas.py`: `SyncMapping.path` with its normalization and validation;
  `SyncConfig` validation of duplicate pairs and overlapping remotes; `SyncDriveStatus.path`.
- `backend/service.py`: `_load_config`, `_get_mapping`, `start_sync`, `cancel_sync`,
  `_run_rclone` (source folder, containment check, argv), `_source_usable`,
  `_handle_completion`, `_handle_error`, `_parse_rclone_output` (progress broadcast),
  `get_status`, `get_log`, `_safe_log_name` / log path, `_run_scheduled_sync`, and the
  `_status`, `_processes`, `_running`, `_cancelled` maps.
- `backend/router.py`: `start`, `cancel`, `log` gain the `path` query parameter.
- `frontend/api.ts`, `frontend/CloudSyncWidget.tsx`, `frontend/SyncDriveCard.tsx`,
  `frontend/messages/en.json`, `frontend/messages/ja.json`. The card keeps its two raw
  `<button>` elements, which core's `frontend/src/__tests__/button-adoption.test.ts`
  pins; if that count changes, the core test changes in the pointer-bump PR.
- `tests/` (backend) and `frontend/*.test.tsx`.
- `sync-config.json.example`, `README.md`.

Core repository:

- `addons/cloud-sync` gitlink (pointer bump after the addon merges).
- `docs/addons/cloud-sync.md`: every section that describes per-drive behavior, which
  includes the config example and field table ("one entry per drive"), "What a sync does",
  the log file names, the API table (`?path=`, the 404 details, cancel), the events list
  (`path`), the `kind` table, the Troubleshooting rows (the new card title, the `404`
  causes, **No drives configured** causes, the schedule needing a restart), and deletion
  recovery on Google Drive and elsewhere;
  `docs/reference/configuration.md`, `docs/reference/websocket-events.md`,
  `docs/reference/api.md` if it lists the routes, `docs/admin-guide/backup-restore.md`
  ("copies drive directories").
- Rules passed through: `.claude/rules/design-decisions.md` (drive is a security
  boundary; addon policy), `.claude/rules/backend-conventions.md` (path traversal:
  realpath under the base dir), `.claude/rules/frontend-conventions.md`.
- No protected path is edited.

## Invariants

I1. A mapping without `path` syncs the drive root with the same rclone source, the same log file name and the same routes as before this change.
I2. A mapping with `path` passes `<drive root>/<path>` as rclone's source and never the drive root or any other folder, and writes its log only to `<safe drive>.<h>.log` as defined in the log file rule.
I3. A source folder that resolves outside its drive root, is missing, is not a folder, or contains no files never has an rclone process started.
I4. A configuration with two mappings of the same drive and normalized path, a path that starts with `/`, has a `..` segment or contains a NUL, or two remotes that overlap by the remote rule yields no mappings, so nothing is synced; two remotes that do not overlap by that rule (`gd:a` and `gd:ab`) are accepted.
I5. Starting, cancelling, reading the log of, or finishing one mapping never changes the status, reservation, cancel mark or log file of another mapping, including another mapping of the same drive.
I6. Every mapping of a drive whose policy is Off, or whose policy lookup raises, is never started, from the schedule or from `POST /{drive}/start`.
I7. Every rclone argv carries `--max-delete` equal to the configured `max_delete`, for every mapping.
I8. Every `sync:progress`, `sync:complete` and `sync:error` payload and every `GET /status` entry carries the `drive` and `path` of the mapping it is about, and the dashboard applies it to that mapping's card only.
I9. After a mapping's run ends by any path (success, rclone failure, `source_empty`, cancel before or after launch, or an exception), the same mapping can be started again, and that next run is not treated as cancelled.
I10. `start`, `cancel` and `log` normalize `?path=` by the path rule before the lookup, so `仕事/録画/` and `./仕事/録画` reach the mapping `仕事/録画`, and a query the rule rejects or that names no mapping answers `404` without starting or cancelling anything.

## Checked, no action

- Per-folder addon policy: not added. The policy is a drive-level setting in
  `/admin/settings`; a folder mapping is already a choice of what to send.
- The same folder mirrored to two remotes: not supported (the pair `(drive, path)` is the
  identity). Mirroring to a second cloud is a separate request.
- Overlap through rclone wrappers (a `crypt` or `alias` remote over the same underlying
  remote as another mapping): not detectable from the remote string; not checked.
- Overlapping sources (a whole-drive mapping and a folder mapping of the same drive, to
  different remotes): allowed. rclone only reads the source, so the two runs do not
  interfere.
- Rejecting only the bad mapping instead of the whole file: rejected. A partial
  configuration would sync some mappings while the owner believes the file is in effect;
  failing the whole file is what an invalid file does today.
- Unicode normalization of `path`: not normalized. Opening a path on the host filesystem
  ignores normalization (measured for SPEC-ADDON-001), and the path is only opened, never
  matched against a listing.
- The card title (`drive / path`) and the `source_empty` wording have no invariant: they
  are presentation, fixed in items 8 and 9 and checked by the card tests, not properties a
  silent mutation would make dangerous.
- Per-mapping schedule: not added; one global schedule, as decided on 2026-04-06.
- A GUI for `sync-config.json`: out of scope, still hand-edited.
- WebSocket events are still broadcast without a drive scope: out of scope, as in the
  previous change.
- `last_synced_at` being set on a failed run: pre-existing, out of scope.
- `max_delete` is read when rclone is launched; if the file becomes invalid mid-way, a
  launch uses the default 200. Pre-existing, out of scope.
- A sanitized drive name that collides with another drive's (`_safe_log_name` maps every
  non-allowed character to `_`): pre-existing, out of scope.
- Deletion recovery on remotes other than Google Drive (S3, B2 and others have no trash by
  default): documented, not handled.
