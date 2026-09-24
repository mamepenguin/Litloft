# Configuration reference

Every configuration file Litloft reads, with its keys, defaults and validation. Environment variables have their own page: [environment variables](env-variables.md).

| File | What it configures | Edited by |
|---|---|---|
| `drives.json` | Drives and per-drive addon policy | `configure.py` writes `[]`; the backend seeds it from mounts; then `/setup`, `/admin/settings`, or by hand |
| `passwords.json` | Access groups | `configure.py` writes `[]`; then `/setup`, `/admin/settings`, or by hand |
| `.env` | Secrets and variables Compose interpolates | `configure.py`, then by hand |
| `docker-compose.override.yml` | Mounts, ports, addon services | `configure.py`, or by hand from the example |
| `addons/intelligence/search-config.yml` | AI features | `configure.py` copies the example; then by hand, or `/admin/settings` for some sections |
| `addons/cloud-sync/sync-config.json` | Backup schedule | By hand |
| `event-hooks.json` | Webhooks to addons | `configure.py` (from addon manifests), then by hand |

`configure.py` only writes container wiring: `docker-compose.override.yml`, `.env`, empty `drives.json` and `passwords.json`, `event-hooks.json`, and a copy of `search-config.yml` when intelligence is enabled. Drive names, passwords, access groups and addon policy are set in `/setup` and `/admin/settings`.

### Never delete a mounted file

`drives.json`, `passwords.json`, `event-hooks.json` and `search-config.yml` are mounted into containers as single files. If the file does not exist on the host when the container starts, Docker creates a directory at that path, and the backend can neither read nor write it until you remove the directory by hand. To reset one of these files, empty it (`[]` for `drives.json` and `passwords.json`); do not delete it.

---

## drives.json

