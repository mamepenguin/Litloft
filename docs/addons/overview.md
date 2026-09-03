# Addon overview

Litloft addons are optional capability modules. Each addon is a separate Git repository, tracked as a submodule under `addons/<name>/`, and is enabled per drive via `drives.json`. Four are shipped today; more are easy to add — see [addon development](../developer-guide/addon-dev.md).

## The four shipped addons

| Addon | Type | Scope | What it adds |
|---|---|---|---|
| [intelligence](intelligence.md) | Independent service (port 8100) | drive | Semantic search, Ask (RAG), summaries, transcripts, vision descriptions |
| [knowledge](knowledge.md) | Independent service (port 8200) | drive | Vaults of Markdown notes, web clips, frontmatter sync |
| [cloud-sync](cloud-sync.md) | In-process | global | Scheduled rclone backups |
| [media_import](media-import.md) | In-process | drive | URL → `.loft` reference files (YouTube, Vimeo, …) |

## Two flavours of addon

### In-process

The addon code is loaded into the backend FastAPI app at startup via a symlink under `backend/addons/`. It shares the backend's event loop, database session, and websocket bridge.

- Pros: fast, no extra container, no network hop.
- Cons: shares failure domain with the core (a bad addon can crash the backend).

`cloud-sync` and `media_import` are in-process.

### Independent service

The addon ships its own `Dockerfile` and runs in its own container. It talks to the core through:

- The **public addon proxy** on the frontend (`/api/addons/<name>/*`) for browser traffic.
- The **internal API** (`/api/internal/*`) on the Docker network for core data lookups.

- Pros: fault-isolated, can use heavyweight runtimes (PyTorch, ffmpeg-with-NVENC) without bloating the core image.
- Cons: extra container, requires a `depends_on: condition: service_healthy` on cold start.

`intelligence` and `knowledge` are independent services.

## Two scopes

A scope is declared at addon load time:

- `scope: drive` — the addon operates on a specific drive at a time. Frontend pages are reached via `/drive/<drive>/addons/<name>/...` and the request includes the `X-HV-Drive` header. The core proxy validates the header against the viewer's accessible drives.
- `scope: global` — the addon does not bind to a single drive. Frontend pages live at `/admin/<name>` (or wherever the addon declares). Cloud-sync is the canonical example: a single dashboard widget driving backups for all drives.

Addons may also declare `scope: both` if they need both surfaces.

An undeclared scope is a load error — the addon is skipped. There is no implicit default.

## Per-drive policy

Each drive can opt into or out of each addon and its sub-features. The configuration lives in `drives.json`:

```json
{
  "name": "Photos",
  "path": "/app/drives/photos",
  "addons": {
    "intelligence": {
      "transcription_cloud": false
    },
    "knowledge": false
  }
}
```

Rules:

- Boolean shorthand: `true` enables every feature; `false` disables every feature.
- Object form: each `feature: bool` overrides one sub-feature.
- Unspecified keys default to *graceful degradation*: enabled if the addon's manifest says so, disabled otherwise.

The core treats this map as a **generic dictionary** — it does not interpret addon names or feature names. That is the addon's job.

## Capability declaration

Each addon declares its capabilities to the core at load time:

- An in-process addon exposes `ADDON_META` from its Python entry point.
- An independent service addon ships a `manifest.json` (read by the host proxy on start).

Common fields:

- `name` — opaque identifier, must match the directory name.
- `scope` — `drive | global | both`.
- `slots` — UI injection points the addon contributes to (search-modes, file-detail-sections, file-detail-actions, dashboard-widgets, dashboard-alerts, folder-actions).
- `features` — the sub-feature flags exposed to the policy editor.
- `pages` — frontend routes the addon adds.
- `event_hooks` — webhook URLs invoked on lifecycle events.

## UI extension via slots

Litloft's frontend has a small set of named slots:

