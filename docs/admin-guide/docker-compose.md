# docker-compose customisation

Litloft is run as a Docker Compose stack. The base file `docker-compose.yml` is shipped with the project and **must not be edited**. All operator-specific configuration lives in `docker-compose.override.yml`, which Compose merges in automatically.

`configure.py` generates `docker-compose.override.yml` for you from a short set of questions (mounts, port, which addons to enable). Run it instead of copying the example by hand:

```bash
python3 configure.py
```

If you prefer to write the override file yourself, start from the template:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

The override file is `.gitignored` so your customisation is private to your machine. The sections below describe what `configure.py` writes and how to adjust it afterwards.

## Services

The base file defines two services:

- **backend** — FastAPI on port 8000, exposed only inside the Docker network (`expose:` not `ports:`).
- **frontend** — Next.js custom server on port 3000, the only public entry point.

Addon containers (intelligence, knowledge, …) are introduced through your override file or by including their own compose fragments.

## Drive mounts

`configure.py` asks for one host path and a slug per drive and writes the mount lines for you. Each mount maps a host directory to `/app/drives/<slug>`:

```yaml
services:
  backend:
    volumes:
      - ./videos:/app/drives/default
      - /mnt/nas/movies:/app/drives/movies
      - /mnt/nas/photos:/app/drives/photos
```

The slug here is a path identifier, not the display name. The backend seeds one logical drive entry per mounted directory on first startup, and you give each drive its real name (and optional password protection) later in the `/setup` wizard. To add a drive after the fact, append a mount line and run `docker compose up -d --build` again.

