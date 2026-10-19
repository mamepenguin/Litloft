# Monitoring and troubleshooting

Day-to-day checks for a running Litloft. For recovering data, see [backup and restore](backup-restore.md). For upgrades and rollback, see [upgrading](../getting-started/upgrading.md).

## Health check

```bash
docker compose exec backend curl -fsS http://localhost:8000/api/health
# {"status":"ok"}
```

The same check is reachable through the frontend at `http://<host>:<port>/api/health`.

Docker runs it every 30 seconds (timeout 10 s, 3 retries, 10 s start period). After three failures in a row the backend is marked `unhealthy`. The frontend does not start until the backend is healthy.

## Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs --tail=100 backend
docker compose logs -f               # everything
```

Useful filters:

```bash
docker compose logs backend | grep -i scan
docker compose logs backend | grep -i drive
docker compose logs backend | grep -i thumbnail
```

## Container status

```bash
docker compose ps
docker inspect --format='{{json .State.Health}}' "$(docker compose ps -q backend)"
```

Use service names (`backend`, `frontend`) with `docker compose`. Container names depend on the project directory.

## Admin dashboard

`/admin` shows file counts, scan state, disk usage and cache sizes. See [admin dashboard](admin-dashboard.md).

## Common issues

### `409 Scan already in progress`

Only one scan runs at a time across all drives. Scans run when the backend starts and when someone presses **Rescan**; there is no scheduled scan. A `409` means another scan is running.

```bash
docker compose logs backend | grep -i scan   # is a scan running?
docker compose restart backend               # if it is really stuck
```

### Drives not showing

1. Check that `drives.json` is valid JSON:
   ```bash
   python3 -c "import json; json.load(open('drives.json'))"
   ```
2. Check that each drive's directory is mounted into the backend service in `docker-compose.override.yml`.
3. Check the logs: `docker compose logs backend | grep -i drive`.
4. Restart after changing `drives.json`: `docker compose restart backend`.

### Protected drive not visible after unlocking

1. Check that the password's groups in `passwords.json` match the drive's `access_group` in `drives.json`.
2. Check that `passwords.json` is mounted read-write (`./passwords.json:/app/passwords.json`, without `:ro`).
3. Check that the browser accepts cookies. The unlock is stored in the `access_token` cookie.

A locked drive answers `404`, not `403`, so that its existence stays hidden. This is expected.

### Thumbnails not showing

1. Check that `data/thumbnails/` exists and the backend can write to it.
2. Look for ffmpeg errors: `docker compose logs backend | grep -i thumbnail`.
3. HEIC thumbnails are made with Pillow, not ffmpeg. A black HEIC thumbnail means that step failed.

### Uploads

Unfinished uploads are removed when the backend starts.

### Database

The database is `data/data.db`.

```bash
# Count file records
docker compose exec backend python -c "
from app.database import SessionLocal
from app.models import File
db = SessionLocal()
print('Total file rows:', db.query(File).count())
db.close()
"
```

To take a consistent copy while it runs, see [backup and restore](backup-restore.md#quick-local-backup).

### Live updates stop

Live updates use a WebSocket at `/api/ws`, passed through the frontend.

- In the browser's developer tools, check the WS connection under Network.
- `docker compose logs frontend | grep -i ws`.

### Changing the port

Set `LITLOFT_PORT` in `.env`, or change the `ports` mapping in `docker-compose.override.yml`. Do not edit `docker-compose.yml`.

### Files marked missing after a NAS or mount outage

If a drive's whole directory is unreachable, the scan skips it and nothing is marked missing. Restore the mount and rescan.

If the mount is there but a folder inside it cannot be read, files under that folder are marked missing. Rescan once the folder is back and they return with their data.

Do not clear missing files while a mount is offline. See [Trash and missing files](../user-guide/trash-and-missing.md).

## Scheduled maintenance

Litloft does this on its own:

- Trash: files trashed more than 30 days ago are deleted at startup and every 24 hours.
- Uploads: unfinished uploads are removed at startup.

On the host:

```bash
docker image prune -f     # remove old images after upgrades
du -sh data/ data/thumbnails/
```
