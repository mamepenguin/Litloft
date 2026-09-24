# Addon Development Guide

The contract between Litloft's core and its addons: how addons are loaded,
the manifest and proxy fields, event hooks, the Internal API, and the UI
slots. For the decisions to make before writing an addon, start with
[developer-guide/addon-dev.md](developer-guide/addon-dev.md).

## Addon Types

| Type | How it runs | Examples |
|------|-------------|----------|
| **In-process** | Inside the backend Python process, sharing the FastAPI app and the database session | `cloud-sync`, `media_import` |
| **External service** | Its own Docker container, reached through the core's addon proxy | `intelligence`, `knowledge` |

---

## Clean Separation Principle

Core code must not depend on a specific addon.

- Each addon is its own Git repository, checked out as a submodule at
  `addons/{name}/`. Addon files are committed there; the main repository
  records only the submodule pointer (see the Git section of `CLAUDE.md`).
- An addon declares itself at load time: `ADDON_META` in its `router.py`
  (in-process) or `manifest.json` in its repository root (external service).
- An addon that is not checked out does not exist for the core: no sidebar
  row, no slot entries, no proxy routes.
- Core code uses generic loaders only. Status data comes from
  `useAddonStatus(addonName)` in `@/components/AddonSlotsProvider`.

The rule is `.claude/rules/design-decisions.md` → *Addons: implementation
discipline*.

---

## How Addons Are Loaded

### File Layout

```
addons/my-addon/                 # the addon's own repository
  backend/                       # in-process addons: Python package
    __init__.py
    router.py
    requirements.txt             # optional, pip-installed at image build
    install.sh                   # optional, run at image build (system packages)
  frontend/
    Page.tsx                     # optional: the addon's page
    pages/{slug}.tsx             # optional: sub-pages
    slots.ts                     # optional: slot components
    messages/{ja,en}.json        # the addon's translations
  manifest.json                  # external service addons only
```

`setup-addons.sh` links every checked-out addon into the source tree for
local development: `backend/addons/{name}` becomes a symlink to the addon's
`backend/`, and `frontend/src/addons/{name}/` a real directory holding one
symlink per file. Use the script rather than linking by hand: tools that walk
the tree (type-checking, lint, coverage) do not descend a symlinked
directory. Both trees are gitignored.

The Docker builds do not use the symlinks. The backend image copies each
addon's `backend/` to `/app/addons/{name}/`, copies its `manifest.json` next
to it, installs `requirements.txt` and runs `install.sh`. The frontend image
copies each addon's `frontend/` to `src/addons/{name}/` and merges the addon
translation files into the core catalogue.

### Backend Discovery at Startup

1. `_load_addons()` in `main.py` walks `backend/addons/` with
   `pkgutil.iter_modules`. For each package it imports `addons.{name}.router`,
   includes its `router` on the app, registers `ADDON_META`, and collects
   `on_startup`. The router is included even when `ADDON_META` is invalid; the
   addon is then left out of the registry.
2. `addon_registry.load_external_manifests()` reads `*/manifest.json` from
   `/app/addons` (Docker) and `<repo>/addons` (local development). The addon
   name is the directory name. When both hold the same addon, the first
   (Docker) one wins. No manifest at all is the normal state of a core-only
   install and logs `No addon manifests found`.
3. `GET /api/addons/status` returns the merged catalogue:
   `{addons: {name: meta}, slots: {slotId: [entries sorted by priority]}}`.
   Only `label`, `description`, `icon`, `href`, `type`, `slots`, `scope`,
   `policy_features` and `navigation` are returned; `proxy` is not.
   - An external service whose `proxy.target_env` variable is unset in the
     backend container is left out, with its slot entries.
   - With `?drive=`, addons whose `index` feature is off for that drive are
     left out with their slot entries. A drive that does not exist or is not
     unlocked returns an empty catalogue, not 404.

### Frontend Discovery at Runtime

`AddonSlotsProvider` (in the root layout) fetches
`/api/addons/status?drive=<current drive>` whenever the current drive
changes, and preloads each listed addon's `slots.ts`. Core components read
the catalogue through `useAddonSlots()` and render `<AddonSlot>`.

---

## In-Process Addon

### Minimum Required Files

```
addons/{name}/
  backend/
    __init__.py       # can be empty
    router.py         # must export `router` (APIRouter)
                      # optional: ADDON_META (dict), on_startup (async function)
```

### router.py

```python
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import app.config as config
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/addons/my-addon", tags=["my-addon"])

ADDON_META = {
    "label": "My Addon",
    "description": "One sentence shown in the setup wizard.",
    "scope": "drive",               # required: "drive" | "global" | "both"
    "href": "/addons/my-addon",     # presence enables the addon page; omit if none
    "navigation": {                 # optional sidebar row, see `navigation`
        "label": "My Addon",
        "placement": "utility",
        "priority": 50,
    },
    "slots": {
        "file-detail-sections": [
            {"id": "my-section", "label": "My Section", "priority": 30},
        ],
    },
}

async def on_startup() -> None:
    logger.info("My addon initialized")

@router.get("/items")
async def list_items(db: Session = Depends(get_db)):
    ...
```

