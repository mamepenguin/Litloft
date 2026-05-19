# Monitoring and troubleshooting

Day-to-day operational checks for a running Litloft stack. For recovering from data loss see [backup and restore](backup-restore.md); for version changes and rollback see [upgrading](../getting-started/upgrading.md).

## Health check

The backend exposes a liveness probe:

```bash
# Inside the Docker network / on the host (backend is not externally exposed)
docker compose exec backend curl -fsS http://localhost:8000/api/health
# → {"status":"ok"}
```

It is also reachable through the frontend proxy at `http://<host>:<port>/api/health`.

Docker polls this endpoint automatically. The healthcheck is defined in the base `docker-compose.yml`:

| Setting | Value |
|---|---|
| Interval | 30s |
| Timeout | 10s |
| Retries | 3 |
| Start period | 10s |

After 3 consecutive failures the backend container is marked `unhealthy`. The frontend uses `depends_on: condition: service_healthy`, so it does not start serving until the backend is healthy.

## Logs

```bash
docker compose logs -f backend       # follow backend
docker compose logs -f frontend      # follow frontend
docker compose logs --tail=100 backend
docker compose logs -f               # everything
```

Useful filters:

```bash
docker compose logs backend | grep -i scan       # scan progress / completion
docker compose logs backend | grep -i drive      # drive config issues
docker compose logs backend | grep -i thumbnail  # thumbnail / ffmpeg errors
```

## Container status

```bash
docker compose ps                    # service state + health
docker compose top                   # processes per service
docker inspect --format='{{json .State.Health}}' "$(docker compose ps -q backend)"
```

Use the **service names** (`backend`, `frontend`) with `docker compose`, not raw container names — the container name depends on the Compose project directory and is not stable.

## Admin dashboard

`http://<host>:<port>/admin` shows per-drive file counts, disk usage, trash and missing counts, scan status, and system metrics. See [admin dashboard](admin-dashboard.md).

## Common issues

### Scan stuck or `409 Scan already in progress`

Scans are serialised by a single global lock — only one drive scans at a time across the whole app, and there is no periodic auto-scan (scans run at backend startup and on manual `POST /api/drives/{drive}/scan`). A `409` means a scan is already running.

```bash
docker compose logs backend | grep -i scan   # confirm a scan is active
docker compose restart backend               # releases the lock if it is genuinely stuck
```

### Drives not showing

1. Validate `drives.json` syntax:
   ```bash
   python3 -c "import json; json.load(open('drives.json'))"
   ```
2. Verify the drive directories are mounted into the **backend** container in `docker-compose.override.yml` (never edit `docker-compose.yml`).
3. Check logs: `docker compose logs backend | grep -i drive`.
4. `drives.json` changes only take effect after a restart: `docker compose restart backend`.

### Protected drives not visible after `/unlock`

1. Confirm `passwords.json` group names match the `access_group` values in `drives.json`.
2. Ensure the backend has `passwords.json` mounted **read-write** (`./passwords.json:/app/passwords.json` in the override file — never `:ro`, which breaks GUI writes). `configure.py` adds this mount automatically.
3. Ensure browser cookies are enabled — the JWT is the `access_token` cookie (DevTools → Application → Cookies).
4. Restart the backend to reload config.

A locked protected drive is intentionally returned as `404` (not `403`) so its existence stays hidden — this is expected behaviour, not a bug.

### Thumbnails not displaying

1. Check `data/thumbnails/` exists and is writable by the container.
2. ffmpeg errors: `docker compose logs backend | grep -i thumbnail`.
3. HEIC images use Pillow (`pillow-heif`), not ffmpeg — a black HEIC thumbnail usually means the Pillow path failed.

### Upload failures

- Stale/abandoned chunked uploads are cleaned automatically on backend startup.
- On a same-path collision the new file is auto-suffixed; a *missing*-state file at the same path is revived in place.

### Database checks

The SQLite DB is `data/data.db`.

```bash
# Quick row count from inside the container
docker compose exec backend python -c "
from app.database import SessionLocal
from app.models import File
db = SessionLocal()
print('Total file rows:', db.query(File).count())
db.close()
"

# Consistent on-disk snapshot (preferred over copying the live file)
docker compose exec backend sqlite3 /app/data/data.db ".backup /app/data/data.db.bak"
```

### WebSocket connection failures

WebSocket is proxied by the Next.js custom server (`frontend/server.js`) — the backend is never exposed directly.

- Browser DevTools → Network → WS to inspect the connection.
- `docker compose logs frontend | grep -i ws`.
- The client reconnects with exponential backoff and refetches state on reconnect; there is no event replay.

### Changing the port

Set `LITLOFT_PORT` in `.env`, or override the `ports` mapping in `docker-compose.override.yml`. **Do not edit `docker-compose.yml`.**

### Missing files after a NAS / mount outage

If a whole drive root is unreachable the scanner short-circuits (`drive_path.exists() == False`) and does **not** flip every file to Missing. Restoring the mount and rescanning resumes normally. Do not run missing-purge while a mount is offline. Note the protection is drive-root only: if the mount is present but a subtree is unreadable, files under it will flip to Missing on that pass — re-running the scan after the subtree returns recovers them (a moved/returned file with unchanged content is matched by `(file_hash, file_size)` and restored in place).

## Scheduled maintenance

Automatic, in-app:

- **Trash auto-purge** — soft-deleted files older than 30 days are purged at startup and every 24 h.
- **Upload cleanup** — abandoned chunked uploads are removed at startup.

Manual host hygiene:

```bash
docker image prune -f     # reclaim space from old images after upgrades
du -sh data/ data/thumbnails/
```
