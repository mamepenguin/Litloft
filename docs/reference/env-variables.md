# Environment variables

Every environment variable Litloft and its addons read, with defaults, the code
that reads them, and recommended values.

Set them in `.env` (Compose reads this automatically) and inject them into
containers in `docker-compose.override.yml`:

```yaml
services:
  backend:
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET}
```

Generate strong secrets with `openssl rand -hex 32`.

Nothing here is read at runtime from a file — Compose injects the value when a
container starts, so every change needs `docker compose up -d` to take effect.

---

## Core / backend

### `DRIVES_CONFIG`
- **Default**: `./drives.json` (relative to the working dir, which is `/app` in the container). The shipped `docker-compose.yml` sets it explicitly to `/app/drives.json`.
- **Read by**: `backend/app/config.py` (module import).
- **What it does**: Path the backend reads to load drive definitions, and rewrites when the setup wizard / settings GUI saves drives.
- **When to set**: Multi-instance setups that share a config directory; otherwise leave the compose default.

### `PASSWORDS_CONFIG`
- **Default**: `./passwords.json`. The shipped `docker-compose.yml` sets it explicitly to `/app/passwords.json`.
- **Read by**: `backend/app/auth.py` (module import).
- **What it does**: Path the backend reads on unlock, and rewrites when the settings GUI saves passwords.
- **When to set**: Same as above.

### `DRIVES_MOUNT_ROOT`
- **Default**: `/app/drives`
- **Read by**: `backend/app/config.py`, used by `backend/app/services/drive_seed.py`.
- **What it does**: Directory the startup bootstrap scans when `drives.json` is an empty `[]`. Each subdirectory becomes a stub drive entry (`{"name": "<slug>", "path": "<root>/<slug>"}`), which the `/setup` wizard then renames and groups.
- **When to set**: Only if you mount drives somewhere other than `/app/drives/<slug>`. `configure.py` always writes mounts under `/app/drives/`, so the default matches generated configs.

### `DATA_DIR`
- **Default**: `./data`. The shipped `docker-compose.yml` sets it explicitly to `/app/data`.
- **Read by**: `backend/app/config.py` (module import).
- **What it does**: Where the SQLite DB, thumbnails, converted files, upload chunks, addon data directories, the sentinels/flags, and the auto-generated JWT secret live.
- **When to set**: Custom mount points; otherwise leave default.

### `JWT_SECRET`
- **Default**: auto-generated and persisted to `${DATA_DIR}/.jwt_secret` (mode `0600`)
- **Read by**: `backend/app/auth.py` `init_jwt_secret()`, called once at startup.
- **What it does**: Signs viewer JWTs. Setting this takes precedence over the persisted file, which is left untouched.
- **When to set**: To rotate (invalidates every issued token), or to share an identity across multiple instances.
- **How**: `openssl rand -hex 32`. Restart the backend for the new secret to take effect.

### `CORE_INTERNAL_SECRET`
- **Default**: empty
- **Read by**: `backend/app/routers/internal.py` (`verify_internal_secret`, `verify_internal_write_secret`) and `backend/app/main.py` at startup.
- **What it does**: Shared-secret authentication (`X-Internal-Secret` header) for `/api/internal/*`. Compared with `hmac.compare_digest`.
- **Without it**: Startup logs a WARNING. The ordinary gate becomes a **no-op** — every internal endpoint answers unauthenticated requests from any Docker-network peer. The one exception is the strict write gate on `PUT /api/internal/files/{id}/chapters`, which fails closed with `503`.
- **With it set but mismatched**: `403` on every gated endpoint.
- **When to set**: Always, when any addon is enabled. `configure.py` generates it whenever the knowledge addon is enabled, and injects it into backend, intelligence, and knowledge.
- **How**: `openssl rand -hex 32`. The same value must be set on the core and on every addon that talks to internal endpoints.

### `CORE_INTERNAL_CONTENT_MAX_BYTES`
- **Default**: `10485760` (10 MiB)
- **Read by**: `backend/app/routers/internal.py` at module import (changing it needs a backend restart).
- **What it does**: Hard cap on the body returned from `GET /api/internal/files/{id}/content`. That endpoint is additionally restricted to the `text/markdown` and `text/plain` mime allowlist.
- **When to set**: Raise for large Markdown / TXT corpora the knowledge addon may need to ingest. Lower for stricter resource control.