The `ADDON_META` keys are the same as the manifest's top-level fields
(see [Top-level Manifest Fields](#top-level-manifest-fields)), without `proxy`.

**An in-process router is not behind the addon proxy.** Its routes are
served directly, so none of the proxy's checks apply to them: validate
`X-Lit-Drive` against the caller's unlocked drives yourself
(`check_drive_access(drive, get_unlocked_groups(request))` raises 404
when it fails), and check per-drive policy with `config.is_addon_feature_enabled()`.
A policy that turns the addon off hides it in the UI but does not stop its
routes answering.

### Frontend Files (Optional)

```
addons/{name}/
  frontend/
    Page.tsx          # the addon page; must use this exact name
    pages/{slug}.tsx  # sub-pages
    api.ts            # your API client
```

`Page.tsx` default-exports the page component:

```tsx
// addons/{name}/frontend/Page.tsx
export { default } from "./MyAddonPage";
```

The core ships generic routes that load it:

| Route | Loads | Serves scope |
|---|---|---|
| `/addons/{name}` | `Page.tsx` | `global`, `both` |
| `/drive/{drive}/addons/{name}` | `Page.tsx` | `drive`, `both` |
| `/addons/{name}/{slug}` | `pages/{slug}.tsx` | `global`, `both` |
| `/drive/{drive}/addons/{name}/{slug}` | `pages/{slug}.tsx` | `drive`, `both` |

The addon name must match `^[a-z][a-z0-9_-]*$` and a slug `^[a-z][a-z0-9-]*$`.
A URL that does not match the addon's scope is a 404. Write no page wrapper
of your own.

Your frontend must send `X-Lit-Drive: encodeURIComponent(drive)` on every
drive-scoped call to `/api/addons/{name}/...`.

---

## External Service Addon

An external service runs in its own container. Browser traffic reaches it
through the **Generic Addon Proxy** at `/api/addons/{name}/{path}`, and it
calls back into the core through the [Internal API](#internal-api).

### What Goes Where

| What | Where |
|------|-------|
| Service code, `Dockerfile` | `addons/{name}/` (addon repository) |
| Manifest | `addons/{name}/manifest.json` (addon repository) |
| Frontend | `addons/{name}/frontend/` (addon repository) |
| Event hook declarations | `event_hooks` in the manifest; `configure.py` writes `event-hooks.json` |
| Container definition | `docker-compose.override.yml` (not tracked) |

### Manifest File

```json
{
    "label": "My Service",
    "description": "One sentence shown in the setup wizard.",
    "scope": "drive",
    "href": "/drive/{drive}/addons/my-service",

    "navigation": {"label": "My Service", "placement": "primary", "priority": 30},

    "slots": {
        "search-modes": [
            {"id": "my-search", "label": "My Search", "priority": 10}
        ]
    },

    "policy_features": [
        {"name": "my_feature", "default": true, "i18n_key": "myService.policyFeatures.myFeature"}
    ],

    "event_hooks": [
        {"event": "files.purged", "url": "http://my-service:8100/webhook/files-purged", "addon": "my-service", "feature": "index"}
    ],

    "proxy": {
        "target_env": "MY_SERVICE_URL",
        "target_default": "http://my-service:8100",
        "routes": []
    }
}
```

#### Top-level Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `scope` | Yes | `"drive"` \| `"global"` \| `"both"` (see [Addon Scope](#addon-scope)). Missing or invalid: the addon is not registered |
| `type` | No | Defaults to `"external_service"` for a manifest and `"in_process"` for `ADDON_META` |
| `label` | No | Product name, shown in the admin addon policy table. Falls back to the addon name |
| `description` | No | Shown in the setup wizard's addon step |
| `href` | No | Its presence tells the core the addon has a page. The value is not used as a link; the route is built from the scope and name |
| `icon` | No | Not drawn by the core. The sidebar uses `navigation.icon` |
| `navigation` | No | The addon's sidebar row (see [`navigation`](#navigation)) |
| `slots` | No | UI slot entries (see [UI Slot System](#ui-slot-system)) |
| `policy_features` | No | Per-drive feature toggles in the admin GUI |
| `event_hooks` | No | Lifecycle webhooks (see [Event Hooks](#event-hooks)) |
| `proxy` | Yes for a proxied service | `target_env`, `target_default`, `routes`. The target URL is the value of `target_env`, or `target_default` when it is unset. No URL: the proxy answers 503. An addon without `proxy` gets no proxy routes |

#### `navigation`

One sidebar row for the addon, separate from its product `label`, so the
settings screen can say "Knowledge" while the sidebar says "Notes".

```json
"navigation": {
    "label": "Notes",
    "i18n_key": "knowledge.nav.label",
    "icon": "notebook-pen",
    "placement": "primary",
    "priority": 20
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `label` | Yes | Non-empty English fallback name |
| `placement` | Yes | `"primary"` \| `"sources"` \| `"utility"` |
| `priority` | Yes | Integer (not a boolean); order within the placement |
| `i18n_key` | No | String key in the addon's own message catalogue |
| `icon` | No | String icon token |

If a check fails, the core logs a warning and drops the whole `navigation`
block; the addon, its slots and its proxy routes still load. Other keys in
the block are passed through.

The sidebar draws the row when the addon has a valid `navigation`, an `href`,
and a route it can build (a `drive`-scoped addon needs a current drive).

| `placement` | Where the row goes |
|---|---|
| `primary` | After **Library**, before the **Views** heading |
| `sources` | Under a **Sources** heading after the views. The heading appears only when some addon declares `sources` |
| `utility` | Unheaded, after the user's own sections and before **Trash** |

Rows sort by `priority`, then by addon name. The label is the translation of
`i18n_key` when it resolves, otherwise `label`. The row is highlighted on the
addon's route and every page under it.

Icon tokens the sidebar knows: `download`, `message-circle-question`,
`notebook-pen`, `package`, `rss`. A missing or unknown token draws `package`.
To add one, extend `ADDON_NAV_ICONS` in
`frontend/src/components/sidebar/AddonNavRows.tsx`.

#### `policy_features`

Features an operator can switch per drive in **Settings** → **System** →
the addon policy table. A feature's row appears under a drive only while the
addon itself (its `index` feature) is on for that drive.

| Field | Description |
|-------|-------------|
| `name` | Feature key in `drives.json` → `addons.{addon}.{name}` |
| `i18n_key` | Translation prefix. The GUI reads `<i18n_key>.label`, `<i18n_key>.help` and `<i18n_key>.warning` from the addon's messages |
| `default` | Not read by the core. A feature missing from `drives.json` is always enabled |

### Proxy Route Configuration

The proxy serves `/api/addons/{name}/{path}` for `GET`, `POST`, `PUT`,
`PATCH` and `DELETE`, and forwards only requests that match a declared route.
A route with `"path": "/search"` is `GET /api/addons/my-service/search`.

```json
{
    "path": "/files/{file_id}/thing",
    "methods": ["GET"],
    "pre_check": {"type": "file_access", "param": "file_id"},
    "addon_feature": "my_feature",
    "response_filter": null
}
```

| Field | Default | Meaning |
|-------|---------|---------|
| `path` | — | URL pattern; `{param}` captures one segment |
| `methods` | `["GET"]` | Allowed methods |
| `pre_check` | none | One gate run before proxying (see [Pre-Check Hooks](#pre-check-hooks)) |
| `addon_feature` | none | A per-drive feature gate added to the `pre_check`. Use it on file routes that need both a `file_access` check and a feature gate. Requires `X-Lit-Drive`, and the file's drive must equal it; otherwise 404 |
| `drive_optional` | `false` | On a `scope=drive` addon, accept the request without `X-Lit-Drive` (for `<img>` URLs and admin views). The route must also declare a `pre_check` or `addon_feature`, or it answers 404 |
| `stream` | `false` | Pass the response bytes through unchanged (images, SSE, file streams). No response filter, no `available` field |
| `timeout` | `15` | Upstream timeout in seconds for non-stream routes |
| `response_filter` | none | Drive filtering of the JSON response (see [Response Filters](#response-filters)) |

`require_drive` appears in some manifests but the core does not read it.

What the proxy does with a request:

- **`X-Lit-Drive`** is percent-decoded. A drive the caller has not unlocked is
  403. On a `scope=drive` addon, a missing header is 400 unless the route is
  `drive_optional`. The validated header is forwarded.
- **`X-Lit-Viewer-Id`** is set by the proxy (see
  [Viewer Identity Header](#viewer-identity-header-x-lit-viewer-id)).
- **Upstream 4xx** is returned with the upstream `detail`. A 5xx, a timeout
  or an unreachable service is 502.
- **JSON object responses** get `"available": true` added when absent.
  Non-JSON responses (for example `text/vtt`) pass through unfiltered.

### Response Filters

The proxy filters the response after the upstream answers. Your service can
return rows from every drive; the proxy removes the ones the caller may not
see. Each filtered array's parent also gets a `total` field with the new count.

**`drive_access`**: keep items whose drive the caller has unlocked.

```json
{"type": "drive_access", "array_path": "results", "drive_field": "drive"}
```

**`drive_access_nested`**: the same for several arrays, keyed by dotted path.

```json
{"type": "drive_access_nested", "paths": {"section_a.results": "drive", "section_b.results": "drive"}}
```

**`current_drive_only`** / **`current_drive_only_nested`**: the same shapes,
but keep only items in the request's `X-Lit-Drive` drive. With no header,
nothing is kept. Use these on `scope=drive` addons so one drive's data never
shows in another, even when the caller has unlocked both.

**`null`**: no filtering.

### Pre-Check Hooks

**`file_access`**: the file must be active and in a drive the caller has
unlocked, otherwise 404. `param` names the path parameter (default
`file_id`); a `param` that is not in the route's path makes the route 404.

```json
{"type": "file_access", "param": "file_id"}
```

**`addon_feature`**: 404 when there is no `X-Lit-Drive`, or when
`drives.json` turns the feature off for that drive (by name or through the
boolean shorthand `"addons": {"my-service": false}`). `feature` defaults to
`index`. A drive with no entry is enabled. This gate replaces
`file_access`; to have both on a file route, use `file_access` here and the
route-level `addon_feature` field.

```json
{"type": "addon_feature", "feature": "rag"}
```

**`admin`**: 403 unless the caller is an admin: they hold the admin
password's group, or have unlocked every protected `access_group` in
`drives.json`. It is the same test as `/api/admin` (`app.auth.is_admin`).

Any other `type` makes the route answer 404.

> Do not put addon routes under `/api/admin/...`. Those paths belong to the
> core's admin dashboard and settings API and never reach the proxy. Use
> `/api/addons/{name}/...`.

### Docker Compose

Add the container in `docker-compose.override.yml` (not tracked), and set the
`target_env` variable on the backend:

```yaml
services:
  backend:
    environment:
      - MY_SERVICE_URL=http://my-service:8100

  my-service:
    build: ./addons/my-service
    expose: ["8100"]
    volumes:
      - ./data:/data:ro
      - /dev/null:/data/.jwt_secret:ro
    environment:
      - HOMEVAULT_DB_PATH=/data/data.db
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

Mount the data directory, never `data.db` alone; mask `.jwt_secret`; keep the
`service_healthy` dependency. Why each one matters is in
`.claude/rules/design-decisions.md` → *Addons: implementation discipline*.

### Event Hooks

The core POSTs lifecycle events (scan finished, file trashed, purged, moved…)
to webhook URLs. Declare the ones your addon needs in `manifest.json`;
`configure.py` writes `event-hooks.json` from the manifests of the addons
the operator enables. Do not edit `event-hooks.json`; re-run `configure.py`
after changing `event_hooks`.

The event names, when each fires, their payloads, and the file format are in
[reference/websocket-events.md → Event-hook webhooks](reference/websocket-events.md#event-hook-webhooks) and
[reference/configuration.md](reference/configuration.md#event-hooksjson).

#### Declaring hooks in manifest.json

```json
"event_hooks": [
    {
        "event": "files.purged",
        "url": "http://my-service:8100/webhook/files-purged",
        "addon": "my-service",
        "feature": "index",
        "secret_env": "MY_SERVICE_WEBHOOK_SECRET"
    }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `event` | Yes | Event name |
| `url` | Yes | Webhook URL reachable from the backend container |
| `addon` | No | Addon name, for per-drive policy filtering. Without it, every event is delivered |
| `feature` | No | Feature key checked with `addon`. Default `index` |
| `secret_env` | No | Name of an environment variable in the **backend** container; its value is sent as `X-Webhook-Secret` when non-empty |

`configure.py` keeps the first entry for each URL and drops later ones, even
for a different event. Give each event its own URL.

#### Drive-aware filtering

With `addon` set, the core checks the feature before sending. A payload with
a `drive` is dropped when the feature is off there, or when the drive no
longer exists. A payload with `file_ids` is narrowed to the files in drives
where the feature is on, and dropped when none remain. When the policy lookup
fails, or the file ids cannot be resolved to drives, the event is delivered
unchanged, so a handler that must not act on a disabled drive checks
`GET /api/internal/drive-policy` itself.

### Internal API

External services call the core at `http://backend:8000/api/internal` on the
Docker network. The backend is not exposed outside it. Before proposing a new
endpoint, read [`.claude/rules/internal-api-policy.md`](../.claude/rules/internal-api-policy.md):
an endpoint must pass R1–R5, needs the two-layer contract tests described
there, and is documented here in the same PR.

Auth, per endpoint:

- **Caller credential**: the endpoint evaluates the caller's unlocked drive
  groups. Forward the original request's `Cookie` header (the JWT cookie is
  `access_token`) or its `Authorization: Bearer` token. Without either, only
  public drives count.
- **Optional secret**: `X-Internal-Secret` must equal `CORE_INTERNAL_SECRET`
  when that variable is set on the backend (403 otherwise). When it is unset,
  the check is skipped. Set it on both sides in production.
- **Strict secret**: `CORE_INTERNAL_SECRET` must be set (503 when it is unset
  or blank) and `X-Internal-Secret` must equal it (403 otherwise).
- **None**: no check beyond the Docker network.

Secrets are compared in constant time.

#### Read endpoints (no secret)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /accessible-drives` | Caller credential | `{drives: [name]}`: drives the caller can open. |
| `GET /drive-policy?drive=&addon=` | None | Per-drive policy for one addon (see [Drive policy shape](#drive-policy-shape)). 404 for an unknown drive. |
| `GET /files/{file_id}` | None | `{id, drive, filename, file_type, folder_path, thumbnail_path, updated_at}` for an active file; 404 for missing, trashed or unknown. `updated_at` is ISO-8601 or `null`; use it as a change marker when reconciling a cache. No access check. |
| `POST /filter-file-ids` | Caller credential | Body `{file_ids: [], trust_tier?}` → `{accessible: [], trust_filtered: bool}`. Keeps the active files in drives the caller can open. With `trust_tier` (`verified` \| `unverified`) it also keeps only that tier; any other value is 422. `trust_filtered` is `true` exactly when `trust_tier` was sent. A core too old to know `trust_tier` ignores it and omits `trust_filtered`, so a caller that asked for a tier and does not get `trust_filtered: true` must treat the list as unfiltered. |
| `POST /files/bulk-state` | None | Body `{file_ids: []}` → `{statuses: [{id, drive, state}], not_found: []}`. `state` is `active`, `missing` or `trash`. Unknown ids are in `not_found`. |
| `POST /files/bulk` | None | Body `{file_ids: []}` → `{files: [FileResponse], not_found: []}`, in request order. Missing, trashed and unknown files are in `not_found`. `subtitles` is always `[]`; use `GET /files/{file_id}` or the public API when you need them. |
| `GET /file_relations?file_id=&drive=&kind=&limit=` | None | List of `{id, file_id_a, file_id_b, kind, created_at, created_by}`. At least one of `file_id` (relations on either side) or `drive` is required, else 400; both together are ANDed. `kind` filters. `limit` defaults to 5000, max 20000. |

#### Secret-gated endpoints (optional secret)

| Endpoint | Description |
|----------|-------------|
| `GET /files/{file_id}/content` | The file's UTF-8 text as `text/plain; charset=utf-8`. Ignores drive locks. Only `text/markdown` and `text/plain` files (415 otherwise); 413 above `CORE_INTERNAL_CONTENT_MAX_BYTES` (default 10 MB); 415 when not valid UTF-8; 404 when the file is not active or not on disk. |
| `POST /files/{file_id}/tags` | Body `{tags: []}` → 204. Replaces the file's tags with the validation of `PUT /api/files/{id}/tags` (at most 10, each at most 30 word characters or `-`, case-insensitive dedup; 422 otherwise). 404 for a file that is not active. Used by the knowledge scanner to project frontmatter tags. |
| `POST /file_relations` | Body `{file_id_a, file_id_b, kind, viewer_id?}` → 201 with the relation. `kind` matches `^[a-z][a-z0-9_.-]*$`, 1–32 characters; `viewer_id` is 16 hex characters and is stored as `created_by`. 400 when the two ids are equal or in different drives, 404 when either file does not exist, 409 for a duplicate. The core's Markdown link sync never removes or rewrites a relation created here. |
| `DELETE /file_relations/{relation_id}` | 204, or 404 for an unknown id. |
| `GET /viewer-history?viewer_id=&drive=&after=&before=&kind=` | `{file_ids: []}`, unordered, active files in `drive` only. `kind=viewed` (default): files the viewer opened within `[after, before)`. `kind=not_viewed`: active files in the drive the viewer did not open in that window. `after` / `before` are optional ISO-8601; a value with an offset is converted to UTC. 400 for a `viewer_id` that is not 16 hex characters, another `kind`, an unparsable time, or `after` not earlier than `before`. 404 for an unknown drive. |
| `POST /restart-pending` | Body `{source, reason?}` → 204. Touches `data/restart_pending` so the admin screens show the pending-restart banner. `source` is the addon name (`^[a-z][a-z0-9_.-]*$`, 1–64 characters). 500 when the file cannot be written. Call it after changing configuration that needs a restart. |

#### Strict write endpoints

##### Promote approved chapters

```http
PUT /api/internal/files/{file_id}/chapters
Content-Type: application/json
X-Internal-Secret: <CORE_INTERNAL_SECRET>

{
  "chapters": [
    {"start_time": 0.0, "end_time": 42.5, "title": "Opening"},
    {"start_time": 42.5, "end_time": null, "title": "Discussion"}
  ]
}
```

Success returns 204. The body may contain only `chapters`, and each item only
`start_time`, `end_time` and `title`; any other field (including `source` and
`ordering`) is 422. The core drops entries with a blank title or a missing or
non-finite start, sets an invalid end to `null`, and numbers the rest in
order. It does not cap the count or title length, require non-negative or
ordered times, or sort.

The call replaces the file's whole chapter set and always stores
`source="curated"`. A list with no usable entry is 422 and leaves the
existing chapters untouched. 404 when the file is not active.

Policy check:

| Rule | Why this endpoint passes |
|------|--------------------------|
| R1 first-class core entity | `file_chapters` is owned and rendered by core in the file-detail player companion. |
| R2 generic shape | The path and body carry only chapter values; no addon, source or workflow name. |
| R3 multi-addon viability | Intelligence promotes transcript-derived chapters; Media Import writes the same entity. |
| R4 write asymmetry | Core's chapter panel reads and navigates the promoted data. |
| R5 promotion target | Candidates stay in the producing addon until a user approves them into the core-owned set. |

##### Declare a file's trust tier

```http
PUT /api/internal/files/{file_id}/trust-tier
Content-Type: application/json
X-Internal-Secret: <CORE_INTERNAL_SECRET>

{"tier": "unverified"}
```

Success returns 204. `tier` must be `verified` or `unverified`; another
value, a missing `tier` or any extra field is 422. 404 when the file is not
active.

**409 when a viewer has already ruled on the file** (`trust_reviewed_at` is
set); the file is left untouched. The check and the write are one
conditional update, so a viewer acting at the same time wins. Treat 409 as
done.

Call it at ingest time only, to declare what a file you are creating is: a
Web Clip lands `unverified`; a file the operator placed lands `verified`,
which is the column default, so most ingests need no call. The endpoint never
sets `trust_reviewed_at`; only a person, through the public
`PUT /api/files/{id}/trust-tier`, does.

Policy check:

| Rule | Why this endpoint passes |
|------|--------------------------|
| R1 first-class core entity | `files.trust_tier` is a column of the core `files` table, and core search filters on it. |
| R2 generic shape | The path and values name no addon or feature. |
| R3 multi-addon viability | Knowledge lands Web Clips unverified; Media Import does the same for imported media. |
| R4 write asymmetry | Core's search filter and file-detail control read the column; core's UI performs the human promotion. |
| R5 promotion target | The tier is a core entity; nothing addon-owned is promoted. |

#### WS bridge

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /addon-events` | Optional secret | Body `{event, data, drive?}` → 204. The core broadcasts `data` to connected browsers as `event` (`^[a-z][a-z0-9_.]*$`, 1–128 characters). With `drive`, only viewers who can open that drive receive it. A broadcast failure is logged and still returns 204. |

Chapter events addons use:

| Event | Transport | Payload | Meaning |
|-------|-----------|---------|---------|
| `intelligence.chapter_suggestions.ready` | `POST /addon-events` | `{file_id, drive, created_at}` | A new candidate set is stored; the Intelligence UI reloads it. |
| `intelligence.chapter_suggestions.failed` | `POST /addon-events` | `{file_id, drive, reason}` | Generation ended without a usable candidate set; the UI stops its progress state and keeps any existing chapters. `reason` is diagnostic. |
| `litloft:chapters-updated` | Browser `CustomEvent` | `{fileId}` | An addon UI promoted a chapter set. Dispatch it with `FILE_CHAPTERS_UPDATED_EVENT` from `frontend/src/lib/addonEvents.ts`; core's chapter panel refetches on it. |

#### Drive policy shape

```json
{
    "default": true,
    "features": { "rag": false, "auto_tags": true }
}
```

- A feature's value is `features[name]` when present, otherwise `default`.
- No entry for the addon in `drives.json` → `{"default": true, "features": {}}`.
- Boolean shorthand (`"intelligence": false`) → `{"default": false, "features": {}}`.
- Unknown drive → 404.

The core reads `drives.json` once per process, so a cache of about 30 seconds
that fails open is safe.

---

## Addon Scope

Every addon declares `scope` in `ADDON_META` or `manifest.json`. It says
whether the addon works inside a drive. The operator cannot change it.

| Scope | Meaning | Page URL | Sidebar row |
|-------|---------|----------|-------------|
| `drive` | Only meaningful within a drive | `/drive/{drive}/addons/{name}` | Only when a drive is selected |
| `global` | Drive-independent | `/addons/{name}` | Always |
| `both` | Works in either context | Both | Drive URL when a drive is selected, global URL otherwise |

### Choosing a Scope

- `drive`: the addon's data belongs to one drive, such as an importer that
  writes into a drive or an index of a drive's files.
- `global`: the addon has no drive concept, such as an admin-only backup
  dashboard.
- `both`: the addon offers a drive view and a drive-independent view.

Drives are a security boundary; do not build a cross-drive feature
(`.claude/rules/design-decisions.md` → *Drives*).

### Validation

An addon without a valid `scope` is logged and left out of the registry: it
is not in `/api/addons/status` and no UI shows it. An in-process addon's
router is still mounted.

### Drive Context Header (`X-Lit-Drive`)

The addon frontend sends `X-Lit-Drive: encodeURIComponent(drive)` on calls
to `/api/addons/{name}/...` made from a drive. For an external service, the
proxy validates it (see [Proxy Route Configuration](#proxy-route-configuration))
and forwards it, so the service reads the header without re-checking access;
`addons/intelligence/app/drive_context.py` is a reference reader. An
in-process addon validates it itself (see [In-Process Addon](#in-process-addon)).

### Viewer Identity Header (`X-Lit-Viewer-Id`)

For features that depend on who is asking, the proxy sends `X-Lit-Viewer-Id`
to the upstream service:

1. It removes any `X-Lit-Viewer-Id` and `X-Lit-Viewer` the client sent.
2. It takes the nickname from the `lit_viewer` cookie or the `X-Lit-Viewer`
   header, trims it, and sends the first 16 hex characters of its SHA-256.
   An empty nickname, or one longer than 50 characters, sends no header.

The nickname itself never reaches the addon. When no header arrives, there is
no profile; do not substitute a value.

### Per-Drive Policy

Operators turn addon features off per drive in `drives.json` (written by
**Settings**):

```json
{
    "name": "Family",
    "path": "/app/drives/family",
    "addons": {
        "intelligence": { "rag": false, "auto_tags": false },
        "media_import": false
    }
}
```

A missing addon or feature is enabled. `false` for the whole addon turns
every feature off. By convention the `index` feature stands for the addon as
a whole: when it is off, `/api/addons/status?drive=` drops the addon and its
slot entries for that drive.

Enforce the policy in two places:

1. **Proxy**: gate routes with an `addon_feature` pre-check or route field
   (404 when off). For an in-process addon, check
   `config.is_addon_feature_enabled()` in the route.
2. **Worker**: ask `GET /api/internal/drive-policy` and do nothing when the
   feature is off. At startup, purge the data you hold for drives whose
   `index` is off; if the policy lookup fails, skip the purge.

A policy change takes effect after a restart.

---

## UI Slot System

Addons render components into named **slots** in the core UI. A slot with no
entries renders nothing.

### Available Slots

Every file-page slot (`file-detail-sections`, `file-detail-actions`,
`file-actions-menu`, `file-relations`, `player-side`, `file-preview-actions`)
receives `{ fileId, drive, filename, fileType, mimeType, videoRef,
mediaController, subtitles, documentCaptureController, trustTier,
trustReviewedAt, onFileChange }` plus what its row lists.

| Slot ID | Location | Props / contract |
|---------|----------|------------------|
| `search-modes` | Search results page (`/drive/{drive}/search`). Not the header search modal | `{ query, drive, filter, onSelect }`. Draws a results-page mode such as semantic search |
| `search-result-actions` | Next to a match excerpt in search results | `{ capture }` |
| `file-detail-sections` | File detail inspector, **Info** tab | File props. The entries with id `detailed-summary` and `knowledge-edit` are placed outside the tab by the core (the canvas or the sheet). Not for a transcript (`player-side`) or derived relations (`file-relations`); an entry in two slots renders twice |
| `file-relations` | Inspector **Related** tab, after the core's own relation lists | File props. See [below](#contributing-to-the-related-tab) |
| `player-side` | Beside a media player as an inspector tab, or in a box under the description, as the viewer chooses | File props plus `fillHeight`, `labelledByHost`, `onAvailability`. See [Occupying the player-side slot](#occupying-the-player-side-slot) |
| `file-preview-actions` | Under the media player, right-aligned | File props. Inline buttons |
| `loft-metadata` | Beside the player, `.loft` (external URL) files only | `{ fileId, drive }` |
| `file-detail-actions` | The file page's action row, before the `[...]` menu | File props. See [Contributing to the file action row](#contributing-to-the-file-action-row) |
| `file-actions-menu` | The file page's `[...]` menu | File props plus `onRequestClose`, `onDialogOpenChange`. See [Contributing to the file actions menu](#contributing-to-the-file-actions-menu) |
| `folder-actions-menu` | The folder toolbar's **Add** menu, below the core rows | See [Contributing to the add menu](#contributing-to-the-add-menu) |
| `folder-bulk-actions-menu` | The folder toolbar's `…` menu, below the core rows. Only on a folder or the drive root | See [Contributing to the folder `…` menu](#contributing-to-the-folder--menu) |
| `document-viewer-actions` | Top bar of the full-screen PDF viewer | File props plus `documentCaptureController` and `tone: "on-dark"`. The bar is black: draw a transparent control with a white glyph. The controller publishes the page in view or the selected text, never an anchor |
| `header-actions` | App header | `{ drive }` |
| `active-summary-view` | File detail, with the summaries | `{ fileId, drive, summaryNote }`. Drawn only when `GET /api/addons/knowledge/file_active_summary/{id}/note` reports an active summary; without an entry the core draws the note itself |
| `drive-home-sections` | Drive home, between **Continue Watching** and **Recently Viewed** | `{ drive }` |
| `sidebar-sections` | Sidebar, end of the library section | No props |
| `dashboard-widgets` | Admin dashboard (`/admin`) | No props. Cards |
| `dashboard-alerts` | Admin dashboard, above the drive cards | No props. For something an operator must see first. Render nothing when nothing is wrong: the host draws no wrapper |
| `admin-settings-sections` | **Settings** → **System** tab, after the core sections | No props |
| `admin-intelligence-sections` | **Settings** → **Intelligence** tab. The tab exists only while this slot has entries | No props |

### Naming a slot entry in the reader's language

A manifest is not a translation catalogue, so a `label` written there shows
in English. Add `i18n_key`:

```json
{ "id": "transcript", "label": "Transcript", "priority": 10,
  "i18n_key": "intelligence.slots.transcript" }
```

The key is resolved against the merged catalogue and belongs in your addon's
`frontend/messages/{ja,en}.json`, never in core's `messages-core/`
(`.claude/rules/frontend-conventions.md`). Keep `label`: it is shown when
there is no key or the key does not resolve. The backend passes the field
through, so no core change is needed.

### Occupying the `player-side` slot

One entry is one tab. Besides the file props it receives:

| Prop | Meaning |
|---|---|
| `fillHeight: boolean` | Fill the height you are given as a flex item and scroll inside yourself. Do not use `h-full`: the budget is a `max-height`, and a percentage height against it resolves to `auto`, so the list lays out at full length and is clipped. In the one-column inspector (phone) there is no budget; the sheet scrolls (see below). |
| `labelledByHost: boolean` | The tab button already shows your name; drop your own title when `true`. |
| `onAvailability: (available: boolean) => void` | Report whether you have anything for this file. |

Treat `labelledByHost` and `onAvailability` as optional: some placements do
not pass them.

**Scrolling and pinning.** In the one-column inspector your list grows to
full length and the host scrolls it; a `scrollTo` on your list does nothing.
The host marks that scroller with `data-inspector-scroller` and sets
`--inspector-sticky-top` on the inspector root to the height of its pinned
tab strip.

- Find the scroller with `element.closest("[data-inspector-scroller]")`.
  When there is one, scroll it, treat its top `--inspector-sticky-top`
  pixels (read with `getComputedStyle` on your element) as covered, and
  listen for `wheel` / `touchmove` on it. It is shared with the other tabs,
  so ignore those events while your panel is inside a `[hidden]` ancestor.
- When there is none, scroll only your own list. Do not scroll an ancestor
  that overflows: on the file page it can be the canvas holding the video.
- Pin your own headers with `position: sticky; top: var(--inspector-sticky-top, 0px)`
  and a `z-index` below `10`, so they sit under the tab strip.

**`onAvailability`** keeps a tab off files it has nothing for.

- Call it with `false` when you mount, before your fetch settles, and with
  `true` when you find something. Never calling it means available.
- Answering `false` does not unmount you: the tab loses its button and the
  panel is hidden, so you can answer `true` later.
- The answer is per file. The core forgets it when the file changes but
  cannot tell which file an in-flight request was for; drop stale responses
  yourself.
- If every entry answers `false` and the file has no chapters, the core also
  hides the beside/below toggle.

### Contributing to the Related tab

- **Move, do not copy**: an entry left in `file-detail-sections` as well
  renders in both places.
- The **Related** tab is listed whenever any addon has a `file-relations`
  entry, whether or not your entry has anything for this file. A section that
  is only ever a placeholder does not belong here; a collapsed control that
  computes when opened does. Render nothing for a file your entry does not
  apply to.
- Draw a label styled like the core's section labels
  (`text-xs font-medium text-text-muted`, no card, no glyph; see
  `DESIGN.md` → *The Related tab*). The core pads the slot.

### Contributing to the file action row

`file-detail-actions` sits in the row with the like, favourite and trust
controls, before the `[...]` menu. The row wraps, and it is also drawn in the
narrow Markdown inspector and on a phone. An entry must:

- **Bring its own trigger.** The host draws no wrapper, label or separator.
- **Take no fixed width or height.**
- **Keep a 44px tap target on a coarse pointer, on the control itself.** The
  host grows only the row's direct children on a coarse pointer, so a trigger
  wrapped in your own element (for a popover, say) stays small. Give the
  control its own `pointer-coarse:h-11 pointer-coarse:w-11` and, if it has no
  `display`, `inline-flex items-center justify-center`.
- **Render nothing when it has nothing for this file.**

### Contributing to the file actions menu

`file-actions-menu` is hosted by a transient popup. Besides the file props an
entry receives two callbacks. `onRequestClose` and `onDialogOpenChange` are
reserved: the host sets them after the file props, so an entry cannot
override them.

| Prop | Type | Meaning |
|---|---|---|
| `onDialogOpenChange` | `(open: boolean) => void` | Tell the host a dialog of yours is open. While it is, the menu does not close on an outside click or Escape. |
| `onRequestClose` | `() => void` | Ask the host to close the menu. |

**Do not close the menu when you open a dialog**: closing it unmounts your
entry and the dialog with it.

1. On click: open your dialog and call `onDialogOpenChange(true)`.
2. On dismiss: call `onDialogOpenChange(false)`, then `onRequestClose()`.

The host clears the flag whenever the menu closes, so a missed step 2 does
not leave the menu stuck.

- **Render `ActionMenuItem` rows directly** (a fragment for several), from
  `@/components/ActionMenuItem`: `{ icon, label, onClick, disabled?, danger?, active? }`.
  Wrapping them in your own element breaks the `menu` → `menuitem`
  relationship.
- **Portal dialogs out of the menu at `z-50`** (the modal tier in
  `DESIGN.md` → *Layering*), into `useDialogPortalTarget()`, not
  `document.body`:

  ```tsx
  import { useDialogPortalTarget } from "@/components/DialogPortal";

  const host = useDialogPortalTarget();
  if (!open || !host) return null;
  return createPortal(<YourDialog />, host);
  ```

  On a phone the menu lives in a modal bottom sheet, which makes anything
  portalled beside it inert. The hook returns a node inside the sheet there,
  and `document.body` elsewhere.
- The menu is narrow and clips overflow. Keep labels short, and put larger
  content in a dialog rather than a nested popover.
- Return `null` when the entry does not apply. The host drops the separator
  when the slot is empty.

### Contributing to the add menu

`folder-actions-menu` follows the file actions menu's contract: render
`ActionMenuItem` rows directly, and the same dialog sequence applies. The host
owns the menu container, the separator and the styling.

| Prop | Type | Meaning |
|---|---|---|
| `drive` | `string` | The drive being browsed. |
| `surface` | `"home" \| "library"` | The drive's Home, or Library (the drive root or a folder). |
| `path` | `string` | Where the entry writes, drive-relative: the folder in Library, `""` at the root and always `""` on Home. |
| `fileIds` | `string[]` | The files the Library listing holds. Always `[]` on Home. |
| `onRequestClose` | `() => void` | Reserved, as in the file actions menu. |
| `onDialogOpenChange` | `(open: boolean) => void` | Reserved, as in the file actions menu. |

With no entries the host draws nothing, not even the separator.

### Contributing to the folder `…` menu

`folder-bulk-actions-menu` takes the same rows and reserved props as
[the add menu](#contributing-to-the-add-menu). The add menu puts something
into the folder; this one acts on the files already listed.

| Prop | Type | Meaning |
|---|---|---|
| `drive` | `string` | The drive being browsed. |
| `surface` | `"library"` | Always Library; Home has no `…` menu. |
| `path` | `string` | The folder, drive-relative; `""` at the root. |
| `fileIds` | `string[]` | The files the listing has loaded, which part-way down a long folder is not the whole folder. |
| `onRequestClose` | `() => void` | Reserved. |
| `onDialogOpenChange` | `(open: boolean) => void` | Reserved. |

The slot is shown only on a folder or the drive root, not on search results,
a tag filter or a special view. Return `null` when there is nothing to act on;
the separator goes with it.

### Declaring Slots

In `ADDON_META` or the manifest:

```json
"slots": {
    "file-detail-sections": [
        {"id": "suggested-tags", "label": "Suggested Tags", "priority": 20}
    ]
}
```

- `id`: unique within the addon; the key of the component in `slots.ts`.
- `label`: fallback display name. `i18n_key`: see above.
- `priority`: lower comes first (default 100).

### How the Frontend Renders Slots

```tsx
import { AddonSlot } from "@/components/AddonSlot";

<AddonSlot id="file-detail-sections" props={{ fileId }} layout="stack" />
```

`layout` is `"stack"` (default) or `"tabs"`. `includeIds` / `excludeIds`
narrow the entries by id. `AddonSlot` loads `slots.ts` from
`frontend/src/addons/{addonName}/` and renders the component registered
under each entry's `id`. A new slot needs a row in
[Available Slots](#available-slots).

### Frontend Slot Components

```typescript
// addons/{name}/frontend/slots.ts
import { lazy } from "react";

export const slotComponents = {
  "similar-files": lazy(() => import("./SimilarFilesSection")),
};
```

`slots.ts` is imported for every listed addon as soon as the catalogue loads,
so it is also the place for registrations that must run early, such as a
`.loft` player.

### Registering a `.loft` player

A `.loft` file stores an external URL and a `provider` name. To play a
provider's URLs:

- Backend (in-process): `register_provider(name, pattern)` from
  `app.services.provider_registry` maps URLs to the name. Unknown URLs get
  `generic`.
- Frontend: `registerLoftPlayer(name, Component)` from
  `@/components/loft/playerRegistry`, imported from `slots.ts`. The component
  receives `LoftEmbedProps` (`frontend/src/components/loft/types.ts`). The
  name `generic` is reserved; it renders a link card.

`addons/media_import` registers YouTube and Vimeo this way.

### Opening Quick Note

An addon that offers "write a note" can open the core Quick Note panel, the
same one the header button and `N` open.

```typescript
import { useQuickNote } from "@/components/quick-note";

const quickNote = useQuickNote();
quickNote.open({ drive, folder });
```

| Option | Type | Meaning |
|---|---|---|
| `drive` | `string` (optional) | Drive to preselect, if the viewer can reach it; otherwise the panel chooses as usual. |
| `folder` | `string` (optional) | Drive-relative folder to preselect with that drive; `""` is the root. Ignored without a usable `drive`; replaced by the drive's remembered Quick Note folder when missing or invalid. |

- Opening creates nothing. A file exists only after **Save** or
  **Save and open**.
- The preselection applies to that opening only.
- `open` does nothing while the panel is open, or outside the app shell.
- **Save and open** opens the new file with `edit=1`, which starts an editor
  where one is installed.

### Scoping the search modal

The header search modal (`Cmd/Ctrl+K`) can be opened narrowed to one kind of
file. The label, the kind and the see-all destination come from you.

```typescript
import {
  useGlobalSearch,
  useSearchScope,
  type SearchScope,
} from "@/components/search/GlobalSearchProvider";

const scope: SearchScope = {
  label: t("notes"),
  type: "text",
  seeAllHref: (query) => `/drive/${encodeURIComponent(drive)}/my-list?q=${encodeURIComponent(query)}`,
};

useSearchScope(isRelevant ? scope : null); // the modal is scoped while this is mounted
useGlobalSearch().open();                    // open it now, in that scope
```

| Field | Type | Meaning |
|---|---|---|
| `label` | `string` | Shown in the chip before the query and in the see-all link; pass it translated. |
| `type` | `FileKind` | The kind the name search is narrowed to (the listing's `type` values). |
| `seeAllHref` | `(query: string) => string` (optional) | Where the see-all link and `Enter` with no highlighted row go. The query is trimmed and not encoded. Without it, both go to the core search page. |

- `useSearchScope(scope)` applies while the calling component is mounted, to
  `Cmd/Ctrl+K`, the header button, `open()` and an already open modal. If the
  component unmounts while the modal is open, the scope is removed and the
  query runs unscoped. `null` registers nothing. With two registrations, the
  later one wins until it unmounts. Keep the object stable (`useMemo`); a new
  object replaces the registered one.
- `open()` does nothing while the modal is open, or outside the app shell.
- A scoped search runs the name search with `type` and no semantic search,
  and lists recently opened files of that kind only. The viewer can remove the
  scope (`×`, or `Backspace` in an empty field).
- Results stay in the current drive.

---

## Core API Surface for In-Process Addons

In-process addons share the Python process and import core modules.

### Allowed Imports

| Module | What to use | Purpose |
|--------|-------------|---------|
| `app.config` | `DATA_DIR`, `load_drives()`, `get_drive_names()`, `get_drive_path()`, `is_addon_feature_enabled()` | Drive configuration and policy |
| `app.database` | `get_db`, `SessionLocal`, `Base` | DB sessions |
| `app.models` | `File`, `Tag`, `active_file_filter()`, … | Read-only queries |
| `app.auth` | `get_unlocked_groups`, `check_drive_access`, `filter_drives`, `require_admin`, `get_viewer_id` | Access control |
| `app.services.scanner` | `register_single_file()` | Register a new file |
| `app.services.chapters` | `normalise_chapters()`, `replace_chapters()` | Write a file's chapters |
| `app.services.provider_registry` | `register_provider()` | `.loft` providers |
| `app.services.ws` | `manager.broadcast()`, `broadcast_from_thread()` | Browser notifications |
| `app.services.event_hooks` | `emit()`, `emit_from_thread()` | Lifecycle events |
| `app.nanoid` | `generate_nanoid()` | IDs |

Always `import app.config as config`, never `from app.config import X`
(`.claude/rules/backend-conventions.md`).

### Rules

| Rule | Reason |
|------|--------|
| Prefix addon tables with the addon name (`myaddon_items`) | Avoid collisions |
| Do not INSERT/UPDATE/DELETE core tables directly; call core service functions | Keep core invariants |
| Reading core tables is fine | Query `File`, `Tag`, … |
| Do not change core model schemas | Core migrations must keep working |
| Create addon tables in `on_startup()` with `checkfirst=True` | Idempotent startup |

### Example: Custom Table

```python
# service.py
from sqlalchemy import Column, Integer, String
from app.database import Base

class MyAddonItem(Base):
    __tablename__ = "myaddon_items"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)

def init_table():
    from app.database import engine
    MyAddonItem.__table__.create(bind=engine, checkfirst=True)
```

```python
# router.py
async def on_startup() -> None:
    init_table()
```

### WebSocket Event Naming

Name addon events `{addon_name}.{domain}.{verb}`, for example
`intelligence.detailed_summary.updated` with `{file_id, edited_at}`.

- Prefix with the addon name.
- Name the domain (`detailed_summary`, `transcript`), not a route.
- Use a past-tense verb (`updated`, `ready`, `failed`), not an HTTP method.
- Keep payloads small (`{file_id}`); the frontend refetches for details.

An in-process addon emits core-owned names (`files.*`) through
`event_hooks.emit()`, not `manager.broadcast()`; see
[reference/websocket-events.md](reference/websocket-events.md).

### Per-Drive Policy Gating for State-Mutating Routes

Gate a route that changes addon state (generate, edit, revert) on its
feature, so turning the feature off stops writes with 404 before they reach
the addon. On a file route, keep the file check and add the feature as the
route field:

```json
{"path": "/files/{file_id}/chapter-suggestions/generate", "methods": ["POST"],
 "pre_check": {"type": "file_access", "param": "file_id"},
 "addon_feature": "chapter_suggestions"}
```

An `addon_feature` pre-check alone would replace the file check. Read-only
routes can use `file_access` alone, so data already stored stays visible
after the feature is turned off; the startup purge removes it eventually.

---

## Quick Start

### In-Process Addon

```bash
# 1. Create the addon repository
mkdir -p addons/my-addon/backend addons/my-addon/frontend
touch addons/my-addon/backend/__init__.py

# 2. Write backend/router.py with `router` and ADDON_META
# 3. Write frontend components and frontend/slots.ts

# 4. Link it into the source tree for local development
./setup-addons.sh

# 5. Build and run
docker compose up -d --build
```

### External Service Addon

```bash
# 1. Create the addon repository
mkdir -p addons/my-service && cd addons/my-service
git init

# 2. Write the service (Dockerfile + app code)
# 3. Write manifest.json (scope, proxy routes, slots, event_hooks)
# 4. Commit in the addon repository

# 5. Add the container and its target_env variable to
#    docker-compose.override.yml (see "Docker Compose")
# 6. Optional: frontend components in addons/my-service/frontend/
# 7. With event_hooks, re-run configure.py so event-hooks.json is regenerated

# 8. Build and run, from the Litloft root
docker compose up -d --build
```

Nothing in the main repository changes except the submodule pointer when the
addon is added as a submodule.

### Verifying Clean Absence

Before shipping, check that removing the addon leaves nothing behind:

```bash
mv addons/my-service /tmp/
docker compose up -d --build
curl http://localhost:3000/api/addons/status | jq .   # the addon must not appear
# Load the UI: no sidebar row, no empty slots
mv /tmp/my-service addons/
docker compose up -d --build
```

If anything still refers to the addon, core code knows about it; move that
code into the addon.

---

## Existing Addons

| Addon | Type | Scope | Page | Guide |
|-------|------|-------|------|-------|
| `cloud-sync` | In-process | `global` | none (dashboard widget; admin only) | [addons/cloud-sync.md](addons/cloud-sync.md) |
| `media_import` | In-process | `drive` | yes | [addons/media-import.md](addons/media-import.md) |
| `intelligence` | External service (port 8100) | `drive` | yes | [addons/intelligence.md](addons/intelligence.md) |
| `knowledge` | External service (port 8200) | `drive` | yes | [addons/knowledge.md](addons/knowledge.md) |

Installation, configuration and memory requirements are in each addon's
guide.

### UI Slots Provided

Slot entries each addon declares, for reference when designing your own.

| Addon | Slot | Entry IDs |
|-------|------|-----------|
| `intelligence` | `search-modes` | `find-mode` |
| `intelligence` | `file-detail-sections` | `unverified-source`, `suggested-tags`, `suggested-chapters`, `summary`, `detailed-summary`, `visual-description`, `visual-index`, `clip-frames` |
| `intelligence` | `file-relations` | `similar-files` |
| `intelligence` | `player-side` | `transcript` |
| `intelligence` | `file-detail-actions` | `file-ai-actions` |
| `intelligence` | `file-actions-menu` | `index-details` |
| `intelligence` | `folder-bulk-actions-menu` | `folder-ai-actions` |
| `intelligence` | `drive-home-sections` | `pickup` |
| `intelligence` | `dashboard-widgets` | `index-status` |
| `intelligence` | `dashboard-alerts` | `failed-jobs` |
| `intelligence` | `admin-intelligence-sections` | `admin-features`, `admin-llm`, `admin-embedding`, `admin-transcription`, `admin-rag` |
| `knowledge` | `file-detail-sections` | `knowledge-edit` |
| `knowledge` | `file-relations` | `knowledge-connections-link` |
| `knowledge` | `file-detail-actions` | `knowledge-media-capture`, `knowledge-note-search-scope` |
| `knowledge` | `file-actions-menu` | `knowledge-create-note`, `knowledge-version-history` |
| `knowledge` | `folder-actions-menu` | `knowledge-new-note`, `knowledge-clip-web-page` |
| `knowledge` | `document-viewer-actions` | `knowledge-media-capture` |
| `knowledge` | `header-actions` | `knowledge-capture-basket`, `knowledge-clip-notifier` |
| `knowledge` | `search-result-actions` | `knowledge-search-capture` |
| `knowledge` | `active-summary-view` | `knowledge-active-summary` |
| `media_import` | `loft-metadata` | `loft-metadata` |
| `media_import` | `folder-actions-menu` | `media-import-url` |
| `cloud-sync` | `dashboard-widgets` | `cloud-sync` |
