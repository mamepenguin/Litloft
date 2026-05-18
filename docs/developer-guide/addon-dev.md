# Addon development

Addons extend Litloft without forking core. There are two flavours (in-process Python module, independent service container), two scopes (drive, global), and one rule that governs what may go in the Internal API.

This page covers everything you need to write a new addon.

## Choose your flavour

| Flavour | Use when |
|---|---|
| **In-process** | Pure Python, no heavyweight deps, no need to isolate failure. Examples: `cloud-sync`, `media_import`. |
| **Independent service** | Heavy runtime (PyTorch, custom ffmpeg, ML models), or you want fault isolation. Examples: `intelligence`, `knowledge`. |

In-process addons:

- Live in `addons/<name>/backend/`.
- Are wired in by symlinking `backend/addons/<name>` → `../../addons/<name>/backend`.
- Loaded at backend startup; share the FastAPI app, the DB session, the WS broadcaster.

Independent service addons:

- Ship their own `Dockerfile`.
- Run as a separate container declared in `docker-compose.override.yml`.
- Talk to the core via the public addon proxy (browser → core → addon) and the Internal API (addon → core, Docker network only).

## Choose your scope

Declare a scope at addon load time:

- **`drive`** — the addon operates on a specific drive at a time. URL: `/drive/{drive}/addons/{name}/...`. Frontend sends `X-Lit-Drive` header.
- **`global`** — the addon does not bind to a single drive. URL: `/admin/...`.
- **`both`** — declare both surfaces.

An undeclared scope is a load error. There is no implicit default.

## ADDON_META and manifest.json

In-process addons expose `ADDON_META` from their Python entry point:

```python
ADDON_META = {
    "name": "my_addon",
    "scope": "drive",                 # drive | global | both
    "label": "My addon",
    "icon": "puzzle",
    "slots": ["file-detail-sections", "folder-actions"],
    "features": {
        "transcription_cloud": True,
        "rag": True,
    },
    "pages": [
        { "path": "", "title": "Dashboard" },
        { "path": "settings", "title": "Settings" },
    ],
}
```

Independent service addons ship `manifest.json` with the same shape. The host proxy reads it on startup.

## Per-drive policy

Configure in `drives.json`:

```json
{
  "name": "Movies",
  "addons": {
    "my_addon": { "transcription_cloud": false }
  }
}
```

Rules:

- Boolean shorthand: `true` enables every feature; `false` disables.
- Object form overrides per feature.
- Unspecified keys: graceful-degradation (your addon decides the default).

The core treats this map as a **generic dictionary**. It does not interpret addon names or feature names. That stays inside your addon.

## Defence in depth

For each drive-scoped feature, defend twice:

1. **Pre-check in the host proxy** — disabled features return `404` before the request reaches your addon.
2. **`is_feature_enabled()` in your worker** — second check inside the addon, in case a writer or test bypassed the proxy. Disabled feature → no-op.

Event hooks are the inverse: filtering is **fail-open** so an addon that goes briefly unreachable does not lose events. The addon's own `WHERE` clause is the second layer.

## Lifecycle webhooks

The core emits these events:

- `files.added`, `files.removed`, `files.recovered`, `files.missing`, `files.purged`
- `scan.complete`

Subscribe by writing to `event-hooks.json` (in `data/`). Each hook has:

```json
{
  "event": "files.purged",
  "url": "http://my_addon:8300/api/addons/my_addon/webhook/files.purged",
  "secret_env": "MY_ADDON_WEBHOOK_SECRET",
  "drives": ["*"]
}
```

The core signs the payload with HMAC-SHA256 using the env var named by `secret_env`; your addon verifies the `X-Webhook-Secret` header. Without the secret, any process inside the Docker network could forge events.

When a drive's policy flips off your addon, the addon should `purge_drive(drive)` against its own data. Skip the purge if the policy lookup fails — that prevents a transient core outage from accidentally wiping addon state.

## Internal API

Addons that need to read core data go through `/api/internal/*` on the Docker network.

### What's available

- `GET /api/internal/accessible-drives` — drive enumeration.
- `GET /api/internal/drive-policy?drive=...` — policy for a drive.
- `GET /api/internal/files/{id}` — file metadata.
- `GET /api/internal/files/{id}/content` — file body (text MIMEs only, gated by `CORE_INTERNAL_SECRET`, default 10 MB cap).
- `POST /api/internal/files/{id}/tags` — set tags (gated).
- `GET /api/internal/viewer-history?viewer_id=&drive=&after=&before=&kind=` — viewer's watched / not-watched lookup within a drive and time window.
- `POST /api/internal/filter-file-ids` — access control filter.
- `POST /api/internal/files/bulk-state` — lifecycle bulk read.
- `POST/GET/DELETE /api/internal/file_relations` — typed link graph. GET accepts `file_id=`, `drive=`, `kind=`, `limit=`.
- `POST /api/internal/files/bulk` — full FileResponse for multiple IDs (service-to-service, no auth).
- `POST /api/internal/restart-pending` — touch core's `restart_pending` sentinel (gated by `CORE_INTERNAL_SECRET`).
- `POST /api/internal/addon-events` — bridge an event onto the WebSocket.

