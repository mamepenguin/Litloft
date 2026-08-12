# Environment variables

Every environment variable Litloft and its addons read, with defaults and recommended values.

Set them in `.env` (Compose reads this automatically) and inject them into containers in `docker-compose.override.yml`:

```yaml
services:
  backend:
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET}
```

Generate strong secrets with `openssl rand -hex 32`.

---

## Core / backend

### `DRIVES_CONFIG`
- **Default**: `./drives.json` (relative to the working dir, which is `/app` in the container)
- **What it does**: Path the backend reads to load drive definitions.
- **When to set**: Multi-instance setups that share a config directory; otherwise leave default.

### `PASSWORDS_CONFIG`
- **Default**: `./passwords.json`
- **What it does**: Path the backend reads on unlock.
- **When to set**: Same as above.

### `DATA_DIR`
- **Default**: `./data`
- **What it does**: Where the SQLite DB, thumbnails, uploads, addon DBs, sentinels, and the auto-generated JWT secret live.
- **When to set**: Custom mount points; otherwise leave default.

### `JWT_SECRET`
- **Default**: auto-generated and persisted to `${DATA_DIR}/.jwt_secret`
- **What it does**: Signs viewer JWTs. Setting this overrides the auto-generated value.
- **When to set**: To rotate (invalidates every issued token), or to share an identity across multiple instances.
- **How**: `openssl rand -hex 32`. Restart the backend for the new secret to take effect.

### `CORE_INTERNAL_SECRET`
- **Default**: empty (warned at startup)
- **What it does**: Shared-secret authentication for protected `/api/internal/*` endpoints.
- **Without it**: Legacy internal endpoints retain their documented development behaviour, but strict writes such as `PUT /files/<id>/chapters` fail closed with `503`.
- **When to set**: Always in production setups; required when the knowledge addon is enabled or Intelligence chapter candidates must be approved.
- **How**: `openssl rand -hex 32`. Same value must be set on every addon that talks to internal endpoints.

### `CORE_INTERNAL_CONTENT_MAX_BYTES`
- **Default**: `10485760` (10 MiB)
- **What it does**: Hard cap on the body returned from `GET /api/internal/files/<id>/content`.
- **When to set**: Raise for large Markdown / TXT corpora the knowledge addon may need to ingest. Lower for stricter resource control.

### `EVENT_HOOKS_PATH`
- **Default**: `/app/event-hooks.json`
- **What it does**: Path to the webhook configuration.
- **When to set**: Co-locate with `DATA_DIR` if you keep hooks under it.

### `LITLOFT_PORT`
- **Default**: `3000`
- **What it does**: Public host port. Read from `.env` and used in the base `docker-compose.yml` `ports:` mapping.
- **When to set**: Avoiding port conflicts.

### `LITLOFT_MAX_UPLOAD_SIZE_GB`
- **Default**: `50`
- **What it does**: Per-file upload size cap. Accepts decimals (e.g. `0.5`, `100`). Uploads are chunked, so this is a sanity cap rather than a memory/request limit.
- **When to set**: Hosting very large media (raw camera footage, long 4K) or restricting uploads on small disks. Also ensure both `DATA_DIR` (temp chunks) and the target drive have ~1.1× the file size free; the backend pre-checks and returns 507 otherwise.

---

## intelligence addon

### `LLM_API_KEY`
- **Default**: empty
- **What it does**: API key for the LLM provider configured in `search-config.yml.llm.provider`.
- **When to set**: Any non-`disabled` non-`ollama` provider needs this. For ollama, any non-empty string works (ollama ignores the key but the SDK requires one).

### `OPENAI_API_KEY`
- **Default**: empty
- **What it does**: API key for OpenAI Whisper API when `transcription.provider: openai_compatible` and `base_url` points at OpenAI. Also used by some OpenAI SDK code paths.

### `DEEPGRAM_API_KEY`
- **Default**: empty
- **What it does**: API key for Deepgram (`transcription.provider: deepgram`).

### `ELEVENLABS_API_KEY`
- **Default**: empty
- **What it does**: API key for ElevenLabs Scribe (`transcription.provider: elevenlabs_scribe`).

### `ASSEMBLYAI_API_KEY`
- **Default**: empty
- **What it does**: API key for AssemblyAI (`transcription.provider: assemblyai`). Universal-2 is the default model; `nano` is available for cost-sensitive workloads. Supports diarisation (`speaker_labels`), word-level timestamps, language auto-detection, and `word_boost` (the addon maps `transcription.hotwords` to it). 5 GB upload cap per file.

### `GEMINI_API_KEY`
- **Default**: empty
- **What it does**: API key for Google Gemini (`transcription.provider: gemini`). Uses the File API to upload audio/video, then `generate_content` with `gemini-2.5-flash` (default) or `gemini-2.5-pro` for transcription. 2 GB upload cap. **Limitations**: word-level timestamps are synthetic (uniform split of segment text), and diarisation is not supported. Pick another provider when either matters.

### `CORE_INTERNAL_SECRET`
- **Default**: empty
- **What it does**: Same as in core; the addon sends this header on internal calls. It is mandatory for approving AI chapter candidates. Missing configuration fails with `503`; a missing or mismatched request header is rejected by core with `403`.

---

## knowledge addon

### `KNOWLEDGE_DATA_DIR`
- **Default**: `/knowledge-data`
- **What it does**: Where the addon stores its SQLite DB and intermediate state.

### `HOMEVAULT_INTERNAL_URL`
- **Default**: `http://backend:8000`
- **What it does**: The Docker-network URL of the core. Used by the addon to call the internal API.

### `KNOWLEDGE_USER_AGENT`
- **Default**: a browser-like UA string
- **What it does**: Override for the web-clip fetcher (some sites refuse non-browser UAs).
- **When to set**: When clipping a site that rate-limits or refuses the default UA.

### `KNOWLEDGE_WEBHOOK_SECRET`
- **Default**: *required*; refuses to start without it
- **What it does**: HMAC-SHA256 secret for lifecycle webhooks (`files.missing`, `files.recovered`, `files.purged`).
- **How to set**: Match the value the core uses (driven by `event-hooks.json` `secret_env`). `openssl rand -hex 32`.

### `CORE_INTERNAL_SECRET`
- Same as elsewhere. Required for the knowledge note scanner to read content from password-protected drives.

### `NOTE_SCANNER_INTERVAL_SECONDS`
- **Default**: `3600` (1 hour)
- **What it does**: Cadence at which the addon walks Vault directories to reconcile frontmatter with its DB.
- **When to set**: Lower for snappier external-edit pickup; raise to reduce DB churn on huge Vaults.

---

## Quick checklist for a production install

| Variable | Recommended | Reason |
|---|---|---|
| `JWT_SECRET` | strong random | Stable across restarts, rotatable on demand |
| `CORE_INTERNAL_SECRET` | strong random | Mandatory if knowledge / intelligence addons are running |
| `KNOWLEDGE_WEBHOOK_SECRET` | strong random | Mandatory if knowledge addon is enabled |
| `LLM_API_KEY` | provider-issued | Required for any LLM features (auto-tags, summaries, RAG) |
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
OPENAI_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ASSEMBLYAI_API_KEY=
GEMINI_API_KEY=

# Knowledge
KNOWLEDGE_WEBHOOK_SECRET=...
```

`.env` is `.gitignored`; never check it in.
