# Backup and restore

Litloft has no backup command. All of its state is in files on the host, so you back it up with the tools you already use.

## What to back up

| Path | Contains | Without it you lose |
|---|---|---|
| `data/` | Database, thumbnails, uploads, addon databases (`data/addons/`), the setup marker, the token signing key | Tags, comments, watch history, collections, transcripts and other AI results |
| `drives.json` | Drives and addon policy | Drive configuration |
| `passwords.json` | Passwords and groups | Access control |
| `.env` | Setup token, API keys, addon secrets | Addon access to the backend and to providers |
| `docker-compose.override.yml` | Mounts, port, addon services | A record of how the stack was wired |
| `addons/intelligence/search-config.yml`, `addons/cloud-sync/sync-config.json` | Addon settings | Addon configuration |
| Drive directories | Your files | Your files |

Drive directories are wherever `docker-compose.override.yml` mounts them, not under `data/`. If they live on a NAS with its own snapshots, you may only need to back up the rest.

## Quick local backup

Take a consistent copy of the database first, because it may be written while you copy:

```bash
docker compose exec backend python -c "
import sqlite3
src = sqlite3.connect('/app/data/data.db')
dst = sqlite3.connect('/app/data/data.db.bak')
src.backup(dst)
dst.close()
"
```

Then archive everything:

```bash
tar -czf litloft-backup-$(date +%Y%m%d).tar.gz \
  data/ drives.json passwords.json .env docker-compose.override.yml \
  addons/intelligence/search-config.yml \
  addons/cloud-sync/sync-config.json
```

Leave out the config files you do not have. When you restore, use `data.db.bak` as `data.db`.

For a simpler exact copy, stop the stack first with `docker compose down` and copy the files as they are.

## Restore

1. `docker compose down`
2. Put the backed-up files back in their places.
3. `docker compose up -d --build`

Everything in `data/` comes back, including the addon databases under `data/addons/`.

## Disaster recovery

If the host is lost and you have the backup archive and your drive directories:

1. Install Docker, Git and Python 3 on the new host.
2. `git clone --recurse-submodules` Litloft into a new directory.
3. Extract the backup into that directory.
4. Mount the drive directories. If their host paths changed, update `docker-compose.override.yml` so the container paths stay the same as in `drives.json`.
5. `docker compose up -d --build`

With `data/` intact, including `data/.jwt_secret`, devices stay unlocked.

If only the drive directories survived, Litloft scans them as new. Tags, comments, history and AI results are gone.

## Moving to a new host

Follow the disaster recovery steps with a fresh backup from the old host.

## Testing a backup

Do this once, before you need it:

1. `docker compose down`
2. `mv data data.before-test`
3. Extract the backup's `data/`.
4. Start the stack and check that everything works.
5. `docker compose down`, then `rm -rf data && mv data.before-test data`.

If step 4 fails, the backup is incomplete.

## Not worth backing up

- **Unfinished uploads** under `data/uploads/`. They are removed on the next start anyway.
- **Container images.** `docker compose up --build` rebuilds them.
- **Downloaded models.** The intelligence addon downloads them again, which only takes time.

## Drive contents off-site

The [cloud-sync addon](../addons/cloud-sync.md) copies drive directories to an rclone remote on a schedule. It does not copy `data/` or the config files, so combine it with the backup above.

## Encryption

Litloft does not encrypt backups. Use `borg`, `restic`, `gpg` on the archive, or rclone's `crypt` remote with cloud-sync.
