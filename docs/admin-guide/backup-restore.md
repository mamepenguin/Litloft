# Backup and restore

Litloft does not provide a built-in backup command. Backups are file-system level and trivial because every piece of state lives outside the containers.

## What to back up

| Source | What it contains | Lose it and you lose… |
|---|---|---|
| `data/` | SQLite DB, thumbnails, uploads, addon DBs, sentinels, JWT secret | All metadata: tags, comments, watch history, AI artefacts |
| `drives.json` | Drive layout, addon policy | Drive configuration |
| `passwords.json` | Access groups, passwords | Authentication |
| `.env` | Secrets (LLM key, JWT secret, internal secrets) | Auth and addon access |
| `docker-compose.override.yml` | Mount layout | Recovery roadmap |
| `addons/<name>/<config>.yml` | Per-addon settings (`search-config.yml`, `sync-config.json`) | Addon configuration |
| Drive directories themselves | The actual content | Your content |

You can back up everything together (`tar`, `rsync`, `restic`, `borg`) or separate the configuration from the bulk drive directories — useful if your drives are on a NAS that already has its own snapshots.

## Quick local backup

While the stack is running:

```bash
tar -czf litloft-backup-$(date +%Y%m%d).tar.gz \
  data/ drives.json passwords.json .env docker-compose.override.yml \
  addons/intelligence/search-config.yml \
  addons/cloud-sync/sync-config.json
```

SQLite handles the live snapshot fine for short reads; for very busy installations, use the SQLite online backup API:

```bash
docker compose exec backend sqlite3 /app/data/videos.db ".backup /app/data/videos.db.bak"
```

…and back up the `.bak` instead of the live file.

## Restore

1. Stop the stack:
   ```bash
   docker compose down
   ```
2. Replace the backed-up files in their original locations.
3. Start:
   ```bash
   docker compose up -d --build
   ```

The backend will pick up exactly where it left off. If `addons/intelligence/data/` (the addon's DB and indices) is part of your backup, it will too.

## Drive content

Drive directories live wherever your `docker-compose.override.yml` mounts them. They are not under `data/`. Back them up using the same tool you would use for any other large directory tree — `rsync`, `borg`, or a NAS snapshot.

If a drive lives on shared network storage with its own backup, you typically only need to back up the metadata (`data/`, JSON config) from the Litloft host.

## Backup with the cloud-sync addon

The [cloud-sync addon](../addons/cloud-sync.md) automates pushing drive contents to any rclone remote. It is **not a metadata backup tool**: it only copies the on-disk drive directories. Combine it with a separate metadata snapshot for a full backup story.

## Disaster recovery

Suppose the host disk dies and you only have the backup tarball plus your drive content:

1. Reinstall Docker on a new host.
2. `git clone` Litloft into a fresh directory.
3. Untar the backup into the same directory.
4. Re-mount the drive directories at the same host paths (or update `docker-compose.override.yml` if the new host uses different paths).
5. `docker compose up -d --build`.

If JWT secrets and `data/` survived intact, viewers do not even need to re-unlock.

If only drive content survived, you lose all metadata (tags, comments, AI artefacts). The next scanner pass will re-index files from scratch.

## Migration to a new host

1. On old host: `tar` everything (above), copy to new host.
2. On new host: install Docker, place files, mount drive directories, `docker compose up -d --build`.

If the drive directory paths differ on the new host, update `docker-compose.override.yml` so the **container** paths still match `drives.json`.

## Testing your backup

Best practice — at least once before you need to:

1. Stop the stack.
2. `mv data data.before-test`.
3. Untar your backup into `data/`.
4. Start the stack and confirm everything still works.
5. `rm -rf data && mv data.before-test data` to revert.

If step 4 fails, your backup was incomplete or corrupted. Better to find out now.

## What you cannot back up

- **In-flight uploads.** Chunks under `data/uploads/` for partially-completed sessions are usable but not portable; restored to a different host they are likely orphans.
- **Running ML models.** The intelligence addon caches downloaded weights under its own data dir. Backing this up saves you a long re-download on first start in a new host, but it is not strictly necessary — they will be re-fetched.
- **Container images.** Always rebuilt by `docker compose up --build`, so no need to back them up.

## Encrypted backups

Litloft ships nothing for encryption. Layer your tool of choice — `borg`, `restic`, `gpg` on the tarball, or rclone's `crypt` remote when using cloud-sync.