### `EVENT_HOOKS_PATH`
- **Default**: `/app/event-hooks.json`
- **Read by**: `backend/app/services/event_hooks.py` `init()` at startup.
- **What it does**: Path to the webhook configuration. When the file does not exist, hooks stay empty and every emit is a no-op.
- **When to set**: Co-locate with `DATA_DIR` if you keep hooks under it.

### `INTELLIGENCE_SERVICE_URL`
- **Default**: `http://intelligence:8100` (the `target_default` in `addons/intelligence/manifest.json`)
- **Read by**: `backend/app/routers/addon_proxy.py` `_resolve_target_url()`, and `backend/app/main.py` when deciding whether an `external_service` addon is *configured*.
- **What it does**: Upstream the core proxies `/api/addons/intelligence/*` to. **An unset value also hides the addon** from `/setup` and `/admin/settings`, because the core treats a manifest without its `target_env` set as "compose wiring absent".
- **When to set**: `configure.py` writes it into the backend service whenever you enable intelligence. Set it by hand if you added the addon container manually or run it on a different host name/port.

### `KNOWLEDGE_SERVICE_URL`
- **Default**: `http://knowledge:8200` (the `target_default` in `addons/knowledge/manifest.json`)
- **Read by**: Same code paths as `INTELLIGENCE_SERVICE_URL`.
- **What it does**: Same role for the knowledge addon.
- **When to set**: Same as above.

### `LITLOFT_MAX_UPLOAD_SIZE_GB`
- **Default**: `50`
- **Read by**: `backend/app/config.py` at module import.
- **What it does**: Per-file upload size cap. Accepts decimals (e.g. `0.5`, `100`). Uploads are chunked, so this is a sanity cap rather than a memory/request limit.
- **Invalid values fail the boot**: a non-numeric or non-positive value raises at import, so the backend container will not start.
- **When to set**: Hosting very large media (raw camera footage, long 4K) or restricting uploads on small disks. Also ensure both `DATA_DIR` (temp chunks) and the target drive have ~1.1x the file size free; the backend pre-checks and returns `507` otherwise.

---

## Frontend / custom server

The frontend needs no operator configuration in a normal deployment. The
`/api/*` rewrite target in `frontend/next.config.ts` is hard-coded to
`http://backend:8000` and is not configurable by environment.

### `BACKEND_URL`
- **Default**: `http://backend:8000`
- **Read by**: `frontend/server.js`.
- **What it does**: Upstream for the two paths that bypass Next.js and are proxied straight to the backend: the `/api/ws` WebSocket upgrade, and `/api/files/{id}/stream`. It does **not** affect the ordinary `/api/*` rewrite.
- **When to set**: Only if the backend service is not reachable at `backend:8000`.

### `PORT`
- **Default**: `3000`
- **Read by**: `frontend/server.js`. Next.js itself is started on the fixed internal port `3001`.
- **What it does**: Port the custom server listens on inside the container. To change the port you publish on the host, use `LITLOFT_PORT` instead.

### `HOSTNAME`
- **Default**: `0.0.0.0` (also set as `ENV HOSTNAME=0.0.0.0` in `frontend/Dockerfile`)
- **Read by**: `frontend/server.js`.
- **What it does**: Bind address of the custom server.

### `NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR`
- **Default**: `true`
- **Read by**: `frontend/src/lib/featureFlags.ts`. **Build-time only** — `NEXT_PUBLIC_*` values are inlined during `next build`, so changing it requires `docker compose up -d --build`.
- **What it does**: Mounts the Knowledge editor inline in the file-detail pane. Setting it to `false` (or `0`) is the rollback hatch to the legacy `/addons/knowledge?edit={id}` route.

---

## Compose / host

### `LITLOFT_PORT`
- **Default**: `3000`
- **Read by**: Docker Compose interpolation in the base `docker-compose.yml` (`ports: "${LITLOFT_PORT:-3000}:3000"`). The application never reads it.
- **What it does**: Public host port.
- **When to set**: Avoiding port conflicts. Putting `LITLOFT_PORT=8080` in `.env` is the whole change; no override file edit is needed.

---

## intelligence addon

### `LLM_API_KEY`
- **Default**: empty
- **Read by**: `addons/intelligence/app/config.py` `load_settings()`; overrides both the `llm.api_key` field in `search-config.yml` and any GUI override (secrets do not live in the data volume).
- **What it does**: API key for the LLM provider configured in `search-config.yml` `llm.provider`.
- **When to set**: Any cloud provider needs it. For `ollama` and other local backends, leave it unset — the client substitutes a placeholder key, and whether the LLM is enabled depends only on `provider`, `base_url`, and `model`.