### Internal API policy

The core's Internal API surface stays small on purpose. New endpoints must satisfy these rules:

- **R1 First-class core entity.** The endpoint operates on entities the core itself owns and renders (drives, files, tags, comments, playlists, watch history, profiles, lifecycle states). Concepts that never appear in the core UI stay inside your addon.

- **R2 Generic shape.** Path, parameters, and response shape do not include the name of any specific addon or feature. Accept `kind: str` opaquely (e.g. `file_relations.kind`); never surface workflow names like `kind=not_viewed` directly. Same spirit as the "core does not interpret addon name / feature name; it's a generic dictionary" treatment of `drives.json.addons`.

- **R3 Multi-addon viability test.** Ask: *"Can I name a concrete second addon that would use this endpoint?"* Yes → eligible for core. No → it is leakage from a single addon. *Conceptually generic but I cannot name one* is a red flag; generalisation without concrete examples is rationalisation.

- **R4 Write asymmetry.** Reads can be open broadly. For writes, ask: *does the core's own UI / search / access control consume this data?* Yes (e.g. tag writes feeding core search) → exposing the write is justified. No (addon writes, only the addon reads) → keep the write inside your addon.

- **R5 Promotion target.** When your addon emits "candidates / guesses / suggestions" the user can promote, the promotion target must be one of: an entity that appears in the core UI (auto_tags Approve → `File.tags`), or a concept owned by a specific addon (AI summary → knowledge note). Otherwise, leave it in the addon DB as a candidate.

Decision flow: walk R1 → R3 → R2 → R4 (writes) → R5 (addon-derived) in order. All YES → fine. Any NO → keep it in the addon's DB and use the addon-to-addon proxy for cross-addon communication.

When in doubt, look at the existing 13 endpoints — they are the worked examples. The `file_active_summary` migration to the knowledge addon (April 2026) is a worked example of removing an endpoint that violated R1/R3.

### Contract tests

Every Internal API endpoint has a contract test in `tests/test_internal_api_contract.py` covering:

- Wire shape (status code, response shape, error path).
- Validator parity (frontend Zod / addon Pydantic schemas in lockstep with core Pydantic).

When you add a new internal endpoint, add the contract test in the same PR.

## Slot contributions

Litloft's frontend hosts named slots (`search-modes`, `file-detail-sections`, `dashboard-widgets`, `folder-actions`). To contribute:

1. Declare the slot in your `ADDON_META.slots` array.
2. Ship the React component under `addons/<name>/frontend/`.
3. The slot system imports your component on demand, filtered by per-drive policy.

Slots receive props: `fileId` (where applicable), `drive`, `videoRef`, `mediaController`, etc. Check the slots manifest for the precise contract.

## Frontend pages

If you ship `addons/<name>/frontend/Page.tsx`, the route `/drive/<drive>/addons/<name>` (or `/admin/<name>` for global addons) is auto-generated. Do not write a manual wrapper.

For sub-pages, add files under `addons/<name>/frontend/` matching App Router conventions (e.g. `addons/<name>/frontend/settings/page.tsx` becomes `/drive/<drive>/addons/<name>/settings`).

## i18n for addons

Addon translations live at `addons/<name>/frontend/messages/{ja,en}.json`. Tracked in the addon's repo. The merge script combines them into the core `messages/` at build time. Do **not** put addon keys in `messages-core/` — keep them in the addon dir.

## Enable / disable

- **Install** — clone under `addons/<name>/`, symlink for in-process, add the service block for independent.
- **Uninstall** — remove the symlink / service block.
- **Per-drive disable** — toggle in the [settings GUI](../admin-guide/settings-gui.md) → AddonPolicy.

In-process addon enable/disable is symlink-only. Do not modify core code to opt addons in/out.

## Cold-start grace

Independent service addons may race past the backend on cold start. Mitigate with `depends_on: condition: service_healthy` in `docker-compose.override.yml`. Inside the addon, the policy_client should fail open during a 60-second grace window — after that, treat unreachable core as "deny" for writes and "noop" for reads.

For features that depend on a synchronous policy lookup at enqueue time (e.g., cloud transcription job records), the healthy gate is **mandatory**, not optional.

## Don'ts

- Do **not** modify core's `docker-compose.yml`. User-facing config (your addon container) goes in `docker-compose.override.yml`.
- Do **not** import addon code from core. Dependency direction is one-way.
- Do **not** assume the core's DB schema; read through the Internal API.
- Do **not** mount `data/data.db` writable into your addon. Read-only is fine for emergency lookups (`./data/data.db:/data/core.db:ro`); production uses the Internal API.
- Do **not** introduce addon-name-specific routes / response shapes in core.

## See also

- [Addon overview](../addons/overview.md)
- [Architecture](architecture.md)
- [HTTP API reference](../reference/api.md)
