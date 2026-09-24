# Environment variables

Every environment variable the core and its addons read, with its default and what it does.

Put values in `.env` (Compose reads it automatically) and pass them to containers in `docker-compose.override.yml`:

```yaml
services:
  backend:
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET}
```

A variable only reaches the containers whose `environment` lists it. Compose sets variables when a container starts, so every change needs `docker compose up -d`. Generate secrets with `openssl rand -hex 32`.

---

## Core (backend)

### `DRIVES_CONFIG`
- **Default**: `./drives.json`. The base `docker-compose.yml` sets `/app/drives.json`.
- Path of `drives.json`, read at startup and rewritten by `/setup` and `/admin/settings`.

### `PASSWORDS_CONFIG`
- **Default**: `./passwords.json`. The base `docker-compose.yml` sets `/app/passwords.json`.
- Path of `passwords.json`, read on unlock and rewritten by `/setup` and `/admin/settings`.

### `DRIVES_MOUNT_ROOT`
- **Default**: `/app/drives`
- Directory scanned when `drives.json` is `[]`: each subdirectory becomes a drive entry `{"name": "<dir>", "path": "<root>/<dir>"}`. `configure.py` mounts drives under `/app/drives/`, so set this only if you mount them elsewhere.

### `DATA_DIR`
- **Default**: `./data`. The base `docker-compose.yml` sets `/app/data`.
- Holds the SQLite database (`data.db`), thumbnails, converted files, upload chunks, addon data directories, the marker files and the generated JWT secret.

### `JWT_SECRET`
- **Default**: generated on first boot and saved to `${DATA_DIR}/.jwt_secret` (mode `0600`).
- Signs viewer tokens. When set, it is used instead of the saved file, which is left untouched. Changing it signs out every viewer.

### `LITLOFT_SETUP_TOKEN`
- **Default**: a new token each time the backend starts while `${DATA_DIR}/setup_completed` is absent, printed in the backend log. It is never written to disk.
- Required (as the `X-Litloft-Setup-Token` header) by every config write `/setup` makes, until setup is complete. `configure.py` writes it to `.env` and puts it in the URL it prints.
- Without it, restarting the backend during setup replaces the token; read the log again.
- Once `setup_completed` exists it is not used, and `POST /api/admin/config/setup-token/verify` returns `404`.

### `CORE_INTERNAL_SECRET`
- **Default**: empty
- Shared secret for `/api/internal/*`, sent by addons as `X-Internal-Secret`.
- **Unset**: the backend logs a warning at startup, and every internal endpoint accepts requests without it, except `PUT /api/internal/files/{id}/chapters`, which returns `503`.
- **Set but different on the addon**: `403`.
- Set the same value on the backend and on every addon that calls the core. `configure.py` generates it only when the knowledge addon is enabled; with intelligence alone, add it to both the backend and intelligence yourself.

### `CORE_INTERNAL_CONTENT_MAX_BYTES`
- **Default**: `10485760` (10 MiB)
- Largest body `GET /api/internal/files/{id}/content` returns. That endpoint serves only `text/markdown` and `text/plain` files.

### `EVENT_HOOKS_PATH`
- **Default**: `/app/event-hooks.json`
- Path of the webhook configuration. When the file does not exist, no webhooks are sent.

### `INTELLIGENCE_SERVICE_URL`
- **Default**: `http://intelligence:8100`
- Where the core proxies `/api/addons/intelligence/*`. **When unset, the addon is hidden** from `/setup` and `/admin/settings`. `configure.py` sets it when you enable intelligence.

### `KNOWLEDGE_SERVICE_URL`
- **Default**: `http://knowledge:8200`
- The same for the knowledge addon.

