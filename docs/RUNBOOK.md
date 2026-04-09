# Runbook

## Updating

```bash
git pull
docker compose up -d --build
```

If the build fails, the previous containers remain running.

### Rollback

```bash
# Revert to a previous commit
cd ~/Sources/video_share
git log --oneline -5          # Find the target commit
git checkout <commit-hash>    # Switch to that commit
docker compose up -d --build  # Rebuild & restart
```

```bash
# Return to main
git checkout main
docker compose up -d --build
```

## Monitoring

### Health Check

```bash
# Backend health check
curl http://localhost:8000/api/health

# Via frontend
curl http://localhost:3000/api/health
```

Docker's built-in health check polls `/api/health` every 30 seconds. After 3 consecutive failures, the container is marked unhealthy.

### Admin Dashboard

Open `http://<IP>:3000/admin` in a browser to view:
- Per-drive file counts and disk usage
- Scan status
- System uptime
- Trash file count
- Cache sizes

### Logs

```bash
# All services
docker compose logs -f

# Backend only
docker compose logs -f backend

# Frontend only
docker compose logs -f frontend

# Last 100 lines
docker compose logs --tail=100 backend
```

### Container Status

```bash
docker compose ps
docker compose top
```

## Common Issues

### Container Won't Start

```bash
# Check status
docker compose ps

# Check build logs
docker compose build --no-cache

# Check health check
docker inspect --format='{{json .State.Health}}' video_share-backend-1
```

### Drives Not Showing

1. Validate `drives.json` syntax:
   ```bash
   python3 -c "import json; json.load(open('drives.json'))"
   ```
2. Verify volume mounts in `docker-compose.yml`
3. Check container logs: `docker compose logs backend | grep -i drive`
4. Restart container: `docker compose restart backend`

### Protected Drives Not Visible After /unlock

1. Verify `passwords.json` `groups` match `drives.json` `access_group`
2. Ensure browser cookies are enabled
3. Check JWT token: browser DevTools → Application → Cookies → `hv_token`
4. Restart container to reload config

### Thumbnails Not Displaying

1. Check `data/thumbnails/` directory exists and has correct permissions
2. Check ffmpeg errors: `docker compose logs backend | grep -i thumbnail`
3. For HEIC images: verify pillow-heif is installed correctly

### Scan Stuck / 409 Error

Scans are protected by an exclusive lock. Concurrent execution is not possible.

```bash
# Check scan status
docker compose logs backend | grep -i scan

# Restart container to release lock
docker compose restart backend
```

### Upload Failures

1. File size limit: 2GB
2. Cannot upload to readonly drives
3. Duplicate filenames are rejected
4. Stale uploads are auto-cleaned after 24 hours

### Database Issues

SQLite DB is stored at `data/videos.db`.

```bash
# Check DB status (inside container)
docker compose exec backend python -c "
from app.database import SessionLocal
from app.models import File
db = SessionLocal()
print(f'Total files: {db.query(File).count()}')
db.close()
"

# Backup
cp data/videos.db data/videos.db.bak
```

### WebSocket Connection Failures

- Next.js Custom Server (`server.js`) handles WebSocket proxying
- Check connection: browser DevTools → Network → WS
- Check logs: `docker compose logs frontend | grep -i ws`

### Changing Ports

Edit the `ports` section in `docker-compose.yml`:

```yaml
frontend:
  ports:
    - "8080:3000"  # External 8080 → Internal 3000
```

## Backup

### Required Backup Targets

| Target | Contents | Priority |
|--------|----------|----------|
| `data/` | SQLite DB + thumbnails + JWT secret | Required |
| `drives.json` | Drive configuration | Required |
| `passwords.json` | Access control config | If configured |
| `event-hooks.json` | Event hook config | If using addons |
| `docker-compose.override.yml` | Addon Docker config | If using addons |

Drive contents (video files, etc.) must be backed up separately.

### Backup Command

```bash
tar czf homevault-backup-$(date +%Y%m%d).tar.gz \
  data/ drives.json passwords.json event-hooks.json \
  docker-compose.override.yml 2>/dev/null
```

### Restore

```bash
tar xzf homevault-backup-YYYYMMDD.tar.gz
docker compose up -d --build
```

## Addon Management

### Enable Addon (In-Process)

```bash
# Create symlink
ln -s ../../addons/cloud-sync/backend backend/addons/cloud-sync

# Rebuild container
docker compose up -d --build
```

> **Windows**: Symlinks require Developer Mode or an elevated prompt. Alternatively, copy the directory instead of symlinking.

### Disable Addon

```bash
# Remove symlink
rm backend/addons/cloud-sync

# Rebuild container
docker compose up -d --build
```

### Semantic Search (Standalone Service)

Configured via `docker-compose.override.yml`. Runs on port 8100.

```bash
# Check status
curl http://localhost:3000/api/search/status

# Reindex
curl -X POST http://localhost:3000/api/search/queue/reindex
```

## Scheduled Maintenance

### Automatic (In-App)

- **Trash purge**: auto-deletes files after 30 days (on startup + every 24h)
- **Upload cleanup**: removes stale temp files on startup
- **Orphan tag cleanup**: runs automatically on file deletion

### Manual

```bash
# Clean up Docker images
docker image prune -f

# Check log sizes
docker compose logs --tail=0 2>&1 | docker system df

# Check disk usage
du -sh data/
du -sh data/thumbnails/
```