- `search-modes` — appended to the search page sidebar.
- `file-detail-sections` — stacked cards under the viewer (transcript, AI summary, similar files, …).
- `dashboard-widgets` — admin dashboard cards.
- `dashboard-alerts` — a band above the drive cards, for something an operator should see before anything else. Absent when there is nothing to report.
- `folder-actions` — appended to the folder context menu.
- `file-actions-menu` — entries in the `[...]` overflow menu on the file detail page, for per-file actions that are too infrequent to earn a section.

When no addon contributes to a slot, the slot disappears entirely (no holes in the UI). Per-drive policy filters which addons populate each slot per request.

## Event hooks

The core emits lifecycle events that addons subscribe to:

- `files.created`, `files.updated`, `files.deleted`, `files.restored`, `files.missing`, `files.recovered`, `files.moved`, `files.purged`
- `scan.complete`

Hooks are configured in `event-hooks.json` (in the core data dir). When a hook fires, the core POSTs the payload to the addon's webhook URL with an `X-Webhook-Secret` HMAC header signed with the addon's shared secret (e.g., `KNOWLEDGE_WEBHOOK_SECRET`). Hooks are *fail-open* on lookup error — events are forwarded without filtering when the per-drive policy cache is unreachable.

## Internal API

Addons that need to read core data go through the **internal API** on the Docker network:

- `/api/internal/accessible-drives` — drive enumeration.
- `/api/internal/files/<id>` — file metadata.
- `/api/internal/files/<id>/content` — file body (text MIMEs only, gated by `CORE_INTERNAL_SECRET`, max 10 MB by default).
- `/api/internal/files/<id>/tags` — write tags (idempotent, also gated).
- `/api/internal/file_relations` — read/write the typed-link graph.
- `/api/internal/filter-file-ids` — access-control filter.
- `/api/internal/files/bulk-state` — lifecycle bulk read.
- `/api/internal/addon-events` — bridge to the WebSocket broadcaster.

The endpoints are deliberately small and generic; see [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy).

## Enabling and disabling addons

The four shipped addons are tracked as Git submodules under `addons/`. A `git clone --recurse-submodules` (or, after the fact, `git submodule update --init --recursive`) checks them out. From there:

- **Independent-service addons** (`intelligence`, `knowledge`) — `configure.py` writes the matching service block into `docker-compose.override.yml`. Re-run `python3 configure.py` to toggle the answer, then `docker compose up -d --build`.
- **In-process addons** (`cloud-sync`, `media_import`) — the backend Dockerfile copies every addon's `backend/` directory into the image at build time, so they ship and auto-load as soon as the image is rebuilt; no host-side symlink is required for a Docker install. When you run the backend outside Docker (local development), use `./setup-addons.sh` once from the repo root to symlink each addon's `backend/` (and `frontend/`) into the core tree.
- **Disable an addon entirely** — set the policy to `false` for every drive. For independent services, also remove the service block from `docker-compose.override.yml`; for in-process addons there is no per-image switch — leaving the per-drive policy off keeps the addon dormant.
- **Disable per drive** — toggle in the [settings GUI](../admin-guide/settings-gui.md) → AddonPolicy.

When a drive policy flips an addon off, the addon is responsible for purging the data it had stored for that drive (best practice, with safety: skip the purge if the policy lookup fails to avoid accidental wipe).

## Order of evaluation

A request reaching `/api/addons/<name>/...` goes through several layers:

1. **Frontend rewrite** — `/api/*` rewrites to `backend:8000/api/*`.
2. **addon_proxy** in the core — checks `X-HV-Drive` (when scope=drive), validates against `accessible_drives`, looks up policy.
3. **Policy gate** — pre-check: if disabled, return `404`.
4. **Forward to addon** — independent service hit by HTTP, in-process invoked directly.
5. **Addon worker** — `is_feature_enabled()` belt-and-braces check; turns into a no-op if the policy got missed.

The policy lookup failure mode is *fail-closed* on writes (proxy returns 404) and *fail-open* on event hooks (forward and let the addon decide).

## Where to learn more

- [intelligence](intelligence.md) — by far the biggest addon, with its own configuration file.
- [knowledge](knowledge.md), [cloud-sync](cloud-sync.md), [media_import](media-import.md) for the others.
- [Addon development](../developer-guide/addon-dev.md) for writing your own.