### `SEARCH_WEBHOOK_SECRET`
- **Default**: empty
- Sent as `X-Webhook-Secret` on webhooks to intelligence, because the intelligence listeners in `event-hooks.json` name it in `secret_env`. Set it here and on the intelligence container, or on neither. See the [intelligence entry](#search_webhook_secret-1).

### `KNOWLEDGE_WEBHOOK_SECRET`
- **Default**: empty
- Sent as `X-Webhook-Secret` on webhooks to knowledge. Set it here and on the knowledge container, or on neither. `configure.py` sets both when you enable knowledge.

### `LITLOFT_MAX_UPLOAD_SIZE_GB`
- **Default**: `50`
- Largest file a single upload may be. Decimals are accepted.
- **A value that is not a positive number stops the backend from starting.**
- An upload is also refused with `507` unless `DATA_DIR` and the target drive each have 1.1 times the file size free.

---

## Frontend

A normal deployment needs none of these. The `/api/*` rewrite always targets `http://backend:8000`.

### `BACKEND_URL`
- **Default**: `http://backend:8000`
- Upstream for the `/api/ws` WebSocket, which `frontend/server.js` proxies directly. It does not change the `/api/*` rewrite.

### `PORT`
- **Default**: `3000`
- Port the frontend server listens on inside the container. To change the host port, use `LITLOFT_PORT`.

### `HOSTNAME`
- **Default**: `0.0.0.0`
- Address the frontend server binds to.

### `NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR`
- **Default**: `true`
- Opens the Knowledge editor inside the file detail pane. `false` or `0` opens it on `/addons/knowledge?edit={id}` instead.
- Read at build time: changing it needs `docker compose up -d --build`.

---

## Compose

### `LITLOFT_PORT`
- **Default**: `3000`
- Host port published by the base `docker-compose.yml` (`"${LITLOFT_PORT:-3000}:3000"`). Setting it in `.env` is enough to change the port. The application never reads it.

---

## Intelligence addon

### `LLM_API_KEY`
- **Default**: empty
- API key for the LLM provider set in `search-config.yml` `llm.provider`. Overrides `llm.api_key` in the yaml and in the settings GUI. Not needed for ollama or other local providers.

### `DRIVE_MOUNTS`
- **Default**: empty
- Comma-separated `name=/path` pairs mapping each drive to its read-only mount in the addon container, e.g. `movies=/drives/movies,photos=/drives/photos`. A drive with no entry is not indexed.
- The key must be the drive's `name` in `drives.json`. `configure.py` writes the mount directory name as the key, so after renaming a drive in `/setup` or `/admin/settings`, change the key to match.

### `HOMEVAULT_DB_PATH`
- **Default**: `/data/litloft.db`
- The core's SQLite database, opened read-only. With the recommended `./data:/data:ro` mount, set `/data/data.db` (`configure.py` does). See [read-only mounts for addons](../admin-guide/docker-compose.md#read-only-mounts-for-addons).

### `HOMEVAULT_THUMBNAILS_DIR`
- **Default**: `/data/thumbnails`
- The core's thumbnails, used for video frame search. The default matches the `./data:/data:ro` mount.

### `HOMEVAULT_INTERNAL_URL`
- **Default**: `http://backend:8000`
- Base URL of the core, used for restart notices and chapter approval.

### `HOMEVAULT_INTERNAL_API_URL`
- **Default**: `http://backend:8000/api/internal`
- Base URL of the core's Internal API, used for policy lookups, access filtering, file details and watch history. Note the `/api/internal` suffix: this is not the same value as `HOMEVAULT_INTERNAL_URL`.

### `INTELLIGENCE_DATA_DIR`
- **Default**: `/intelligence-data`
- The addon's own data: the search database, downloaded models, and the override files the settings GUI writes. `configure.py` mounts `./data/addons/intelligence` here.

### `SEARCH_CONFIG_PATH`
- **Default**: `/app/search-config.yml`
- Path of `search-config.yml`.

### `ALLOWED_BASE_DIRS`
- **Default**: `/drives/`
- Comma-separated directory prefixes the addon may read media from. Anything outside them is refused.

### `OPENAI_API_KEY`
- **Default**: empty
- Key for the `openai_compatible` transcription provider. Not used for the LLM; that is `LLM_API_KEY`.

### `DEEPGRAM_API_KEY`
- **Default**: empty
- Key for `transcription.provider: deepgram`.

### `ELEVENLABS_API_KEY`
- **Default**: empty
- Key for `transcription.provider: elevenlabs_scribe`.

### `ASSEMBLYAI_API_KEY`
- **Default**: empty
- Key for `transcription.provider: assemblyai`.

### `GEMINI_API_KEY`
- **Default**: empty
- Key for `transcription.provider: gemini`.

### `TRANSCRIPTION_MAX_INPUT_MEMORY_BYTES`
- **Default**: `67108864` (64 MiB)
- Larger inputs are converted to audio on disk and sent to the transcription provider in chunks. Raise it on a host with memory to spare; lower it if transcription runs out of memory.

### `CORE_INTERNAL_SECRET`
- **Default**: empty
- Same value as on the core. Required to approve AI chapter suggestions: the addon returns `503` when it is unset here, and the core returns `403` when it differs.

### `SEARCH_WEBHOOK_SECRET`
- **Default**: empty
- Checked on the addon's webhooks (`scan.complete`, `files.deleted`, `files.restored`, `files.missing`, `files.recovered`, `files.moved`, `files.purged`). Unset, the addon accepts webhooks without it.
- **Set it on the backend and here, or on neither.** The backend sends the header from its own environment. Set only here, every webhook gets `403` and indexing stops without any other sign. Set only on the backend, nothing is checked.
- `configure.py` generates it and sets both sides when you enable intelligence.

### `KNOWLEDGE_SERVICE_URL`
- **Default**: `http://knowledge:8200`
- Used to clear the knowledge addon's link to an AI summary.

### `KNOWLEDGE_WEBHOOK_SECRET`
- **Default**: empty
- Sent to the knowledge addon on that same call. Must match the knowledge container's value when that one is set. `configure.py` does not pass it to intelligence.

### `INTELLIGENCE_WRITE_LOCK_TIMEOUT`
- **Default**: `300` (seconds)
- How long a writer waits for the search database lock before failing with `WriteLockTimeout`. A wait this long means something is holding the lock by mistake; raising the value hides that.

### `INTELLIGENCE_WATCHDOG_INTERVAL`
- **Default**: `10` (seconds)
- How often the watchdog checks that the addon's event loop is still running.

### `INTELLIGENCE_WATCHDOG_THRESHOLD`
- **Default**: `120` (seconds)
- How long the event loop may stall before the addon logs an error with every thread's stack. It logs once per stall and never restarts anything; recover with `docker compose restart intelligence`.

### `INTELLIGENCE_SEARCH_DB_PATH`
- **Default**: empty (`${INTELLIGENCE_DATA_DIR}/search.db` is used)
- Points the addon at an existing search database. Used by the evaluation harness; leave it unset in a deployment.

### `SQLITE_VEC_PATH`
- **Default**: `/usr/local/lib/sqlite-vec/vec0`
- The sqlite-vec extension loaded into the search database. The image installs it at the default path.

---

## Knowledge addon

### `KNOWLEDGE_DATA_DIR`
- **Default**: `/knowledge-data`
- Where the addon keeps its database (`knowledge.db`).

### `HOMEVAULT_INTERNAL_URL`
- **Default**: `http://backend:8000`
- Base URL of the core.

### `KNOWLEDGE_USER_AGENT`
- **Default**: a Chrome user-agent string
- User-Agent the web clipper sends. Change it for a site that refuses the default.

### `KNOWLEDGE_WEBHOOK_SECRET`
- **Default**: empty
- Checked on the addon's webhooks (`files.missing`, `files.recovered`, `files.purged`). Unset, the addon accepts them without it. Set the same value on the backend.

### `CORE_INTERNAL_SECRET`
- **Default**: empty
- Same value as on the core, sent on every call to the core's Internal API. Needed once the core has it set; with a different value, the core refuses the addon's Internal API calls with `403`.

### `NOTE_SCANNER_INTERVAL_SECONDS`
- **Default**: `3600`
- How often the addon rescans vault folders to match frontmatter with its database. It also scans once at startup.

---

## Recommended for a production install

| Variable | Set on | Why |
|---|---|---|
| `JWT_SECRET` | backend | Stable across restarts; change it to sign everyone out |
| `CORE_INTERNAL_SECRET` | backend and every addon | Unset, the Internal API accepts anyone on the Docker network; needed for AI chapter approval |
| `SEARCH_WEBHOOK_SECRET` | backend and intelligence | Unset, intelligence webhooks are not checked |
| `KNOWLEDGE_WEBHOOK_SECRET` | backend and knowledge | Unset, knowledge webhooks are not checked |
| `LLM_API_KEY` | intelligence | Needed for cloud LLM providers |
| `LITLOFT_PORT` | `.env` only | When port 3000 is taken |

`.env` template:

```dotenv
# Core
JWT_SECRET=...
CORE_INTERNAL_SECRET=...
LITLOFT_PORT=3000

# Intelligence
LLM_API_KEY=...
SEARCH_WEBHOOK_SECRET=...
OPENAI_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ASSEMBLYAI_API_KEY=
GEMINI_API_KEY=

# Knowledge
KNOWLEDGE_WEBHOOK_SECRET=...
```

`.env` is in `.gitignore`; never commit it.
