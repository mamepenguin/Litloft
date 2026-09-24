# cloud-sync addon

The `cloud-sync` addon copies your drives to any storage that [rclone](https://rclone.org/) supports, on a schedule or on demand. It runs inside the backend and is not tied to one drive. Its controls are a card on the admin dashboard (`/admin`), visible only to admins.

## What it provides

- A sync of every configured drive on a cron schedule.
- **Sync Now**, **Cancel** and **Retry** for each drive.
- Live progress while a sync runs: percentage, files, bytes, speed and ETA.
- When rclone reports an expired or rejected credential, the card says **Re-authentication Required** and shows the command to run.
- **Log**, which shows the output of the drive's last sync.

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
  "mappings": [
    { "drive": "Movies",    "remote": "gdrive:litloft/movies" },
    { "drive": "Photos",    "remote": "b2-crypt:photos" },
    { "drive": "Documents", "remote": "s3-backup:documents" }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `schedule` | 5-field cron string, optional | When to sync every mapping. Leave it out or set it to `null` for manual sync only. |
| `mappings` | array | One entry per drive to sync. |
| `mappings[].drive` | string | The drive name, exactly as in `drives.json`. |
| `mappings[].remote` | string | The rclone target, `<remote>:<path>`. |

Cron examples:

| Cron | Meaning |
|---|---|
| `0 */6 * * *` | Every 6 hours, on the hour |
| `0 3 * * *` | Daily at 03:00 |
| `0 3 * * 0` | Sundays at 03:00 |
| `*/30 * * * *` | Every 30 minutes |

The schedule is read when the backend starts, so restart the backend after changing it. Changes to `mappings` are picked up without a restart. If the file is missing or is not valid JSON, the card says **No drives configured**.

## What a sync does

For each mapping the addon runs `rclone sync <drive folder> <remote>`.

- Sync is one way: Litloft is copied to the remote. A file you delete in Litloft is deleted from the remote on the next sync. Nothing is copied back.
- Drives sync in parallel, one rclone process each. A drive that is already syncing is skipped by the schedule, and **Sync Now** on it is refused.
- **Cancel** stops rclone. The card then shows an error for that run.
- The last result is kept in memory, so the card forgets it when the backend restarts.

## Logs

Each drive's log is `data/cloud-sync-logs/<drive>.log`. It is replaced by every sync and holds the first 1 MB of that sync's output.

## Security

- The rclone config holds OAuth tokens and API keys. Protect it on the host (`chmod 600`).
- cloud-sync does not encrypt anything itself. For encryption the cloud provider cannot read, use an rclone `crypt` remote.
- The addon's API (`/api/addons/cloud-sync/...`) accepts admins only.

## API and WebSocket events

| Method | Path under `/api/addons/cloud-sync` | Purpose |
|---|---|---|
| `GET` | `/status` | Every mapped drive's state, the schedule, and the next run. |
| `POST` | `/{drive}/start` | Start a sync. `404` if the drive is not mapped, `409` if it is already syncing. |
| `POST` | `/{drive}/cancel` | Cancel a running sync. `404` if none is running. |
| `GET` | `/{drive}/log` | The drive's log, as plain text. |

Events on `/api/ws`:

- `sync:progress`: `{ drive, bytes_transferred, total_bytes, speed, eta, percent, transfers, total_transfers }`
- `sync:complete`: `{ drive, transferred_files, transferred_bytes, errors, elapsed_seconds }`
- `sync:error`: `{ drive, message, kind }`

`kind` is `"auth_expired"` when rclone reported an expired or rejected credential, and `null` otherwise. `GET /status` gives the same value as `error_kind` for each drive.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| **Re-authentication Required** | The remote's token expired. Run `rclone config reconnect <remote>:` on the host, then restart the backend container. |
| A sync fails at once | rclone cannot reach the remote. Check `rclone ls <remote>:` on the host, and open **Log**. |
| **No drives configured** | `sync-config.json` is missing, is not mounted, or is not valid JSON. |
| `404` when starting a sync | The `drive` in `sync-config.json` does not match a drive name in `drives.json`. |
| A deleted file comes back | Something other than cloud-sync writes to the remote or copies back from it. cloud-sync only pushes. |

## See also

- [rclone documentation](https://rclone.org/) for setting up remotes.
- [Backup and restore](../admin-guide/backup-restore.md).
