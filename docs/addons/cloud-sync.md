# cloud-sync addon

The `cloud-sync` addon backs your drives up to any rclone-compatible remote on a schedule. It is the simplest addon: in-process, global scope, one config file.

## What it provides

- **Scheduled sync** — cron expression triggers `rclone sync` for each configured drive.
- **Manual sync** — start, cancel, or retry per drive from the dashboard.
- **Live progress** — per-drive WebSocket events with bytes transferred, speed, ETA.
- **OAuth re-auth detection** — flags when a remote's token has expired and prompts for re-auth.
- **Sync logs** — plain-text per-drive log files (capped at 1 MB), viewable from the UI.

The addon does **not** back up the metadata DB or addon state — it is a *content* sync. Combine it with a separate metadata snapshot for a full backup story; see [backup and restore](../admin-guide/backup-restore.md).

## Installation

cloud-sync is in-process. The repository ships it as a submodule under `addons/cloud-sync/`; the backend Dockerfile copies every addon's `backend/` directory into the image at build time, so a plain rebuild is enough to pick it up:

```bash
docker compose up -d --build
```

`rclone` is installed by the addon's own `install.sh`, which the backend Dockerfile runs during the image build (so once the addon is present in `addons/cloud-sync/`, the binary is available inside the backend container with no extra steps).

For local development (running the backend outside Docker) symlink the addon into the core tree with `./setup-addons.sh`.

Mount your rclone config so the container can use your saved remotes:

```yaml
services:
  backend:
    volumes:
      - ~/.config/rclone:/root/.config/rclone:ro
```

## Configuring remotes

cloud-sync delegates all remote-specific configuration to rclone. Set up your remote on the host as you would for any rclone use:

```bash
rclone config
```

…and pick the type (Google Drive, S3, B2, OneDrive, SFTP, Dropbox, etc.). The remote name you give here is referenced from the addon config below.

If you want client-side encryption, set up an rclone `crypt` remote layered on top of the underlying remote and reference the `crypt` name. cloud-sync sees only the remote name; the encryption is transparent.

## sync-config.json

The addon's behaviour is driven by `addons/cloud-sync/sync-config.json` (mounted into the addon's volume):

```json
{
  "schedule": "0 */6 * * *",
  "mappings": [
    { "drive": "Movies",   "remote": "gdrive:litloft/movies" },
    { "drive": "Photos",   "remote": "b2-crypt:photos" },
    { "drive": "Documents","remote": "s3-backup:documents" }
  ]
}
```

| Field | Type | What it does |
|---|---|---|
| `schedule` | cron string or `null` | Run automatic sync when the cron fires. `null` disables the schedule (manual only). |
| `mappings` | array | One entry per drive to sync. |
| `mappings[].drive` | string | Drive name from `drives.json`. |
| `mappings[].remote` | string | rclone remote target (`<remote_name>:<path>`). |

The cron is evaluated server-side via `croniter`. Standard 5-field syntax: `minute hour day-of-month month day-of-week`. Examples:

| Cron | Meaning |
|---|---|
| `0 */6 * * *` | Every 6 hours on the hour |
| `0 3 * * *` | Daily at 03:00 |
| `0 3 * * 0` | Sundays at 03:00 |
| `*/30 * * * *` | Every 30 minutes |

Set `schedule: null` (or remove the field) to disable automatic sync entirely.

## What the sync does

For each mapping, the addon runs:

```bash
rclone sync /app/drives/<name> <remote_path> --transfers 4 --checkers 8 --progress --stats 5s
```

- **`sync`** is one-way: the addon only pushes Litloft → remote. Files deleted in Litloft are deleted on the remote on the next sync. *Pull* and *bisync* are not currently supported.
- Progress is parsed from rclone's `--stats` output and re-broadcast over WebSocket.
- Concurrency: each drive syncs in its own subprocess. Multiple drives sync in parallel.

## UI

The addon contributes a **dashboard widget** to `/admin`:

- One card per configured mapping.
- *Last run* timestamp and outcome (success / failed / cancelled).
- *Next scheduled run*.
- **Sync now** / **Cancel** buttons.
- **View log** opens the latest log for that drive (rotated at 1 MB).

When an OAuth token has expired, the card shows a *Re-authenticate* button which opens an in-page guide pointing you at `rclone config reconnect <remote>` on the host.

## WebSocket events

Subscribe to `/api/ws` and watch for:

- `sync:started` — `{ drive, started_at }`
- `sync:progress` — `{ drive, transferred, total, speed, eta }`
- `sync:complete` — `{ drive, transferred, duration_s, errors }`
- `sync:error` — `{ drive, message, retryable }`

## Logs

Per-drive logs live at `data/cloud-sync-logs/<drive>.log`. The log is truncated when it exceeds 1 MB. From the UI, the *View log* button streams the tail.

## Privacy and security

- Your rclone config (`~/.config/rclone/rclone.conf`) holds OAuth tokens and API keys. Mount it read-only and protect it on the host (`chmod 600`).
- For end-to-end encryption (so your cloud provider cannot read your files), use rclone's `crypt` remote.
- The addon does not encrypt anything itself; what rclone sees is what hits the remote.

## Bandwidth and rate limits

- Adjust transfer parallelism by editing `addons/cloud-sync/backend/service.py` and rebuilding (a knob in `sync-config.json` is a future improvement).
- Cloud providers commonly rate-limit; rclone retries automatically.
- If your upstream is slow, schedule the sync overnight and lower `--transfers`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| *rclone: command not found* in addon logs | Symlink was added after the build. Rebuild with `docker compose up -d --build`. |
| Sync hangs at 0% | Network unreachable or remote credentials expired. Check `rclone ls <remote>:` on the host. |
| OAuth re-auth banner shows up after a manual reconnect | Click *Refresh* on the dashboard; the addon caches token expiry for a minute. |
| Files reappear after deletion in Litloft | You configured a *bisync*-style remote externally, or another tool is writing back. cloud-sync alone is push-only. |

## See also

- [rclone documentation](https://rclone.org/) for remote setup.
- [Backup and restore](../admin-guide/backup-restore.md) for the rest of your backup story.