### `DRIVE_MOUNTS`
- **Default**: empty
- **Read by**: `addons/intelligence/app/config.py` `load_settings()`.
- **What it does**: Maps core drive names to the addon container's read-only mount points, as a comma-separated `name=/path` list (e.g. `movies=/drives/movies,photos=/drives/photos`). Without it the addon cannot resolve a file to a path it can read, so indexing finds nothing.
- **When to set**: `configure.py` generates it from your drive mounts. Update it by hand whenever you add a drive mount to the intelligence service.

### `HOMEVAULT_INTERNAL_URL`
- **Default**: `http://backend:8000`
- **Read by**: `addons/intelligence/app/routers/admin.py`, `app/workers/chapter_suggestions.py`.
- **What it does**: Base URL of the core service, used for restart-pending notifications and chapter promotion.

### `HOMEVAULT_INTERNAL_API_URL`
- **Default**: `http://backend:8000/api/internal`
- **Read by**: `addons/intelligence/app/policy_client.py`, `app/rag/*`, several workers.
- **What it does**: Base URL of the core's **Internal API** (note the `/api/internal` suffix — this is a different value from `HOMEVAULT_INTERNAL_URL`, not an alias). Used for policy lookups, access filtering, file hydration, and watch-history reads.
- **When to set**: Rarely. `configure.py` does not write it; the default is correct for the generated compose topology.

### `ALLOWED_BASE_DIRS`
- **Default**: `/drives/`
- **Read by**: `addons/intelligence/app/config.py` `load_settings()`.
- **What it does**: Comma-separated allowlist of directory prefixes the addon will read media from. A path outside every prefix is refused.

### `OPENAI_API_KEY`
- **Default**: empty
- **Read by**: `addons/intelligence/app/workers/transcription/openai_compatible.py`.
- **What it does**: API key for the `openai_compatible` transcription provider (OpenAI Whisper API, and any Whisper-compatible endpoint you point `base_url` at). It is **not** the LLM key — text generation uses `LLM_API_KEY`.

### `DEEPGRAM_API_KEY`
- **Default**: empty
- **Read by**: `addons/intelligence/app/workers/transcription/deepgram.py`.
- **What it does**: API key for Deepgram (`transcription.provider: deepgram`).

### `ELEVENLABS_API_KEY`
- **Default**: empty
- **Read by**: `addons/intelligence/app/workers/transcription/elevenlabs_scribe.py`.
- **What it does**: API key for ElevenLabs Scribe (`transcription.provider: elevenlabs_scribe`).

### `ASSEMBLYAI_API_KEY`
- **Default**: empty
- **Read by**: `addons/intelligence/app/workers/transcription/assemblyai.py`.
- **What it does**: API key for AssemblyAI (`transcription.provider: assemblyai`). The `transcription.assemblyai.model` default is `best` (Universal-2); `nano` is available for cost-sensitive workloads. Supports diarisation (`speaker_labels`), word-level timestamps, language auto-detection, and `word_boost` (the addon maps `transcription.hotwords` to it). Files over 5 GB are rejected before upload.

### `GEMINI_API_KEY`
- **Default**: empty
- **Read by**: `addons/intelligence/app/workers/transcription/gemini.py`.
- **What it does**: API key for Google Gemini (`transcription.provider: gemini`). Uses the File API to upload audio/video, then `generate_content` with `gemini-2.5-flash` (default) or `gemini-2.5-pro`. Files over 2 GB are rejected before upload. **Limitations**: word-level timestamps are synthetic (a uniform split of the segment text), and diarisation is not supported. Pick another provider when either matters.

### `CORE_INTERNAL_SECRET`
- **Default**: empty
- **Read by**: `addons/intelligence/app/routers/admin.py`, `app/rag/*`, `app/workers/chapter_suggestions.py` and others; sent as the `X-Internal-Secret` header.
- **What it does**: Same value as in core. Mandatory for promoting AI chapter candidates: the addon returns `503` when it is unset on its own side, and core returns `403` on a mismatch.

