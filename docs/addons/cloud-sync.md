# cloud-sync addon

The `cloud-sync` addon copies your drives, or folders inside them, to any storage that [rclone](https://rclone.org/) supports, on a schedule or on demand. It runs inside the backend and is not tied to one drive. It is set up in **Settings** (`/admin/settings`), and its controls are a card on the admin dashboard (`/admin`); both are visible only to admins.

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
2. Mount the rclone config into the backend in `docker-compose.override.yml`:

   ```yaml
   services:
     backend:
       volumes:
         - ~/.config/rclone:/root/.config/rclone:ro
   ```

3. Rebuild: `docker compose up -d --build`.
4. Open **Settings** (`/admin/settings`), System tab, and set up **Cloud Sync** (see below).

An older setup that mounts `./addons/cloud-sync/sync-config.json` into the backend can drop that line, and the file with it, before the next `docker compose up`. The file is no longer read. If the line stays and the file is gone, Docker creates a directory at that path.

To stop the addon loading, leave the submodule uninitialised; see [Enabling and disabling addons](overview.md#enabling-and-disabling-addons).

## Settings

The **Cloud Sync** section of **Settings** (`/admin/settings`, System tab) holds everything the addon needs:

| Setting | Meaning |
|---|---|
| **Schedule** | When to sync every mapping: Off (manual only), Daily at a time, Every 1, 2, 3, 4, 6, 8 or 12 hours, Weekly on a day at a time, or Custom (a 5-field cron expression). |
| **Time zone** | The zone the schedule runs in. A new setup starts at your browser's zone. |
| **Max deletions per sync** | The most files one sync may delete from the remote. Default `200`. |
| **Mappings** | One row per drive or folder to sync: the drive, a folder inside it (empty for the whole drive), the rclone remote, and the folder on that remote. |

**Save** applies the settings at once, schedule included; no restart is needed. A sync that is running when you save keeps going to the remote it started with, and you can still cancel it from its card. The section shows when the next sync is due.

The remote list shows the remotes rclone finds in the mounted config. If it is empty, the section says so: create a remote on the host with `rclone config` and check the rclone mount. The drive list shows the drives the running backend knows; a drive you have just added or renamed in **Drives** appears after the backend restarts. A drive turned off for cloud-sync in **Addon policy** is marked **(cloud sync off)**; you can map it, but it does not sync until you turn it on.

A drive may have several mappings, one per folder. **Save** is refused, and nothing changes, when:

- a drive does not exist, or a folder does not exist inside its drive (a link that leads outside the drive counts as missing);
- a remote is not in the remote list;
- a remote has no folder: mirroring into a remote's root would delete everything else stored there;
- two mappings name the same drive and folder;
- two remotes are the same place, or one is inside the other: the same remote name, and one folder equal to or under the other (`gd:a` and `gd:a/b`). `gd:a` and `gd:ab` do not overlap. Two mirrors into one place would delete each other's files;
- the cron expression does not have exactly 5 fields, or **Max deletions per sync** is below 1.

Each problem is shown next to its field or row.

Cron examples for **Custom**:

| Cron | Meaning |
|---|---|
| `*/30 * * * *` | Every 30 minutes |
| `0 3 1 * *` | 03:00 on the first of each month |
| `0 3 * * 1-5` | Weekdays at 03:00 |

The settings are stored in `data/addons/cloud-sync/sync-config.json`. Edit them in **Settings**, not in the file: a hand edit is read by the cards at once but reaches the schedule only after a backend restart, and a file the addon cannot read stops every mapping until you save the settings again.

## What a sync does

For each mapping the addon runs `rclone sync <drive folder>/<path> <remote>` (the drive folder itself for a whole-drive mapping).

- Sync is one way: Litloft is copied to the remote. A file you delete in Litloft is deleted from the remote on the next sync. Nothing is copied back.
- Mappings sync in parallel, one rclone process each, including two mappings of the same drive. A mapping that is already syncing is skipped by the schedule, and **Sync Now** on it is refused.
- **Cancel** stops that mapping's rclone only. The card then shows an error for that run. Cancel also works while the folder is still being checked, before rclone starts; nothing is sent.
- The last result is kept in memory, so the card forgets it when the backend restarts.

Before rclone starts, the addon checks two things, for a scheduled sync and for **Sync Now** alike:

- **The drive is on for cloud-sync.** The policy is per drive and covers every mapping of it. A drive turned off for cloud-sync in the addon policy (the setup wizard, or **Addon policy** in `/admin/settings`) is never synced: the schedule skips it, **Sync Now** is refused, and its card is grey and marked **Off**. Data already on the remote stays there. A sync that is already running when you turn the drive off runs to the end. If the policy cannot be read, the drive is treated as off.
- **The folder holds at least one file and is inside the drive.** A folder that is missing, is not a folder, contains no files (only empty subfolders), or is a link to somewhere outside the drive is not synced. A missing or empty folder usually means the drive is not mounted, and syncing it would empty the remote. The card says **Folder is missing or empty** and the remote is left untouched.

rclone runs with `--max-delete` set to **Max deletions per sync**. If a sync would delete more files than that from the remote, rclone stops and the card says **Too many deletions**. Deletions made before the stop are not undone.

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
| `GET` | `/config` | The stored settings (`source`: `none`, `saved` or `invalid`, with `error` for `invalid`), the drives with whether cloud-sync is on for each, the rclone remotes (`remotes_error` when they cannot be listed), and the next run. |
| `PUT` | `/config` | Replace the settings with `{ schedule, timezone, max_delete, mappings }` and apply them. `200` answers like `GET`. `422` answers `{ errors: [{ mapping, other, field, code, message }] }` with every problem found; nothing is changed. |
| `GET` | `/status` | Every mapping's state (with its `drive` and `path`), the schedule, its `timezone`, and the next run. A mapping removed from the settings while it syncs is listed until its run ends. |
| `POST` | `/{drive}/start?path=<folder>` | Start a mapping's sync. `404` "Mapping not found in sync config" if no mapping has that drive and folder, `404` "Drive not found" if the drive is not in `drives.json`, `403` if cloud-sync is off for the drive, `409` if the mapping is already syncing. |
| `POST` | `/{drive}/cancel?path=<folder>` | Cancel a mapping's sync, including one still checking its folder. `404` if that mapping has nothing running. |
| `GET` | `/{drive}/log?path=<folder>` | The mapping's log, as plain text. `404` if no mapping has that drive and folder and none with them is running. |

Leave out `path` for a whole-drive mapping. `path` is matched after normalization, so `2026/Trips/` reaches `2026/Trips`. `start` and `cancel` answer `{ status, drive, path }`.

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
| `"delete_limit"` | rclone stopped because the sync would have deleted more than **Max deletions per sync** files. |
| `null` | Any other failure, including a cancel. |

`GET /status` gives the same value as `error_kind` for each mapping. A mapping whose drive is turned off for cloud-sync has `status: "disabled"` and no `error_kind`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| **Re-authentication Required** | The remote's token expired. Run `rclone config reconnect <remote>:` on the host, then restart the backend container. |
| A sync fails at once | rclone cannot reach the remote. Check `rclone ls <remote>:` on the host, and open **Log**. |
| **Cloud Sync is not set up yet.** | No mapping is saved. Add one in **Settings**. If the section says the saved settings could not be read, saving replaces them. |
| `404` "Drive not found" when starting a sync | The mapping's drive is no longer in `drives.json`. Pick another drive for it in **Settings**. |
| The remote list is empty | The rclone config is not mounted into the backend, or has no remotes. |
| **Folder is missing or empty** | The drive is not mounted, the folder does not exist or has no files, or it links outside the drive. Check the mount and the `path`, then **Retry**. |
| **Too many deletions** | More than **Max deletions per sync** files were due to be deleted from the remote. First check that the drive is mounted and complete. If the deletions are expected (you removed many files on purpose), raise **Max deletions per sync** in **Settings** and sync again. |
| A card is grey and marked **Off** | cloud-sync is turned off for that mapping's drive in the addon policy. Turn it on in **Addon policy** in `/admin/settings`. |
| A deleted file comes back | Something other than cloud-sync writes to the remote or copies back from it. cloud-sync only pushes. |

## See also

- [rclone documentation](https://rclone.org/) for setting up remotes.
- [Backup and restore](../admin-guide/backup-restore.md).
