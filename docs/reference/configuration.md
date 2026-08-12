# Configuration reference

A single page listing every configuration knob in Litloft. For per-feature explanations, follow the links into the user / admin / addon guides.

Litloft's configuration is split across several files:

`configure.py` is bootstrap-only — it generates the container wiring (`docker-compose.override.yml`, `.env`, empty `drives.json`/`passwords.json`, `event-hooks.json`, and a `search-config.yml` copy when intelligence is enabled). It does not ask for drive names, passwords, access groups, or AI feature modes; those are owned by the `/setup` wizard and `/admin/settings`.

| File | What it configures | Edited by |
|---|---|---|
| `drives.json` | Drives + per-drive addon policy | `configure.py` writes `[]`; backend seeds from mounts; then setup wizard / settings GUI / by hand |
| `passwords.json` | Access groups | `configure.py` writes `[]`; then setup wizard / settings GUI / by hand |
| `.env` | Secrets and env vars | `configure.py` (port / addon secrets) + by hand |
| `docker-compose.override.yml` | Mounts, ports, addon services | `configure.py` (or by hand from the example) |
| `addons/intelligence/search-config.yml` | AI features | `configure.py` copies the example; then by hand |
| `addons/cloud-sync/sync-config.json` | Backup schedule | By hand |
| `event-hooks.json` | Webhooks | `configure.py` (from addon manifests) + by hand |

All settings are reproduced below with defaults and links to detailed docs.

---

## drives.json

JSON array of drive objects.

```json
[
  {
    "name": "Movies",
    "path": "/app/drives/movies"
  },
  {
    "name": "Private",
    "path": "/app/drives/private",
    "access_group": "private",
    "addons": {
      "intelligence": { "transcription_cloud": false, "rag": false },
      "knowledge": false
    }
  }
]
```