### `SEARCH_WEBHOOK_SECRET`
- **Default**: empty
- **Read by**: `addons/intelligence/app/dependencies.py` `verify_webhook_secret()` on the receiving side, and `backend/app/services/event_hooks.py` on the sending side — core resolves it by name from the hook's `secret_env` in `event-hooks.json` and sends it as the `X-Webhook-Secret` header.
- **What it does**: Shared secret for the addon's lifecycle webhooks (`scan.complete`, `files.deleted`, `files.restored`, `files.missing`, `files.recovered`, `files.moved`, `files.purged`), the routes that reconcile and permanently drop index state. It does **not** gate `/queue/*`, which is browser-driven and authorised by the proxy's `admin` pre-check instead.
- **Set it on both containers or neither**: core builds the header inside the **backend** container from its own environment, so the same value has to be in `backend.environment` *and* `intelligence.environment`. On the addon only, all seven webhooks 403 and indexing stops with no other symptom. On the backend only, the addon's gate stays a no-op.
- **Without it**: the gate is a **no-op** — the addon boots normally and accepts unauthenticated webhook posts from any Docker-network peer.
- **How to set**: `openssl rand -hex 32`. `configure.py` generates it when you enable the addon, but only if `addons/intelligence/manifest.json` declares `"secret_env": "SEARCH_WEBHOOK_SECRET"` on **every** listener — that declaration is what makes core attach the header, and without it the wizard deliberately wires neither side.

---

## knowledge addon

### `KNOWLEDGE_DATA_DIR`
- **Default**: `/knowledge-data`
- **Read by**: `addons/knowledge/app/config.py`.
- **What it does**: Where the addon stores its SQLite DB (`knowledge.db`) and intermediate state.

### `HOMEVAULT_INTERNAL_URL`
- **Default**: `http://backend:8000`
- **Read by**: `addons/knowledge/app/config.py`.
- **What it does**: The Docker-network URL of the core. Used by the addon to call the Internal API.

### `KNOWLEDGE_USER_AGENT`
- **Default**: a Chrome-like UA string
- **Read by**: `addons/knowledge/app/config.py` (`CLIP_DEFAULT_USER_AGENT`).
- **What it does**: Override for the web-clip fetcher (some sites refuse non-browser UAs).
- **When to set**: When clipping a site that rate-limits or refuses the default UA.

### `KNOWLEDGE_WEBHOOK_SECRET`
- **Default**: empty
- **Read by**: `addons/knowledge/app/auth.py` `verify_webhook_secret()`; the core sends it via the `secret_env` field of a hook in `event-hooks.json`.
- **What it does**: Shared secret for lifecycle webhooks (`files.missing`, `files.recovered`, `files.purged`), sent as the `X-Webhook-Secret` header.
- **Without it**: the gate is a **no-op** — the addon starts normally and accepts unauthenticated webhook posts from any Docker-network peer. It is not required to boot.
- **How to set**: Match the value the core uses (driven by the hook's `secret_env` in `event-hooks.json`). `openssl rand -hex 32`. `configure.py` generates it when you enable the addon.

### `CORE_INTERNAL_SECRET`
- **Default**: empty
- **Read by**: `addons/knowledge/app/config.py`.
- **What it does**: Same value as in core, sent on Internal API calls. Needed once the core has the secret set, which is what lets the note scanner read content from password-protected drives.

### `NOTE_SCANNER_INTERVAL_SECONDS`
- **Default**: `3600` (1 hour)
- **Read by**: `addons/knowledge/app/main.py` at startup.
- **What it does**: Cadence at which the addon walks Vault directories to reconcile frontmatter with its DB.
- **When to set**: Lower for snappier external-edit pickup; raise to reduce DB churn on huge Vaults.

---

## Quick checklist for a production install

| Variable | Recommended | Reason |
|---|---|---|
| `JWT_SECRET` | strong random | Stable across restarts, rotatable on demand |
| `CORE_INTERNAL_SECRET` | strong random | Without it the Internal API gate is a no-op; mandatory for AI chapter promotion |
| `KNOWLEDGE_WEBHOOK_SECRET` | strong random | Without it the knowledge webhook gate is a no-op |
| `SEARCH_WEBHOOK_SECRET` | strong random | Without it the intelligence webhook gate is a no-op. Set it on the backend **and** the intelligence container. |
| `LLM_API_KEY` | provider-issued | Required for cloud LLM features (auto-tags, summaries, Ask); not needed for ollama |
| `LITLOFT_PORT` | desired port | Avoid 3000 conflicts |

`.env` template:

```dotenv
# Core
JWT_SECRET=...
CORE_INTERNAL_SECRET=...

# Frontend port
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

`.env` is `.gitignored`; never check it in.
