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
| `addons/intelligence/search-config.yml` | AI features | `configure.py` copies the example; then by hand or the addon's admin GUI |
| `addons/cloud-sync/sync-config.json` | Backup schedule | By hand |
| `event-hooks.json` | Webhooks | `configure.py` (from addon manifests) + by hand |

All settings are reproduced below with defaults and links to detailed docs.

### The single-file bind-mount footgun

`drives.json`, `passwords.json`, `event-hooks.json`, and `search-config.yml` are mounted into the container as **single files**, not directories. If the file does not exist on the host when the container starts, Docker creates a *directory* at that path instead — which the backend can neither read nor write, and which no amount of restarting fixes until you remove the directory by hand.

This is why `configure.py` unconditionally writes `drives.json` and `passwords.json` as an empty `[]` even when you have configured neither, and why it aborts rather than skipping a missing `search-config.yml.example`. Never delete these files to "reset" a setting — empty them instead.

---

## drives.json

JSON array of drive objects. Read by `backend/app/config.py` `load_drives()`, rewritten by `backend/app/routers/admin_config.py` through the atomic writer.

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
| `name` | string | yes | — | Display name and URL slug. Must not contain `/` or `\` (rejected at load). |
| `path` | string | yes | — | Container path; must match a volume mount. |
| `access_group` | string | no | (none) | Marks the drive as protected; viewers must unlock the group. |
| `addons` | object | no | `{}` | Per-addon policy. See the [addon overview](../addons/overview.md). |

`load_drives()` rejects the file outright (the backend surfaces an error rather than degrading) when it is not a JSON array, when an entry lacks `name` or `path`, when a name contains a path separator, or when `addons` is not an object of `bool | object` values.

The settings GUI (`PUT /api/admin/config/drives`) applies three further checks that hand-editing does not: names must be unique, `path` must be absolute, and `path` must already exist as a directory inside the container.

### Auto-seeding on first boot

`configure.py` writes `drives.json` as `[]`. On startup, if the file contains exactly zero entries, `backend/app/services/drive_seed.py` walks `DRIVES_MOUNT_ROOT` (`/app/drives` by default) and writes one stub entry per subdirectory, using the directory name as both `name` and the last path segment. It then touches `data/auto_seeded` so a later boot does not mistake the seeded file for a hand-configured one. The `/setup` wizard is where those stubs get real display names and access groups.

If `drives.json` is absent, is a directory (the footgun above), or is not a JSON array, the bootstrap does nothing but log.

### Addon policy

Addon policy entries are either a `bool` (whole-addon shorthand) or an object of `feature: bool` overrides:

- `"knowledge": false` — every feature of that addon is off for this drive.
- `"intelligence": {"rag": false}` — `rag` is off, every other feature is on.
- key absent entirely — everything is on.

Unspecified keys default to enabled (graceful degradation), and the core never interprets addon or feature names — it passes the dictionary through as-is. `GET /api/drives/{name}/addon-policies` (`backend/app/routers/drive_policies.py`) exposes the normalised `{default, features}` view to the frontend; `GET /api/internal/drive-policy` exposes the same shape to addons.

See [drives and access](../user-guide/drives-and-access.md), [settings GUI](../admin-guide/settings-gui.md).

---

## passwords.json

JSON array of password objects, read by `backend/app/auth.py` `load_passwords()`. `configure.py` always generates it as `[]`. An empty `[]` is treated identically to an absent file: every drive is public (graceful degradation, no error). It must be mounted **read-write** (`./passwords.json:/app/passwords.json`, never `:ro`) so the wizard and settings GUI can write to it.

```json
[
  { "password": "very-good-password", "groups": ["private", "shared"] }
]
```

| Field | Type | Required | What it does |
|---|---|---|---|
| `password` | string | yes | Plaintext password compared via HMAC-SHA256. |
| `groups` | string[] | yes | The `access_group` names this password unlocks. |

Both fields must be non-empty, and every entry in `groups` must be a non-empty string; anything else raises at load. The settings GUI (`PUT /api/admin/config/passwords`) adds two checks: every referenced group must be declared as some drive's `access_group`, and password values must be unique across entries. `GET /api/admin/config/passwords` returns every password masked as `***` — real values never leave the server, so the form must send a new password to rotate one.

Multiple passwords may grant overlapping groups.

### Who counts as admin

`backend/app/auth.py` `is_admin()` grants admin to a viewer who has unlocked **every** `access_group` declared in `drives.json`, or who holds the reserved sentinel group `__admin__`. When `drives.json` declares no protected drive at all and no `__admin__` password exists, everyone is admin (graceful degradation) — that is also the state right after a fresh install.

`__admin__` is not declared by any drive, so the settings GUI rejects it as an unknown group. Granting it means hand-editing `passwords.json` and restarting. Its point is the "every drive stays public, but `/admin` is still gated" configuration.

---

## Environment variables

Set in `.env` (read by Compose), then injected into containers explicitly via `docker-compose.override.yml`. Compose injects on container start, so every variable here needs `docker compose up -d` to change.

### Core (backend)

| Var | Default | What it does |
|---|---|---|
| `DRIVES_CONFIG` | `./drives.json` (compose sets `/app/drives.json`) | Path to drives.json |
| `PASSWORDS_CONFIG` | `./passwords.json` (compose sets `/app/passwords.json`) | Path to passwords.json |
| `DRIVES_MOUNT_ROOT` | `/app/drives` | Directory scanned by the first-boot drive seed |
| `DATA_DIR` | `./data` (compose sets `/app/data`) | Working directory for DB, thumbnails, uploads, sentinels |
| `JWT_SECRET` | auto-generated | JWT signing key. Auto-stored at `${DATA_DIR}/.jwt_secret` if unset. Set explicitly to rotate. |
| `CORE_INTERNAL_SECRET` | (empty; warns at startup) | Shared secret for `/api/internal/*`. Unset makes the gate a no-op everywhere except `PUT /api/internal/files/{id}/chapters`, which 503s. |
| `CORE_INTERNAL_CONTENT_MAX_BYTES` | `10485760` | Max body size for internal `/files/{id}/content` (bytes) |
| `EVENT_HOOKS_PATH` | `/app/event-hooks.json` | Path to webhook config |
| `SEARCH_WEBHOOK_SECRET` | (empty) | Secret core signs intelligence lifecycle webhooks with, resolved by name from the hook's `secret_env`. Needed here as well as on the addon — see the intelligence table below. |
| `INTELLIGENCE_SERVICE_URL` | `http://intelligence:8100` | Proxy target for the intelligence addon. Unset also hides the addon from `/setup` and `/admin/settings`. |
| `KNOWLEDGE_SERVICE_URL` | `http://knowledge:8200` | Same, for the knowledge addon |
| `LITLOFT_MAX_UPLOAD_SIZE_GB` | `50` | Per-file upload cap. A non-numeric or non-positive value stops the backend from booting. |

### Frontend

Normal deployments need none of these. The `/api/*` rewrite target is hard-coded to `http://backend:8000` in `frontend/next.config.ts`.

| Var | Default | What it does |
|---|---|---|
| `BACKEND_URL` | `http://backend:8000` | Upstream for the paths `frontend/server.js` proxies directly: `/api/ws` and `/api/files/{id}/stream` |
| `PORT` | `3000` | Port the custom server listens on inside the container |
| `HOSTNAME` | `0.0.0.0` | Bind address of the custom server |
| `NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR` | `true` | Build-time flag for the inline Knowledge editor; needs a rebuild to change |

### Compose / host

| Var | Default | What it does |
|---|---|---|
| `LITLOFT_PORT` | `3000` | Published host port. Interpolated by Compose in the base `docker-compose.yml`; the application never reads it. |

### intelligence addon

| Var | Default | What it does |
|---|---|---|
| `LLM_API_KEY` | (empty) | API key for the configured LLM provider; overrides the yaml/GUI value. Not needed for ollama. |
| `DRIVE_MOUNTS` | (empty) | `name=/path` comma list mapping core drive names to the addon's read-only mounts |
| `HOMEVAULT_INTERNAL_URL` | `http://backend:8000` | Core service base URL |
| `HOMEVAULT_INTERNAL_API_URL` | `http://backend:8000/api/internal` | Core Internal API base URL (distinct from the above, not an alias) |
| `ALLOWED_BASE_DIRS` | `/drives/` | Comma list of directory prefixes the addon may read media from |
| `OPENAI_API_KEY` | (empty) | `openai_compatible` transcription provider |
| `DEEPGRAM_API_KEY` | (empty) | Deepgram cloud transcription |
| `ELEVENLABS_API_KEY` | (empty) | ElevenLabs Scribe cloud transcription |
| `ASSEMBLYAI_API_KEY` | (empty) | AssemblyAI cloud transcription (`best` / `nano`) |
| `GEMINI_API_KEY` | (empty) | Google Gemini File API + generate_content for transcription |
| `CORE_INTERNAL_SECRET` | (empty; matches core) | Used to call core's Internal API; required to approve AI chapter candidates |
| `SEARCH_WEBHOOK_SECRET` | (empty) | Shared secret for the addon's lifecycle webhooks (`X-Webhook-Secret`). Unset makes the gate a no-op. Set it on the backend **and** here, or on neither: core builds the header in the backend container, so arming one side alone 403s every webhook or gates nothing. Only takes effect when the manifest declares `secret_env` on every listener. |

### knowledge addon

| Var | Default | What it does |
|---|---|---|
| `KNOWLEDGE_DATA_DIR` | `/knowledge-data` | Addon's SQLite & state |
| `HOMEVAULT_INTERNAL_URL` | `http://backend:8000` | Core API endpoint |
| `KNOWLEDGE_USER_AGENT` | (Chrome-like) | Web-clip fetcher UA override |
| `KNOWLEDGE_WEBHOOK_SECRET` | (empty) | HMAC for lifecycle webhooks. Unset makes the gate a no-op; it is not required to boot. |
| `CORE_INTERNAL_SECRET` | (empty; matches core) | Internal API shared secret |
| `NOTE_SCANNER_INTERVAL_SECONDS` | `3600` | Frontmatter reconcile cadence |

For full env-var detail with examples, see [environment variables](env-variables.md).

---

## docker-compose.override.yml

User-customisable compose fragment. Always used with the base `docker-compose.yml`.

Common knobs:

- `services.backend.volumes` — drive mounts and `passwords.json`. The `passwords.json` mount must be read-write; `:ro` breaks the settings GUI.
- `services.frontend.ports` — port override (else use `LITLOFT_PORT` in `.env`). Note that adding a `ports` entry here *adds* a mapping rather than replacing the base one.
- `services.intelligence:` — declare the intelligence addon container.
- `services.knowledge:` — declare the knowledge addon container.

`drives.json` and `data/` are mounted by the base `docker-compose.yml` and do not need to be repeated here.

See [docker-compose customisation](../admin-guide/docker-compose.md).

---

## addons/intelligence/search-config.yml

The intelligence addon's behaviour, read by `addons/intelligence/app/config.py` `load_settings()` (path overridable with `SEARCH_CONFIG_PATH`, default `/app/search-config.yml`). The full reference is on the [intelligence page](../addons/intelligence.md#configuration-reference); the top-level sections are:

| Section | What it configures |
|---|---|
| `features` | Per-feature enable/mode flags |
| `llm` | LLM provider, model, retries, timeouts, vision model |
| `summaries` | Summary lengths, citation thresholds, section anchoring |
| `rag` | Top-k, context budgets, hierarchical retrieval, personal history, category expansion |
| `models` | Whisper, text embedding, CLIP, BLIP model IDs |
| `search` | Alpha (vector vs keyword), default/max limits, score floors |
| `transcription` | Provider selection (`whisper_local` / `openai_compatible` / `deepgram` / `elevenlabs_scribe` / `assemblyai` / `gemini`) and provider-specific settings |
| `indexing` | Reconciliation interval, frame extraction, text chunking |
| `workers` | Concurrency: whisper_parallel, clip_parallel, batch sizes |
| `memory` | Idle-unload thresholds for Whisper / BLIP |

The addon's admin GUI writes small JSON override files into its data directory for the `features`, `llm`, `rag`, and embedding sections; those are merged over the yaml at load. The yaml stays the source for everything the GUI does not expose, and `LLM_API_KEY` from the environment always wins over both.

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
| `schedule` | cron string \| `null` | Auto-sync schedule; `null` or absent disables the scheduler. An invalid cron expression is logged and the scheduler does not start. |
| `mappings[].drive` | string | Drive name from drives.json. |
| `mappings[].remote` | string | rclone remote target. Must contain `:` and must not start with `-`. |

Read by `addons/cloud-sync/backend/service.py`, validated by `addons/cloud-sync/backend/schemas.py`. A missing or unparseable file degrades to "no mappings" with a log line rather than an error.

See [cloud-sync addon](../addons/cloud-sync.md).

---

## event-hooks.json

The core's webhook configuration, read once at startup by `backend/app/services/event_hooks.py`. Its path comes from `EVENT_HOOKS_PATH` (`/app/event-hooks.json` by default). When the file does not exist, hooks are disabled and every emit is a no-op.

`hooks` is an **object keyed by event name**, each holding a list of listeners:

```json
{
  "hooks": {
    "files.purged": [
      {
        "url": "http://knowledge:8200/webhook/files-purged",
        "addon": "knowledge",
        "feature": "index",
        "secret_env": "KNOWLEDGE_WEBHOOK_SECRET"
      }
    ]
  }
}
```

| Field | Type | What it does |
|---|---|---|
| `hooks.<event>` | array | Listeners for that event name. |
| `hooks.<event>[].url` | string | POST target. Failures are logged at debug level and never retried. |
| `hooks.<event>[].addon` | string | Optional. Enables per-drive policy filtering for this listener. Without it, the payload is forwarded unchanged. |
| `hooks.<event>[].feature` | string | Optional, defaults to `index`. The feature checked against the drive's addon policy. |
| `hooks.<event>[].secret_env` | string | Optional. Environment variable holding the shared secret, sent as `X-Webhook-Secret`. Omitted from the request when the variable is empty. |

Event names the core emits: `files.created`, `files.updated`, `files.deleted`, `files.restored`, `files.missing`, `files.recovered`, `files.moved`, `files.purged`, `folders.created`, `folders.moved`, `folders.deleted`, `scan.complete`.

When a listener declares `addon`, the core drops the event for drives where that feature is off, and filters `file_ids` per-file for payloads that carry a list. Filtering is fail-open: if the policy lookup itself errors, the event is forwarded.

Hooks are usually written by `configure.py` from each enabled addon's `manifest.json` `event_hooks` field; manual editing is rare.

---

## Per-viewer (cookie / localStorage)

Not server config, but worth listing. Cookie names come from `backend/app/auth.py` (`COOKIE_NAME`, `lit_viewer`) and `frontend/src/i18n/request.ts`; localStorage keys from the `STORAGE_KEY` constants under `frontend/src/`. The localStorage list is representative, not exhaustive, and unrecognised keys are simply ignored.

| Cookie / key | Storage | What it does |
|---|---|---|
| `lit_viewer` | Cookie | Nickname; hashed to viewer_id |
| `access_token` | Cookie (httponly) | JWT for unlocked drives |
| `NEXT_LOCALE` | Cookie | UI language (`ja` / `en`) |
| `theme-preference` | localStorage | `light` / `dark` / `system` |
| `media-layout-preference` | localStorage | Media page layout |
| `video-share-autoplay` | localStorage | Autoplay toggle (off by default) |
| `video-share-captions` | localStorage | Captions on/off |
| `video-share-playback-rate` | localStorage | Player speed |
| `video-share-view-mode` | localStorage | Grid / list, global default |
| `folderPrefs:{drive}` | localStorage | Per-folder view/sort overrides |
| `image-viewer:reading-direction` | localStorage | LTR / RTL for the image viewer |
| `image-viewer:split-mode` | localStorage | Single / spread page mode |
| `sidebar-open` | localStorage | Sidebar open state |
| `sidebar:order:sections`, `sidebar:section:{name}:collapsed`, `sidebar:sort:tags:{drive}` | localStorage | Sidebar layout; reset from the settings screen |
| `search-history:{drive}` | localStorage | Recent search terms |

See [profile and preferences](../user-guide/profile-preferences.md).

---

## Sentinels and flags (in `data/`)

Thin marker files — their contents are irrelevant, only their existence matters.

| File | Set by | Read by | Purpose |
|---|---|---|---|
| `data/setup_completed` | `POST /api/admin/config/complete-setup` at the end of the wizard; also auto-created at startup for upgraded installs whose `drives.json` was already non-empty before the seed | `GET /api/admin/config/setup-status`, and the first-run bypass in `admin_config.py` | Hide the `/setup` wizard. **While it is absent, config writes are unauthenticated** so the wizard cannot lock itself out — the first-run window is meant to be short. |
| `data/restart_pending` | Every successful config write via `config_writer.atomic_write_json`, and `POST /api/internal/restart-pending` from addons. Cleared on the next backend startup. | `GET /api/admin/config/restart-status`, which drives RestartBanner | "Pending changes, restart to apply" banner |
| `data/auto_seeded` | The first-boot drive seed, once it populates `drives.json`. Never removed. | The setup-sentinel migration | Records that a non-empty `drives.json` came from the seed, not from a pre-GUI hand-config |
| `data/.jwt_secret` | Backend on first boot (mode `0600`) | Backend | JWT signing key when `JWT_SECRET` is unset |

Deleting a sentinel resets that signal: e.g., `rm data/setup_completed` to re-run the wizard. Note that this also reopens the unauthenticated first-run write window until the wizard completes.

Config writes also leave a single-generation backup next to the file they rewrote (`drives.json.bak`, `passwords.json.bak`), taken before the new contents are written.

---

## Configuration changes that need a restart

- Adding / removing / renaming drives. The GUI write is visible to config lookups immediately, but the new drive is not scanned or indexed until the backend restarts — which is what the "pending changes" banner is telling you.
- Editing `drives.json` or `passwords.json` **by hand**. Both are cached in-process for the life of the backend, and only a write through the settings GUI invalidates that cache.
- Changing addon installation (symlinks, compose services).
- Every environment variable, including `JWT_SECRET` (which also invalidates all existing tokens) — Compose only injects on container start.
- `event-hooks.json`, which is loaded once at startup.

Configuration that takes effect without a restart:

- Adding / removing / rotating passwords **through the settings GUI** (the write resets the password cache).
- Editing addon policy through the settings GUI (cached for 30 s in addons; re-fetched afterwards).
- `addons/intelligence/search-config.yml` and the addon GUI's override files (re-read on the next reconcile pass; restart for instant effect).