A JSON array of drive objects.

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
| `name` | string | yes | — | Display name and URL segment. Must not contain `/` or `\`. |
| `path` | string | yes | — | Path inside the backend container; must match a volume mount. |
| `access_group` | string | no | (none) | Marks the drive as protected; viewers must unlock the group. |
| `addons` | object | no | `{}` | Per-addon policy (below). |

The backend refuses to load the file when it is not a JSON array, an entry lacks `name` or `path`, a name contains a path separator, or `addons` is not an object of `bool` or object values.

Writes through `/setup` and `/admin/settings` (`PUT /api/admin/config/drives`) are also rejected (`422`) when a name is empty or duplicated, `path` is not absolute, or `path` is not an existing directory inside the container. Hand edits skip these checks.

### Seeding on first boot

On startup, if `drives.json` is exactly `[]`, the backend writes one entry per subdirectory of `DRIVES_MOUNT_ROOT` (`/app/drives` by default): `{"name": "<dir>", "path": "/app/drives/<dir>"}`. `/setup` is where those entries get their real names and access groups. If the file is absent, is a directory, or is not a JSON array, startup only logs a warning.

### Addon policy

Each entry under `addons` is either a `bool` for the whole addon or an object of `feature: bool` overrides:

- `"knowledge": false`: every feature of that addon is off for this drive.
- `"intelligence": {"rag": false}`: `rag` is off; every other feature is on.
- Key absent: everything is on.

Unlisted addons and features are on. The core does not interpret addon or feature names. `GET /api/drives/{name}/addon-policies` returns the normalised `{default, features}` view to the frontend, and `GET /api/internal/drive-policy` returns the same to addons. The settings API rejects a policy that names an unknown drive or an addon that is not installed.

See [drives and access](../user-guide/drives-and-access.md) and [settings GUI](../admin-guide/settings-gui.md).

---

## passwords.json

A JSON array of password objects. An absent file and `[]` mean the same thing: every drive is public. It must be mounted read-write (`./passwords.json:/app/passwords.json`, never `:ro`), because `/setup` and `/admin/settings` write it.

```json
[
  { "password": "very-good-password", "groups": ["private", "shared"] }
]
```

| Field | Type | Required | What it does |
|---|---|---|---|
| `password` | string | yes | Stored in plain text and compared in constant time. |
| `groups` | string[] | yes | The `access_group` names this password unlocks, or `__admin__` (below). |

Both fields must be non-empty and every group a non-empty string, or the backend refuses to load the file. Multiple passwords may grant overlapping groups.

Writes through the settings API add these checks (`422`): every group must be some drive's `access_group` or `__admin__`, no two entries may share a password, and `***` is not accepted as a password. `GET /api/admin/config/passwords` returns every password as `***`, so a new value must be sent to change one.

### Who counts as admin

A viewer is admin when they have unlocked every `access_group` declared in `drives.json`, or hold the group `__admin__`. When no drive is protected and no password grants `__admin__`, everyone is admin; that is the state of a fresh install.

`__admin__` protects `/admin` while every drive stays public. After setup is complete, only a viewer who has unlocked an `__admin__` password may save an entry that grants it; anyone else gets `403` (`admin_grant_forbidden`).

---

## Environment variables

See [environment variables](env-variables.md).

---

## docker-compose.override.yml

The user-editable Compose file, always used together with the base `docker-compose.yml` (which you do not edit).

- `services.backend.volumes`: drive mounts and `passwords.json`. The `passwords.json` mount must be read-write.
- `services.backend.environment`: secrets and addon URLs; see [environment variables](env-variables.md).
- `services.frontend.ports`: adds a port mapping; it does not replace the base one. To change the port, set `LITLOFT_PORT` in `.env` instead.
- `services.intelligence`, `services.knowledge`: the addon containers.

`drives.json` and `data/` are mounted by the base file and need not be repeated.

See [docker-compose customisation](../admin-guide/docker-compose.md).

---

## addons/intelligence/search-config.yml

Read once when the intelligence container starts, from `SEARCH_CONFIG_PATH` (default `/app/search-config.yml`). Top-level sections:

| Section | What it configures |
|---|---|
| `features` | Per-feature enable/mode flags |
| `llm` | LLM provider, model, retries, timeouts, vision model |
| `summaries` | Summary lengths, citation thresholds, section anchoring |
| `rag` | Top-k, context budgets, retrieval options, personal history |
| `models` | Whisper, text embedding, CLIP, BLIP model IDs |
| `search` | Vector/keyword weighting, limits, score floors |
| `transcription` | Provider (`whisper_local`, `openai_compatible`, `deepgram`, `elevenlabs_scribe`, `assemblyai`, `gemini`) and provider settings |
| `indexing` | Reconciliation interval, frame extraction, text chunking |
| `workers` | Concurrency and batch sizes |
| `memory` | Idle-unload thresholds for Whisper and BLIP |

The intelligence sections of `/admin/settings` save JSON override files in its data directory for `features`, `llm`, `rag`, the embedding model, and the transcription provider. They are merged over the yaml. `LLM_API_KEY` from the environment wins over both.

The full key list with defaults is on the [intelligence page](../addons/intelligence.md#configuration-reference).

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
| `schedule` | cron string or `null` | Automatic sync schedule. `null` or absent turns the scheduler off. An invalid expression is logged and the scheduler does not start. |
| `mappings[].drive` | string | Drive name from `drives.json`. |
| `mappings[].remote` | string | rclone remote target. Must contain `:` and must not start with `-`. |

A missing or unparseable file is logged and treated as having no mappings.

See [cloud-sync addon](../addons/cloud-sync.md).

---

## event-hooks.json

The core's webhook configuration, read once at backend startup from `EVENT_HOOKS_PATH` (default `/app/event-hooks.json`). When the file does not exist, no webhooks are sent.

`hooks` is an object keyed by event name, each holding a list of listeners:

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
| `hooks.<event>` | array | Listeners for that event. |
| `hooks.<event>[].url` | string | POST target. A failed request is logged at debug level and not retried. |
| `hooks.<event>[].addon` | string | Optional. Applies that addon's per-drive policy to this listener. Without it, every event is sent unchanged. |
| `hooks.<event>[].feature` | string | Optional, default `index`. The feature checked against the drive's addon policy. |
| `hooks.<event>[].secret_env` | string | Optional. Name of a backend environment variable whose value is sent as `X-Webhook-Secret`. The header is left out when the variable is empty. |

Events the core emits: `files.created`, `files.updated`, `files.deleted`, `files.restored`, `files.missing`, `files.recovered`, `files.moved`, `files.purged`, `folders.created`, `folders.moved`, `folders.deleted`, `scan.complete`. Payloads are listed in [WebSocket events](websocket-events.md).

When a listener declares `addon`, the core drops the event for drives where that feature is off, and removes those drives' ids from `file_ids`. If the ids cannot be resolved to drives, the event is sent unfiltered.

`configure.py` writes this file from each enabled addon's `manifest.json` `event_hooks`.

---

## Cookies

| Cookie | What it holds |
|---|---|
| `access_token` | JWT listing the unlocked access groups (httponly) |
| `lit_viewer` | Viewer nickname, hashed to the viewer id. Non-browser clients send the `X-Lit-Viewer` header instead. |
| `NEXT_LOCALE` | UI language (`ja` or `en`) |

Other viewer preferences live in the browser's localStorage; see [profile and preferences](../user-guide/profile-preferences.md).

---

## Marker files in `data/`

Only their existence matters, not their contents.

| File | Created by | Effect |
|---|---|---|
| `data/setup_completed` | `POST /api/admin/config/complete-setup` at the end of `/setup`; also at startup when `drives.json` was already non-empty and not seeded | Hides `/setup`. While it is absent, config writes require the setup token (`LITLOFT_SETUP_TOKEN`, or the token printed in the backend log) instead of admin. |
| `data/restart_pending` | Every config write through the settings API, and `POST /api/internal/restart-pending` from addons. Removed at backend startup. | Shows the "restart to apply" banner under `/admin` (`GET /api/admin/config/restart-status`). |
| `data/auto_seeded` | The first-boot drive seed. Never removed. | Keeps a seeded `drives.json` from being taken for a hand-configured one, so `/setup` still appears. |
| `data/titles_recased` | A one-time startup migration that repairs generated titles. Never removed. | Keeps the migration from running again. |
| `data/.jwt_secret` | Backend on first boot (mode `0600`) when `JWT_SECRET` is unset | JWT signing key. |

Deleting a marker resets it. For example, `rm data/setup_completed` shows `/setup` again, and config writes then need the setup token until setup is completed.

Deleting `data/titles_recased` runs the title migration again on the next start. It only changes a title that still equals what the earlier title formatter produced from the file's current name, so an edited title is kept unless it happens to match that form exactly.

Every config write keeps one backup of the previous contents next to the file (`drives.json.bak`, `passwords.json.bak`).

---

## When changes take effect

Needs a backend restart:

- Adding, removing or renaming drives. A settings write is used by config lookups at once, but a new drive is not scanned until the backend restarts; this is what the "restart to apply" banner means.
- Editing `drives.json` or `passwords.json` by hand. The backend caches both; only a write through the settings API clears the cache.
- Adding or removing an addon (checking out the submodule, adding its Compose service).
- `event-hooks.json`.
- Any environment variable, including `JWT_SECRET` (which also signs out every viewer). Compose sets variables only when a container starts.

Needs an intelligence restart (`docker compose restart intelligence`):

- `search-config.yml` and every change saved in the intelligence sections of `/admin/settings`. The addon reads its settings once at startup.

Takes effect without a restart:

- Adding, removing or changing passwords through the settings GUI.
- Addon policy saved through the settings GUI. The intelligence addon caches policy lookups for 30 seconds.