| Field | Type | Required | Default | What it does |
|---|---|---|---|---|
| `name` | string | yes | — | Display name and URL slug. Avoid `/` and `\`. |
| `path` | string | yes | — | Container path; must match a volume mount. Validated. |
| `access_group` | string | no | (none) | Marks the drive as protected; viewers must unlock the group. |
| `addons` | object | no | `{}` | Per-addon policy. See the [addon overview](../addons/overview.md). |

Addon policy entries are either a `bool` (whole-addon shorthand) or an object of `feature: bool` overrides. Unspecified keys default to graceful-degradation.

See [drives and access](../user-guide/drives-and-access.md), [settings GUI](../admin-guide/settings-gui.md).

---

## passwords.json

JSON array of password objects. `configure.py` always generates it as `[]`. An empty `[]` is treated identically to an absent file: every drive is public (graceful degradation). It must be mounted **read-write** (`./passwords.json:/app/passwords.json`, never `:ro`) so the wizard and settings GUI can write to it.

```json
[
  { "password": "very-good-password", "groups": ["private", "shared"] }
]
```

| Field | Type | Required | What it does |
|---|---|---|---|
| `password` | string | yes | Plaintext password compared via HMAC-SHA256. |
| `groups` | string[] | yes | The `access_group` names this password unlocks. |

Multiple passwords may grant overlapping groups.

---

## Environment variables

Set in `.env` (read by Compose), then injected into containers explicitly via `docker-compose.override.yml`.

### Core (backend)

| Var | Default | What it does |
|---|---|---|
| `DRIVES_CONFIG` | `./drives.json` | Path to drives.json |
| `PASSWORDS_CONFIG` | `./passwords.json` | Path to passwords.json |
| `DATA_DIR` | `./data` | Working directory for DB, thumbnails, uploads |
| `JWT_SECRET` | auto-generated | JWT signing key. Auto-stored at `${DATA_DIR}/.jwt_secret` if unset. Set explicitly to rotate. |
| `CORE_INTERNAL_SECRET` | (empty; warns) | Shared secret for protected `/api/internal/*` endpoints; strict writes fail closed when unset |
| `CORE_INTERNAL_CONTENT_MAX_BYTES` | `10485760` | Max body size for internal `/files/<id>/content` (bytes) |
| `EVENT_HOOKS_PATH` | `/app/event-hooks.json` | Path to webhook config |
| `LITLOFT_PORT` | `3000` | Public port (read from `.env`, used in base compose) |

### Frontend

The frontend reads its API target from the Next.js custom server config. There are no operator-facing frontend env vars in normal deployments.

### intelligence addon

| Var | Default | What it does |
|---|---|---|
| `LLM_API_KEY` | (empty) | API key for OpenAI / DeepSeek / etc. (ignored for ollama) |
| `OPENAI_API_KEY` | (empty) | OpenAI Whisper API for cloud transcription |
| `DEEPGRAM_API_KEY` | (empty) | Deepgram cloud transcription |
| `ELEVENLABS_API_KEY` | (empty) | ElevenLabs Scribe cloud transcription |
| `ASSEMBLYAI_API_KEY` | (empty) | AssemblyAI cloud transcription (Universal-2 / nano) |
| `GEMINI_API_KEY` | (empty) | Google Gemini File API + generate_content for transcription |
| `CORE_INTERNAL_SECRET` | (matches core) | Used to call core's internal API; required to approve AI chapter candidates |

### knowledge addon

| Var | Default | What it does |
|---|---|---|
| `KNOWLEDGE_DATA_DIR` | `/knowledge-data` | Addon's SQLite & state |
| `HOMEVAULT_INTERNAL_URL` | `http://backend:8000` | Core API endpoint |
| `KNOWLEDGE_USER_AGENT` | (browser-like) | Web-clip fetcher UA override |
| `KNOWLEDGE_WEBHOOK_SECRET` | *required* | HMAC for lifecycle webhooks |
| `CORE_INTERNAL_SECRET` | *required* | Internal API shared secret |
| `NOTE_SCANNER_INTERVAL_SECONDS` | `3600` | Frontmatter reconcile cadence |

For full env-var detail with examples, see [environment variables](env-variables.md).

---

## docker-compose.override.yml

User-customisable compose fragment. Always used with the base `docker-compose.yml`.

Common knobs:

- `services.backend.volumes` — drive mounts and `passwords.json`.
- `services.frontend.ports` — port override (else use `LITLOFT_PORT` in `.env`).
- `services.intelligence:` — declare the intelligence addon container.
- `services.knowledge:` — declare the knowledge addon container.

See [docker-compose customisation](../admin-guide/docker-compose.md).

---

## addons/intelligence/search-config.yml

The intelligence addon's behaviour. The full reference is on the [intelligence page](../addons/intelligence.md#configuration-reference); the top-level sections are:

| Section | What it configures |
|---|---|
| `features` | Per-feature enable/mode flags |
| `llm` | LLM provider, model, retries, timeouts, vision model |
| `summaries` | Summary lengths, citation thresholds, section anchoring (~25 fields) |
| `rag` | Top-k, context budgets, hierarchical retrieval, personal history, category expansion |
| `models` | Whisper, text embedding, CLIP, BLIP model IDs |
| `search` | Alpha (vector vs keyword), default/max limits, score floors |
| `transcription` | Provider selection (`whisper_local` / `openai_compatible` / `deepgram` / `elevenlabs_scribe` / `assemblyai` / `gemini`) and provider-specific settings |
| `indexing` | Reconciliation interval, frame extraction, text chunking |
| `workers` | Concurrency: whisper_parallel, clip_parallel, batch sizes |
| `memory` | Idle-unload thresholds for Whisper / BLIP |

See [intelligence addon](../addons/intelligence.md) for the full table with defaults.

---

## addons/cloud-sync/sync-config.json

```json
{
  "schedule": "0 */6 * * *",
  "mappings": [
    { "drive": "Movies", "remote": "gdrive:litloft/movies" }
  ]
}
```

| Field | Type | What it does |
|---|---|---|
| `schedule` | cron string \| `null` | Auto-sync schedule; `null` disables. |
| `mappings[].drive` | string | Drive name from drives.json. |
| `mappings[].remote` | string | rclone remote target. |

See [cloud-sync addon](../addons/cloud-sync.md).

---

## event-hooks.json

The core's webhook configuration. Lives under `data/event-hooks.json` (or `EVENT_HOOKS_PATH`).

```json
{
  "hooks": [
    {
      "event": "files.purged",
      "url": "http://knowledge:8200/api/addons/knowledge/webhook/files.purged",
      "secret_env": "KNOWLEDGE_WEBHOOK_SECRET",
      "drives": ["*"]
    }
  ]
}
```

| Field | Type | What it does |
|---|---|---|
| `hooks[].event` | string | Event name (`files.created`, `files.updated`, `files.deleted`, `files.restored`, `files.missing`, `files.recovered`, `files.moved`, `files.purged`, `scan.complete`). |
| `hooks[].url` | string | POST target. |
| `hooks[].secret_env` | string | Environment variable holding the HMAC secret. |
| `hooks[].drives` | string[] | Drive name allowlist; `["*"]` means all. |

Hooks are usually written by addon installers; manual editing is rare.

---

## Per-viewer (cookie / localStorage)

Not server config, but worth listing.

| Cookie / key | Storage | What it does |
|---|---|---|
| `lit_viewer` | Cookie | Nickname; hashed to viewer_id |
| `access_token` | Cookie (httponly) | JWT for unlocked drives |
| `NEXT_LOCALE` | Cookie | UI language (`ja` / `en`) |
| `theme-preference` | localStorage | `light` / `dark` / `system` |
| `autoplay` | localStorage | Per player |
| `reading-direction` | localStorage | LTR / RTL for the image viewer |
| `slideshow-interval` | localStorage | Image viewer slideshow |
| `view-mode-<folder>` | localStorage | Grid / list per folder |

See [profile and preferences](../user-guide/profile-preferences.md).

---

## Sentinels and flags (in `data/`)

| File | Set by | Read by | Purpose |
|---|---|---|---|
| `data/setup_completed` | Setup wizard finalisation; also auto-created on startup for upgraded installs whose `drives.json` is already non-empty | `main.py` startup | Hide the `/setup` wizard |
| `data/restart_pending` | Settings GUI writes | Admin dashboard | "Pending changes" banner |
| `data/.jwt_secret` | Backend on first boot | Backend | JWT signing key when `JWT_SECRET` is unset |

Deleting a sentinel resets that signal: e.g., `rm data/setup_completed` to re-run the wizard.

---

## Configuration changes that need a restart

- Adding / removing / renaming drives.
- Changing addon installation (symlinks, compose services).
- Setting `JWT_SECRET` (rotates all existing tokens).
- Most environment variables (because Compose only injects on container start).

Configuration that takes effect without a restart:

- Adding / removing passwords (read on each unlock).
- Editing addon policy (cached for 30 s in addons; re-fetched on next event).
- `addons/intelligence/search-config.yml` (re-read on the next reconcile pass; restart for instant effect).
