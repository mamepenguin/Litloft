# cloud-sync addon

The `cloud-sync` addon copies your drives, or folders inside them, to any storage that [rclone](https://rclone.org/) supports, on a schedule or on demand. It runs inside the backend and is not tied to one drive. Its controls are a card on the admin dashboard (`/admin`), visible only to admins.

## What it provides

- A sync of every mapping on a cron schedule. A mapping is a whole drive, or one folder inside a drive.
- **Sync Now**, **Cancel** and **Retry** for each mapping.
- Live progress while a sync runs: percentage, files, bytes, speed and ETA.
- When rclone reports an expired or rejected credential, the card says **Re-authentication Required** and shows the command to run.
- **Log**, which shows the output of the mapping's last sync.
- Safeguards that keep a missing drive or a mass deletion from emptying the remote (see [What a sync does](#what-a-sync-does)).

cloud-sync copies the files on your drives. It does not back up Litloft's database or addon data; see [Backup and restore](../admin-guide/backup-restore.md) for those.

## Installation

cloud-sync is built into the backend image whenever `addons/cloud-sync/` is checked out. The image build installs rclone with the addon's `install.sh`.

1. On the host, set up your remotes with `rclone config` (Google Drive, S3, B2, OneDrive, SFTP, Dropbox, and so on). For client-side encryption, add an rclone `crypt` remote on top of another remote and use the `crypt` remote's name.
2. Create `addons/cloud-sync/sync-config.json` (see below). `addons/cloud-sync/sync-config.json.example` is a starting point.
3. Mount both into the backend in `docker-compose.override.yml`:

   ```yaml
   services:
     backend:
       volumes:
         - ~/.config/rclone:/root/.config/rclone:ro
         - ./addons/cloud-sync/sync-config.json:/app/addons/cloud-sync/sync-config.json:ro
   ```

   `configure.py` adds the `sync-config.json` line for you when the file exists. The rclone config line you add yourself.
4. Rebuild: `docker compose up -d --build`.

To stop the addon loading, leave the submodule uninitialised; see [Enabling and disabling addons](overview.md#enabling-and-disabling-addons).

## sync-config.json

```json
{
  "schedule": "0 */6 * * *",
  "max_delete": 200,
  "mappings": [
    { "drive": "Movies",    "remote": "gdrive:litloft/movies" },
    { "drive": "Photos",    "path": "2026/Trips", "remote": "b2-crypt:trips" },
    { "drive": "Photos",    "path": "Family",     "remote": "b2-crypt:family" },
    { "drive": "Documents", "remote": "s3-backup:documents" }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `schedule` | 5-field cron string, optional | When to sync every mapping. Leave it out or set it to `null` for manual sync only. |
| `max_delete` | integer, 1 or more, optional | The most files one sync may delete from the remote. Default `200`. A value below 1 makes the whole file invalid. |
| `mappings` | array | One entry per drive or folder to sync. |
| `mappings[].drive` | string | The drive name, exactly as in `drives.json`. |
| `mappings[].path` | string, optional | A folder inside the drive, relative to its root (`"2026/Trips"`). Leave it out, or set it to `""` or `null`, for the whole drive. A trailing `/`, `//` and `./` are ignored. |
| `mappings[].remote` | string | The rclone target, `<remote>:<path>`. |

A drive may have several mappings, one per folder. The whole file is rejected, and nothing syncs, when:

- two mappings name the same drive and folder;
- a `path` starts with `/`, contains `..`, or is not a string;
- two remotes are the same place, or one is inside the other: the same remote name, and one path equal to or under the other (`gd:a` and `gd:a/b`, or `gd:` and anything on `gd:`). `gd:a` and `gd:ab` do not overlap. Two mirrors into one place would delete each other's files.

The backend log then has an `ERROR` line naming the problem.

Cron examples:

| Cron | Meaning |
|---|---|
| `0 */6 * * *` | Every 6 hours, on the hour |
| `0 3 * * *` | Daily at 03:00 |
| `0 3 * * 0` | Sundays at 03:00 |
| `*/30 * * * *` | Every 30 minutes |

The schedule is read when the backend starts, so restart the backend after changing it. Changes to `mappings` and `max_delete` are picked up without a restart. If the file is missing, is not valid JSON, or is rejected for the reasons above, the card says **No drives configured**. A file that is invalid when the backend starts leaves the schedule off until the next restart, even after you fix the file.

## What a sync does

For each mapping the addon runs `rclone sync <drive folder>/<path> <remote>` (the drive folder itself for a whole-drive mapping).

- Sync is one way: Litloft is copied to the remote. A file you delete in Litloft is deleted from the remote on the next sync. Nothing is copied back.
- Mappings sync in parallel, one rclone process each, including two mappings of the same drive. A mapping that is already syncing is skipped by the schedule, and **Sync Now** on it is refused.
- **Cancel** stops that mapping's rclone only. The card then shows an error for that run. Cancel also works while the folder is still being checked, before rclone starts; nothing is sent.
- The last result is kept in memory, so the card forgets it when the backend restarts.

Before rclone starts, the addon checks two things, for a scheduled sync and for **Sync Now** alike:

- **The drive is on for cloud-sync.** The policy is per drive and covers every mapping of it. A drive turned off for cloud-sync in the addon policy (the setup wizard, or **Addon policy** in `/admin/settings`) is never synced: the schedule skips it, **Sync Now** is refused, and its card is grey and marked **Off**. Data already on the remote stays there. A sync that is already running when you turn the drive off runs to the end. If the policy cannot be read, the drive is treated as off.
- **The folder holds at least one file and is inside the drive.** A folder that is missing, is not a folder, contains no files (only empty subfolders), or is a link to somewhere outside the drive is not synced. A missing or empty folder usually means the drive is not mounted, and syncing it would empty the remote. The card says **Folder is missing or empty** and the remote is left untouched.

rclone runs with `--max-delete <max_delete>`. If a sync would delete more files than that from the remote, rclone stops and the card says **Too many deletions**. Deletions made before the stop are not undone.

Getting a deleted file back depends on the remote. On Google Drive, rclone moves deleted files to the Drive trash, and Drive keeps the earlier versions of a replaced file; both last 30 days. Most other remotes (S3, B2, SFTP and others) have no trash by default, and a deleted file is gone.

## Logs

Each mapping's log is in `data/cloud-sync-logs/`: `<drive>.log` for a whole-drive mapping, and `<drive>.<16 hex digits>.log` for a folder mapping (the digits are derived from the drive and the folder). Characters other than letters, digits, `_`, `-` and CJK in the drive name become `_`. Each file is replaced by every sync of its mapping and holds the first 1 MB of that sync's output.

## Security

- The rclone config holds OAuth tokens and API keys. Protect it on the host (`chmod 600`).
- cloud-sync does not encrypt anything itself. For encryption the cloud provider cannot read, use an rclone `crypt` remote.
- The addon's API (`/api/addons/cloud-sync/...`) accepts admins only.

## API and WebSocket events

| Method | Path under `/api/addons/cloud-sync` | Purpose |
|---|---|---|
| `GET` | `/status` | Every mapping's state (with its `drive` and `path`), the schedule, and the next run. |
| `POST` | `/{drive}/start?path=<folder>` | Start a mapping's sync. `404` "Mapping not found in sync config" if no mapping has that drive and folder, `404` "Drive not found" if the drive is not in `drives.json`, `403` if cloud-sync is off for the drive, `409` if the mapping is already syncing. |
| `POST` | `/{drive}/cancel?path=<folder>` | Cancel a mapping's sync, including one still checking its folder. `404` if that mapping has nothing running. |
| `GET` | `/{drive}/log?path=<folder>` | The mapping's log, as plain text. `404` if no mapping has that drive and folder. |

Leave out `path` for a whole-drive mapping. `path` is matched after the same normalization as in the file, so `2026/Trips/` reaches `2026/Trips`. `start` and `cancel` answer `{ status, drive, path }`.

Events on `/api/ws`:

- `sync:progress`: `{ drive, path, bytes_transferred, total_bytes, speed, eta, percent, transfers, total_transfers }`
- `sync:complete`: `{ drive, path, transferred_files, transferred_bytes, errors, elapsed_seconds }`
- `sync:error`: `{ drive, path, message, kind }`

`path` is `""` for a whole-drive mapping.

`kind` is one of:

| `kind` | Meaning |
|---|---|
| `"auth_expired"` | rclone reported an expired or rejected credential. |
| `"source_empty"` | The folder was missing, held no files, or pointed outside the drive, so rclone was not started. |
| `"delete_limit"` | rclone stopped because the sync would have deleted more than `max_delete` files. |
| `null` | Any other failure, including a cancel. |

`GET /status` gives the same value as `error_kind` for each mapping. A mapping whose drive is turned off for cloud-sync has `status: "disabled"` and no `error_kind`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| **Re-authentication Required** | The remote's token expired. Run `rclone config reconnect <remote>:` on the host, then restart the backend container. |
| A sync fails at once | rclone cannot reach the remote. Check `rclone ls <remote>:` on the host, and open **Log**. |
| **No drives configured** | `sync-config.json` is missing, is not mounted, is not valid JSON, or was rejected (a duplicate mapping, a bad `path`, overlapping remotes). The backend log has an `ERROR` line saying which. After fixing it, restart the backend if you use a schedule. |
| `404` "Drive not found" when starting a sync | The `drive` in `sync-config.json` does not match a drive name in `drives.json`. |
| **Folder is missing or empty** | The drive is not mounted, the folder does not exist or has no files, or it links outside the drive. Check the mount and the `path`, then **Retry**. |
| **Too many deletions** | More than `max_delete` files were due to be deleted from the remote. First check that the drive is mounted and complete. If the deletions are expected (you removed many files on purpose), raise `max_delete` and sync again. |
| A card is grey and marked **Off** | cloud-sync is turned off for that mapping's drive in the addon policy. Turn it on in **Addon policy** in `/admin/settings`. |
| A deleted file comes back | Something other than cloud-sync writes to the remote or copies back from it. cloud-sync only pushes. |

## See also

- [rclone documentation](https://rclone.org/) for setting up remotes.
- [Backup and restore](../admin-guide/backup-restore.md).
