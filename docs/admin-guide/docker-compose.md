# docker-compose customisation

Litloft runs as a Docker Compose stack. Do not edit `docker-compose.yml`. Your settings go in `docker-compose.override.yml`, which Compose merges in automatically and Git ignores.

`configure.py` writes the override file for you:

```bash
python3 configure.py
```

To write it by hand, start from the template:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

## Services

`docker-compose.yml` defines two services:

- `backend`, on port 8000, reachable only inside the Docker network.
- `frontend`, on port 3000, the only entry point.

Addon services (intelligence, knowledge) are defined in the override file.

## Drive mounts

Each drive is a host directory mounted under `/app/drives/<slug>` in the backend:

```yaml
services:
  backend:
    volumes:
      - ./videos:/app/drives/default
      - /mnt/nas/movies:/app/drives/movies
      - /mnt/nas/photos:/app/drives/photos
```

The slug is a path identifier, not the display name. On a fresh install the backend creates one drive per mounted directory, and you name them in the `/setup` wizard. To add a drive later, add the mount, run `docker compose up -d --build`, then add the drive in [Settings](settings-gui.md#drives).

- Add `:ro` to a mount to keep Litloft from writing to that drive. It is optional.
- On macOS and Windows, bind mounts of very large directories are slower than on Linux.

## Passwords file

`configure.py` always creates `passwords.json` as `[]` and mounts it read-write:

```yaml
services:
  backend:
    volumes:
      - ./passwords.json:/app/passwords.json
```

Do not add `:ro`. The wizard and Settings write this file from inside the container. The file must exist on the host before `docker compose up`; if it does not, Docker creates a directory there and the backend cannot use it. An empty `[]` means no passwords: every drive is public.

## Port

The default port is 3000. To change it, set it in `.env`:

```dotenv
LITLOFT_PORT=8080
```

Or publish a port in the override file:

```yaml
services:
  frontend:
    ports:
      - "8080:3000"
```

A `ports:` list in the override is added to the one in `docker-compose.yml`, not swapped for it. To replace it, write `ports: !reset []` first.

## Environment variables

Secrets go in `.env`, which Git ignores, and the override file refers to them by name:

```yaml
services:
  backend:
    environment:
      - LITLOFT_SETUP_TOKEN=${LITLOFT_SETUP_TOKEN:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}
```

See [environment variables](../reference/env-variables.md) for the full list.

## Adding addon containers

`configure.py` writes the intelligence and knowledge services when you enable them; prefer it. A hand-written intelligence service looks like this:

```yaml
services:
  backend:
    environment:
      - INTELLIGENCE_SERVICE_URL=http://intelligence:8100
      - SEARCH_WEBHOOK_SECRET=${SEARCH_WEBHOOK_SECRET:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}

  intelligence:
    build: ./addons/intelligence
    expose:
      - "8100"
    volumes:
      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro
      - ./data/addons/intelligence:/intelligence-data
      - ./data:/data:ro
      - /dev/null:/data/.jwt_secret:ro
      - ./videos:/drives/default:ro
    environment:
      - DRIVE_MOUNTS=default=/drives/default
      - HOMEVAULT_DB_PATH=/data/data.db
      - HOMEVAULT_INTERNAL_URL=http://backend:8000
      - LLM_API_KEY=${LLM_API_KEY:-}
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY:-}
      - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY:-}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ASSEMBLYAI_API_KEY=${ASSEMBLYAI_API_KEY:-}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}
      - SEARCH_WEBHOOK_SECRET=${SEARCH_WEBHOOK_SECRET:-}
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

- Mount every drive you want indexed, read-only, and list it in `DRIVE_MOUNTS` with the same slug. Without `DRIVE_MOUNTS` the addon silently indexes nothing.
- Set `SEARCH_WEBHOOK_SECRET` on both services or on neither. On the addon alone, every webhook from the backend is rejected and indexing stops with no other sign. It only has an effect when `addons/intelligence/manifest.json` declares `"secret_env": "SEARCH_WEBHOOK_SECRET"`; `configure.py` checks that for you. `KNOWLEDGE_WEBHOOK_SECRET` works the same way for the knowledge addon.
- Set `CORE_INTERNAL_SECRET` to the same value on both services. If the values differ, the addon cannot read file contents. If the backend has none, the addon cannot save chapters.
- Keep `depends_on: condition: service_healthy`. The mounts in the next section need it.

## Read-only mounts for addons

Mount drives into addons read-only (`:ro`). An addon that needs the core database gets the whole data directory, read-only, and the path to the database inside it:

```yaml
volumes:
  - ./data:/data:ro
  - /dev/null:/data/.jwt_secret:ro
environment:
  - HOMEVAULT_DB_PATH=/data/data.db
```

Three rules:

1. Always add the `/dev/null` line. `data/.jwt_secret` is the key the backend signs unlocks with. An addon that can read it can give itself access to every drive and to the admin API. `/dev/null` hides it.
2. Keep the `service_healthy` condition. On a first run, `data/.jwt_secret` is created when the backend starts. If the addon starts first, the container fails to start with `openat .jwt_secret: read-only file system`.
3. Never mount `data.db` on its own. SQLite keeps `data.db-wal` and `data.db-shm` next to the database and deletes them on shutdown. A mount of a missing file makes Docker create a directory in its place, and the backend then fails with `unable to open database file`. To recover: `docker compose down`, `rmdir data/data.db-wal data/data.db-shm`, then `docker compose up -d`. A file mount also hides `/data/thumbnails` from the intelligence addon. Nothing fails, but **Similar files** stops finding visual matches for videos.

The rest of `data/` (other addons' databases, uploads) stays readable to the addon. That is acceptable only for addons you trust. Addons from others should use the Internal API instead. See [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy).

## Healthcheck

The backend healthcheck calls `GET /api/health`. The frontend starts only once the backend is healthy. Give the same `depends_on` to every addon service. See [monitoring](monitoring.md#health-check).

## Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f intelligence    # if running
```

## Resource limits

Limits go in the override file. They help keep the intelligence addon in check during heavy indexing:

```yaml
services:
  intelligence:
    deploy:
      resources:
        limits:
          cpus: "4"
          memory: 8g
```

## Multiple instances

To run two Litlofts on one host, clone into two directories, give each its own `LITLOFT_PORT`, and start each with its own project name, for example `docker compose -p litloft-a up -d`. Each directory has its own `data/`, `drives.json`, `passwords.json` and `.env`.