- `:ro` is optional and only for drives you want Litloft to never write into (read-only library). It is not required and not the default.
- Bind mounts work as expected on Linux; on macOS/Windows expect slower I/O for very large drives (Docker Desktop's filesystem is the bottleneck).

## Passwords file

`configure.py` always generates an empty `passwords.json` (`[]`) and mounts it **read-write**, regardless of whether you intend to use passwords yet:

```yaml
services:
  backend:
    volumes:
      - ./passwords.json:/app/passwords.json
```

Do **not** add `:ro` to this mount. Passwords are created and edited through the `/setup` wizard and `/admin/settings`, which write `passwords.json` from inside the backend container; a read-only mount makes those writes fail. The single-file bind-mount also needs a real host file to exist — an absent file makes Docker create a directory there, which the backend cannot read or write — which is why `configure.py` writes the empty `[]` up front.

An empty `passwords.json` is semantically identical to having no passwords at all: every drive is public (graceful-degradation mode). It only stops being a no-op once you add an entry through the GUI.

## Port

The frontend listens on port 3000 inside the container. The default published port is also 3000.

The simplest override is via `.env`:

```dotenv
LITLOFT_PORT=8080
```

If you need finer control (e.g. multiple instances), publish a different port from the override file:

```yaml
services:
  frontend:
    ports:
      - "8080:3000"
```

Note that adding `ports:` in an override **adds** to the base file's `ports:` rather than replacing it. To replace, set `ports: !reset []` then add your own.

## Environment variables

The most common env vars to set are listed in [environment variables](../reference/env-variables.md). Inject them either:

- Via `.env` (for variables that the base file already references with `${VAR}` syntax, like `LITLOFT_PORT`).
- Or explicitly in the override file:

  ```yaml
  services:
    backend:
      environment:
        - JWT_SECRET=${JWT_SECRET}
        - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET}
  ```

Sensitive values stay in `.env` (also `.gitignored`). The override file references them by `${NAME}`.

## Adding addon containers

Independent-service addons (intelligence, knowledge) ship their own Dockerfiles and pull in extra runtime dependencies (Whisper models, sentence-transformers, etc.). They are introduced through `docker-compose.override.yml`. Example for intelligence:

```yaml
services:
  backend:
    environment:
      - INTELLIGENCE_SERVICE_URL=http://intelligence:8100
      # Core signs its webhooks to the addon in *this* container, so the
      # same value has to be here and on the addon below.
      - SEARCH_WEBHOOK_SECRET=${SEARCH_WEBHOOK_SECRET:-}

  intelligence:
    build:
      context: ./addons/intelligence
    expose:
      - "8100"
    volumes:
      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro
      - ./data/addons/intelligence:/intelligence-data
      # The whole data directory, read-only — never the DB file alone,
      # with the core's JWT signing key masked out. See "Read-only
      # mounts for addons" below for why both lines are needed.
      - ./data:/data:ro
      - /dev/null:/data/.jwt_secret:ro
      # Read-only mounts of the drives the addon should index:
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
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET}
      - SEARCH_WEBHOOK_SECRET=${SEARCH_WEBHOOK_SECRET:-}
    depends_on:
      backend:
        condition: service_healthy
```

`SEARCH_WEBHOOK_SECRET` authenticates the core's lifecycle webhooks to the addon, and it belongs on **both** services or neither. The backend builds the `X-Webhook-Secret` header from its own environment; arming only the addon makes every webhook 403 and indexing stops with no other symptom, while setting it only on the backend leaves the addon's gate a no-op. It takes effect only when `addons/intelligence/manifest.json` declares `"secret_env": "SEARCH_WEBHOOK_SECRET"` on every listener — `configure.py` checks that before wiring either side, and a manual install should do the same. The knowledge addon's `KNOWLEDGE_WEBHOOK_SECRET` works identically.

The `depends_on: condition: service_healthy` is recommended — when the intelligence addon talks to the backend's internal API on cold start, racing past the backend boot can produce `ConnectionRefused`. The addon already fails open during a 60-second grace period, but the healthy gate is the recommended fix and is mandatory when using cloud transcription providers (their job records depend on a synchronous policy lookup at enqueue time).

The base `docker-compose.yml` does **not** include addon services so non-AI users have a smaller stack. The example file includes a commented-out template you can paste from.

## Read-only mounts for addons

Best practice: mount drives read-only into addons. The intelligence addon, for example, only ever reads file content; it has no business writing into your library:

```yaml
- ./videos:/drives/default:ro
```

When an addon needs to look up file metadata directly, give it the core's data **directory**, read-only, and point it at the database inside:

```yaml
volumes:
  - ./data:/data:ro
  - /dev/null:/data/.jwt_secret:ro
environment:
  - HOMEVAULT_DB_PATH=/data/data.db
```

That one mount also covers the generated thumbnails the intelligence addon reads at `/data/thumbnails` to build representative-video embeddings.

**The second line is not optional.** `data/.jwt_secret` is the key the core signs access tokens with, and it lives beside the database. An addon that can read it can mint a token carrying any drive group — or `__admin__` — and call the core's write and delete APIs, which makes the read-only drive mounts above meaningless. Overlaying `/dev/null` leaves the addon an empty file. `/dev/null` is the right mask precisely because it always exists on the host, so it can never become a Docker-created directory itself.

The mask makes `depends_on: backend: condition: service_healthy` **load-bearing for startup**, not merely a cold-start nicety. A bind mount needs its target to exist, and on a first run `data/.jwt_secret` is only created when the backend boots (`init_jwt_secret()` runs in the startup lifespan, before `/health` answers). Start the addon before the backend on a fresh install and container creation itself fails:

```
error mounting "/dev/null" to rootfs at "/data/.jwt_secret":
  openat .jwt_secret: read-only file system
```

The healthy gate orders it correctly, so keep it on every addon that takes this mount.

What this mount still exposes, read-only, is the rest of `data/`: other addons' databases under `data/addons/`, and `data/uploads`. That is a deliberate trade — the alternative that scopes it tighter is to give the database its own subdirectory, which cannot be done without breaking every existing `docker-compose.override.yml` on upgrade. It is acceptable under the personal-tool premise, where every addon is first-party. If you ever run a third-party addon, give it the Internal API instead of this mount.

**Do not bind-mount the database file on its own.** The core runs SQLite in WAL mode, so a reader needs `data.db-wal` and `data.db-shm` next to `data.db`, and SQLite deletes both on a clean shutdown, recreating them on the next write. Naming them in a mount means that whenever they are absent at `docker compose up`, Docker creates a **directory** at each missing path — and the backend then fails to start with `unable to open database file`, because a directory occupies the spot where its WAL belongs. Recovery is `docker compose down`, `rmdir data/data.db-wal data/data.db-shm`, `docker compose up -d`. A directory mount cannot hit this: the directory always exists, and the sidecars are picked up as they come and go.

A file mount has a second consequence, and unlike the WAL one it is
silent. `/data/thumbnails` never appears inside the container, so every
thumbnail the intelligence addon would embed is simply out of reach. The
thumbnail route is best-effort by design — a missing JPEG skips that one
file rather than failing the job — so nothing errors and nothing stops.
The only symptom is that *Similar files* stops offering visual matches
for videos, `.loft` refs and HEIC images, which reads as a weak model
rather than a broken mount. Images are unaffected, because they embed
their own file from the drive mount and never touch `/data/thumbnails`.

If your `docker-compose.override.yml` predates this section, check it:
an addon that mounts `./data/data.db` instead of `./data` is in exactly
this state. Switching to the directory mount above is enough — the addon
logs a warning at startup when the directory is unreadable, and reopens
the thumbnail work for every affected file on the next reconcile.

In practice, the Internal API is preferred over direct DB access; see [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy).

## Healthcheck

The backend ships with a Compose healthcheck that hits `GET /health`. The frontend uses `depends_on: condition: service_healthy` so the public surface is not exposed until the backend is ready. In production add the same on every addon container that talks to the backend.

## Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f intelligence    # if running
```

Set `LOG_LEVEL=debug` in the environment of any service for verbose logging.

## Resource limits

Compose v2 resource limits go in the override file. Helpful for the intelligence addon under heavy indexing:

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

You can run two Litlofts on the same host by:

- Cloning into two directories.
- Setting different `LITLOFT_PORT` for each.
- Using separate `data/` directories.
- Using separate Docker Compose project names: `docker compose -p litloft-a up -d`.

Configuration files (`drives.json`, `passwords.json`, `.env`) are local to each directory.
