# Addon Development Guide

This guide covers how to build addons for Litloft using the addon architecture v2 (slot-based, declarative proxy).

## Addon Types

| Type | How it runs | Use case | Example |
|------|-------------|----------|---------|
| **In-process** | Inside the backend Python process | Lightweight features | downloader, podcast, cloud-sync |
| **External service** | Separate Docker container | Heavy workloads, ML models | intelligence |

---

## Clean Separation Principle

Litloft's addon system is designed around one core rule: **the main Litloft repo must contain zero knowledge of any specific addon.**

### What this means

- **Each addon lives in its own independent Git repo** at `addons/{name}/` (gitignored by the main repo).
- **No addon-specific files are checked into the main repo.** Not code, not manifests, not configuration. An OSS clone of Litloft with no addons installed has no mention of `intelligence`, `downloader`, `cloud-sync`, or any other addon.
- **Addons declare themselves at load time** — via `ADDON_META` in their own `router.py` (in-process) or `manifest.json` in their own repo directory (external service).
- **Absence is the default.** If an addon is not present in `addons/`, the main backend has no notion of it. No phantom sidebar entries, no empty UI slots, no broken proxy routes, no 502s when someone clicks a link.

### Why

1. **OSS distribution** — Litloft is designed for OSS release. A user cloning the repo and running `docker compose up` should get a clean, working core experience without any unused addon plumbing cluttering the UI.
2. **Symmetry** — In-process and external service addons use the same self-declaration pattern. Adding a new addon never requires a PR to the main repo.
3. **Failure isolation** — An addon that fails to load, or a container that fails to start, does not break the core. The core simply doesn't know about that addon.

### Practical consequences for addon authors

- **Never commit addon-specific files to the main repo.** The `backend/addon-manifests/` directory that used to hold external service manifests no longer exists; manifests live in each addon's own repo.
- **When you rename or modify an addon, commit the changes to the addon's own repo, not the main one.**
- **Test addon absence.** Before shipping, verify that removing `addons/{name}/` and rebuilding leaves no trace of your addon in the core UI.
- **The host never imports addon code or names addons in core paths.** Generic dynamic loaders pick up addon subpages: any non-`Page.tsx` route under an addon's frontend directory is reachable at `/addons/{name}/{slug}` (global) or `/drive/{drive}/addons/{addon}/{slug}` (drive-scoped). Status data is fetched on-demand through a generic `useAddonStatus(addonName)` hook with a per-(addon, drive) cache — the host has no compile-time list of addon names.

---

## How Addons Are Loaded

Understanding the full loading flow is essential before building an addon.

### File Layout

```
project root/
  addons/                          # Addon source code (independent Git repos, gitignored)
    my-addon/
      backend/                     # Python code (in-process addons)
        __init__.py
        router.py
      frontend/                    # React components
        MyAddonPage.tsx
      manifest.json                # External service addons only (declared proxy + slots)

  backend/
    addons/                        # Symlinks for local dev (gitignored)
      my-addon -> ../../addons/my-addon/backend

  frontend/
    src/
      addons/                      # Symlinks for local dev (gitignored)
        my-addon -> ../../../addons/my-addon/frontend
      app/
        addons/{name}/page.tsx     # Auto-generated at Docker build (gitignored)
```

**Nothing addon-specific is checked into the main Litloft repo.** Each addon lives in its own git repo under `addons/{name}/`. If you don't clone an addon, the main repo has zero trace of it.

### Docker Build: How Files Get Into Containers

Addons live in `addons/` at the project root. The Dockerfiles copy them into the containers at build time. **Symlinks are not used inside Docker.**

**Backend Dockerfile** (simplified):

```dockerfile
COPY backend/app/ ./app/                    # Core app code
COPY backend/addon[s]/ ./addons/            # Local addons dir (may contain symlinks)
COPY addon[s]/ /tmp/_all_addons/            # Top-level addons dir

# Resolve symlinks: delete them, then copy each addon's backend code and manifest
RUN find addons -maxdepth 1 -type l -delete; \
    for addon_dir in /tmp/_all_addons/*/; do \
      name="$(basename "$addon_dir")"; \
      if [ -d "$addon_dir/backend" ] && [ ! -d "addons/$name" ]; then \
        cp -r "$addon_dir/backend" "addons/$name"; \
      fi; \
      if [ -f "$addon_dir/manifest.json" ]; then \
        mkdir -p "addons/$name"; \
        cp "$addon_dir/manifest.json" "addons/$name/manifest.json"; \
      fi; \
    done

# Auto-install addon Python dependencies
RUN for req in addons/*/requirements.txt; do \
      [ -f "$req" ] && pip install --no-cache-dir -r "$req"; \
    done

# Run addon install scripts (system-level dependencies like rclone)
RUN for addon_dir in addons/*/; do \
      [ -f "$addon_dir/install.sh" ] && sh "$addon_dir/install.sh"; \
    done
```

**Frontend Dockerfile** (simplified):

```dockerfile
COPY frontend/ .
COPY addon[s]/ /tmp/_all_addons/

# Same pattern: resolve symlinks, copy frontend code
RUN find src/addons -maxdepth 1 -type l -delete; \
    for addon_dir in /tmp/_all_addons/*/; do \
      [ -d "$addon_dir/frontend" ] || continue; \
      name="$(basename "$addon_dir")"; \
      cp -r "$addon_dir/frontend/"* "src/addons/$name/"; \
    done

RUN pnpm build
```

**Key points:**
- Place your addon in `addons/{name}/`. That's it.
- The Dockerfiles handle the rest. You don't need to manually copy anything.
- Symlinks in `backend/addons/` and `frontend/src/addons/` are only for local development convenience (IDE auto-completion, local test runs, etc).
- External service addons declare themselves via `addons/{name}/manifest.json` — the manifest lives in the addon's own repo, not in the main Litloft repo.
- Page wrappers (`src/app/addons/{name}/page.tsx`) are auto-generated at Docker build time. You never write these manually.

### Backend Discovery at Startup

When the backend starts (`main.py`):

```
1. _load_addons(app)
   └─ pkgutil.iter_modules("backend/addons/")
       └─ For each package, import addons.{name}.router
           ├─ Include router on the FastAPI app
           ├─ Read ADDON_META dict → register in addon_registry
           └─ Collect on_startup() functions

2. addon_registry.load_external_manifests()
   └─ Scan addons/*/manifest.json
       └─ Register each manifest in addon_registry

3. GET /api/addons/status
   └─ Returns merged data from both sources:
       ├─ addons: { name → metadata } (in-process + external)
       └─ slots: { slot-id → [entries sorted by priority] }
```

#### Manifest Discovery Details

`addon_registry.load_external_manifests()` looks for `manifest.json` files by globbing two candidate directories (whichever exist):

| Candidate | Purpose |
|-----------|---------|
| `/app/addons/*/manifest.json` | Docker runtime — Dockerfile copies each addon's `manifest.json` alongside its code into `/app/addons/{name}/` |
| `<repo>/addons/*/manifest.json` | Local dev — each addon is checked out at the repo root, so its manifest is found in place |

The **addon name is derived from the parent directory name** (e.g., `addons/intelligence/manifest.json` → addon name `intelligence`). Manifests are deduped by addon name, so if the same addon appears in both candidate directories, the first one wins (Docker path takes precedence).

If neither candidate directory contains any `manifest.json` files, the registry logs `"No addon manifests found"` and proceeds with an empty external-addon set. **This is the normal case for a stock Litloft install with no external addons** — no error, no warning, just silence.

### Frontend Discovery at Runtime

```
1. App renders AddonSlotsProvider (in layout.tsx)
   └─ Fetches GET /api/addons/status on mount
       ├─ Stores addons + slots in React context
       └─ Components use useAddonSlots() hook

2. Sidebar reads addons with href → renders addon page links
3. Components check hasSlot("slot-id") → conditionally render addon UI
4. Addon components are lazy-imported from frontend/src/addons/{name}/
```

---

## In-Process Addon

### Minimum Required Files

```
addons/{name}/
  backend/
    __init__.py       # Can be empty
    router.py         # Must export: router (APIRouter)
                      # Optional: ADDON_META (dict), on_startup (async function)
```

### router.py

```python
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import app.config as config
from app.database import get_db

logger = logging.getLogger(__name__)

# --- Required: FastAPI router ---
router = APIRouter(prefix="/api/addons/{name}", tags=["{name}"])

# --- Optional: Metadata for sidebar + slots ---
ADDON_META = {
    "label": "My Addon",
    "icon": "package",          # Lucide icon name
    "scope": "global",          # Required: "drive" | "global" | "both" (see Scope section)
    "href": "/addons/my-addon",  # Must match /addons/{name}. Omit if no page

    # UI slot declarations (optional)
    "slots": {
        "file-detail-sections": [
            {
                "id": "my-section",
                "label": "My Section",
                "priority": 30,
            }
        ]
    },
}

# --- Optional: Called during app startup ---
async def on_startup() -> None:
    logger.info("My addon initialized")

# --- Your endpoints ---
@router.get("/items")
async def list_items(db: Session = Depends(get_db)):
    ...
```

### Frontend Files (Optional)

If your addon has a dedicated page:

```
addons/{name}/
  frontend/
    Page.tsx          # Required entry point (must use this exact name)
    MyAddonPage.tsx   # Actual page component
    api.ts            # API client functions
```

`Page.tsx` is the entry point that the auto-generated page wrapper imports. It can be a simple re-export:

```tsx
// addons/{name}/frontend/Page.tsx
export { default } from "./MyAddonPage";
```

The core ships generic dispatcher routes that lazily import each addon's `Page.tsx`:

- `src/app/addons/[name]/page.tsx` — handles addons with `scope: "global"` or `scope: "both"`
- `src/app/drive/[name]/addons/[addon]/page.tsx` — handles addons with `scope: "drive"` or `scope: "both"`

No per-addon page wrapper generation is needed. Accessing the addon via the URL that doesn't match its declared scope returns 404.

See the **Addon Scope** section below for how `scope` maps to URLs.

### Optional Files

| File | Purpose |
|------|---------|
| `backend/requirements.txt` | Python dependencies (auto-installed at Docker build) |
| `backend/install.sh` | System dependencies, e.g., `apt-get install rclone` |
| `backend/schemas.py` | Pydantic request/response models |
| `backend/service.py` | Business logic separated from routes |
| `frontend/slots.ts` | Slot component exports for lazy loading |

---

## External Service Addon

External service addons run in separate Docker containers. The core app proxies their APIs through the **Generic Addon Proxy**.

### What Goes Where

| File | Location | Git-tracked? | Purpose |
|------|----------|-------------|---------|
| Service code | `addons/{name}/` | No (in addon's own repo) | The service itself |
| Manifest | `addons/{name}/manifest.json` | No (in addon's own repo) | Proxy routes, slots, access control |
| Frontend UI | `addons/{name}/frontend/` | No (in addon's own repo) | UI components |
| Docker config | `docker-compose.override.yml` | No | Container configuration |
| Event hooks | `addons/{name}/manifest.json` → `event_hooks` field | No (addon repo) | Webhook subscriptions — declared in manifest, auto-generated into `event-hooks.json` by `configure.py` |
| Page wrapper | `frontend/src/app/addons/[name]/page.tsx` and `.../drive/[name]/addons/[addon]/page.tsx` | Core-provided dispatcher | Generic routes that lazy-import each addon's `Page.tsx` |

The manifest file is the key difference from in-process addons. Since external services have no Python code in the backend process, the manifest tells the core app how to proxy requests and what UI slots to register. The manifest lives in the addon's own repo, so the main Litloft repo has no knowledge of any specific addon.

### Manifest File

The manifest lives in **the addon's own Git repo**, at the top of the addon directory:

```
addons/my-service/        # ← addon's own repo root
  manifest.json           # ← committed to the addon repo, NOT the main Litloft repo
  Dockerfile
  app/
    ...
```

`addons/{name}/manifest.json`:

```json
{
    "label": "My Service",
    "icon": "brain",
    "type": "external_service",
    "scope": "drive",

    "slots": {
        "search-modes": [
            {"id": "my-search", "label": "My Search", "priority": 10}
        ]
    },

    "policy_features": [
        {
            "name": "my_feature",
            "default": true,
            "i18n_key": "myAddon.policyFeatures.myFeature"
        }
    ],

    "event_hooks": [
        {"event": "scan.complete", "url": "http://my-service:8100/webhook/scan-complete", "addon": "my-service", "feature": "index"},
        {"event": "files.deleted", "url": "http://my-service:8100/webhook/files-deleted",  "addon": "my-service", "feature": "index"}
    ],

    "proxy": {
        "target_env": "MY_SERVICE_URL",
        "target_default": "http://my-service:8100",
        "health_check": "/health",
        "routes": [...]
    }
}
```

#### Top-level Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `label` | Yes | Human-readable name shown in the sidebar |
| `icon` | Yes | Lucide icon name |
| `type` | Yes | Always `"external_service"` for independent containers |
| `scope` | Yes | `"drive"` \| `"global"` \| `"both"` (see [Addon Scope](#addon-scope)) |
| `href` | No | URL pattern for the addon page. Omit if the addon has no dedicated page |
| `slots` | No | UI slot declarations (see [UI Slot System](#ui-slot-system)) |
| `policy_features` | No | Per-drive feature flags exposed in the admin settings GUI |
| `event_hooks` | No | Lifecycle webhook subscriptions (see [Event Hooks](#event-hooks)) |
| `proxy` | Yes | Reverse proxy configuration |

#### `policy_features`

Declare features that operators can toggle per drive in the admin GUI. Each entry:

```json
{
    "name": "transcription_cloud",
    "default": true,
    "i18n_key": "intelligence.policyFeatures.transcriptionCloud"
}
```

| Field | Description |
|-------|-------------|
| `name` | Feature key used in `drives.json.addons.{addon}.{name}` |
| `default` | Value to use when not specified in `drives.json` |
| `i18n_key` | Translation key for the toggle label in the admin GUI |

The proxy exposes routes at `/api/addons/{name}/{path}`. For example, a route with `"path": "/search"` becomes `GET /api/addons/my-service/search`.

**Why the manifest lives in the addon's repo**: the main Litloft backend discovers the manifest dynamically at startup via `addons/*/manifest.json`. No file in the main repo ever needs to know that your addon exists. When you evolve the manifest (new routes, new slots, new filters), commit those changes to the addon repo — the main repo stays untouched. See [Clean Separation Principle](#clean-separation-principle) for the rationale.

### Proxy Route Configuration

Each route in the `routes` array:

```json
{
    "path": "/search",
    "methods": ["GET"],
    "response_filter": { ... },
    "pre_check": { ... },
    "stream": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | URL pattern. `{param}` for path parameters |
| `methods` | string[] | `["GET"]`, `["POST"]`, etc. |
| `response_filter` | object/null | Drive access filtering (see below) |
| `pre_check` | object/null | Pre-request validation (see below) |
| `stream` | boolean | Binary passthrough (images, files) |

### Response Filters

The core applies access control **after** proxying the response. Your service returns all results; the proxy removes unauthorized items.

**`drive_access`** — Filter an array by the caller's accessible-drive set:

```json
{
    "type": "drive_access",
    "array_path": "results",
    "drive_field": "drive"
}
```

Removes items from `response.results[]` where `item.drive` is not in the caller's accessible set.

**`drive_access_nested`** — Multiple nested arrays:

```json
{
    "type": "drive_access_nested",
    "paths": {
        "section_a.results": "drive",
        "section_b.results": "drive"
    }
}
```

**`current_drive_only`** — Strictly filter to the drive the caller is currently in. The proxy reads the validated `X-Lit-Drive` header and keeps only items whose `drive_field` matches. Used by `scope=drive` addons to prevent cross-drive leakage even when the user has access to multiple drives:

```json
{
    "type": "current_drive_only",
    "array_path": "results",
    "drive_field": "drive"
}
```

**`current_drive_only_nested`** — Same as above but for multiple nested arrays (e.g. `citations` + `sources` for Ask).

**`null`** — No filtering (status endpoints, etc.)

### Pre-Check Hooks

**`file_access`** — Verify file exists and user can access its drive:

```json
{
    "type": "file_access",
    "param": "file_id"
}
```

Returns 404 before the request is proxied if the file doesn't exist or the drive is inaccessible.

**`addon_feature`** — Gate a route behind a per-drive feature flag from `drives.json`:

```json
{
    "type": "addon_feature",
    "feature": "rag"
}
```

Returns 404 if the drive's `addons.{addon_name}.{feature}` is `false` (or the umbrella `addons.{addon_name}` is `false`). The check reads the same data the core returns from `GET /api/internal/drive-policy` (see [Per-Drive Policy](#per-drive-policy)). Omitting the `drives.json` entry is treated as enabled (graceful degradation).

**`admin`** — Require the caller's JWT to have every protected `access_group` declared in `drives.json` unlocked. Used for administrative endpoints like queue control and index status.

> **Note on path collisions:** the core admin gate is also enforced on `/api/admin/*` (admin dashboard) and `/api/admin/config/*` (config GUI for drives/passwords/addon-policy). **Addons must not mount their proxy routes under `/api/admin/...`** — pick a path under `/api/addons/{name}/...` instead. The admin gate on these core paths is independent of the addon proxy and would block addon traffic before it reaches your service.

### Route-Level Options

| Field | Default | Meaning |
|-------|---------|---------|
| `drive_optional` | `false` for `scope=drive` addons, `true` for `scope=global` | Skip `X-Lit-Drive` enforcement for this route (e.g. `<img>` tags that can't attach headers, or admin-context queries). Authorization must still be enforced via another pre_check |
| `require_drive` | Inferred from scope | Force `X-Lit-Drive` presence even when the route would otherwise be drive-optional |
| `stream` | `false` | Binary passthrough (images, SSE, file streams) — the proxy forwards bytes verbatim without JSON filtering |
| `addon_feature` | — | Shorthand for an `addon_feature` pre_check attached alongside a `file_access` pre_check on the same route |

### Docker Compose

`docker-compose.override.yml` (not tracked by git):

```yaml
services:
  my-service:
    build: ./addons/my-service
    expose: ["8100"]
    volumes:
      - ./data:/data:ro
      # Mask the core's token signing key. Without this an addon that is
      # compromised can mint a JWT for any drive group (or __admin__).
      - /dev/null:/data/.jwt_secret:ro
    mem_limit: 2g
    restart: unless-stopped
```

### Event Hooks

The core fires lifecycle events (scan complete, file deleted, …) to registered webhook URLs. Instead of asking users to hand-edit a JSON file, **declare the webhooks your addon needs inside `manifest.json`**. `configure.py` reads every enabled addon's manifest and writes `event-hooks.json` automatically.

#### Declaring hooks in manifest.json

Add an `event_hooks` array at the top level of your manifest:

```json
{
    "label": "My Service",
    "event_hooks": [
        {
            "event": "scan.complete",
            "url": "http://my-service:8100/webhook/scan-complete",
            "addon": "my-service",
            "feature": "index"
        },
        {
            "event": "files.deleted",
            "url": "http://my-service:8100/webhook/files-deleted",
            "addon": "my-service",
            "feature": "index"
        }
    ],
    "proxy": { ... }
}
```

Each entry:

| Field | Required | Description |
|-------|----------|-------------|
| `event` | Yes | Event name (see table below) |
| `url` | Yes | Webhook URL reachable from the backend container |
| `addon` | Recommended | Addon name — used for per-drive policy filtering |
| `feature` | Recommended | Feature key in `drives.json` addon policy; events for drives where this feature is disabled are silently dropped before dispatch |
| `secret_env` | No | Name of the env var whose value is sent as `X-Webhook-Secret` |

`configure.py` deduplicates by URL, so it is safe to have multiple addons subscribe to the same event.

#### Available events

| Event | When | Payload |
|-------|------|---------|
| `scan.complete` | Scanner finishes a drive scan | `{drive, added, missing, recovered}` |
| `files.deleted` | File moved to trash | `{file_ids, drive}` |
| `files.restored` | File restored from trash (also clears missing state) | `{file_ids, drive}` |
| `files.missing` | Scanner detects a previously-indexed file is gone from FS | `{file_ids, drive}` |
| `files.recovered` | Missing file reappears on FS | `{file_ids, drive}` |
| `files.purged` | User explicitly deletes a file permanently (or 30-day trash auto-purge) — scan-triggered purges no longer fire this event | `{file_ids, drive}` |
| `files.moved` | File path / filename changed via rename / move / folder rename / folder move (single covering event for all 6 mutation routes) | `{file_ids}` |

#### Drive-aware filtering

When `addon` + `feature` are declared, the core checks `drives.json` before each dispatch and drops payloads for drives where that feature is disabled. If the policy lookup fails the event is forwarded (fail open); your webhook handler should double-check with `GET /api/internal/drive-policy` when correctness matters.

#### How event-hooks.json is generated

`configure.py` collects `event_hooks` from every manifest of every addon the user enables, merges them (dedup by URL), and writes `event-hooks.json`. The backend mounts this file at startup. Users never need to touch the file manually.

> **For AI agents**: when adding a new event hook to an addon, add an entry to `manifest.json` → `event_hooks`. Do **not** edit `event-hooks.json` directly — it is auto-generated and gitignored. Remind the developer to re-run `configure.py` (or update the file manually if `configure.py` has already been run) to propagate the change.

### Internal API

For complex cases where declarative filters aren't sufficient, external services can call the core's Internal API on the Docker network. **Before adding a new Internal API endpoint, read the policy rules** at [`.claude/rules/internal-api-policy.md`](../.claude/rules/internal-api-policy.md) (R1-R5) — most "the core needs to expose X for my addon" requests should resolve as "addon owns X locally."

Base path for all routes: `http://backend:8000/api/internal`.

#### Read endpoints (no secret)

| Endpoint | Description |
|----------|-------------|
| `GET /accessible-drives` | Accessible drive names for the given auth token (forwards `lit_token` cookie). |
| `GET /drive-policy?drive=&addon=` | Per-drive addon policy in `{default, features}` shape. 404 for unknown drive (no enumeration). |
| `GET /files/{file_id}` | File metadata: `{id, drive, filename, file_type, folder_path, thumbnail_path, updated_at}`. `updated_at` is the core's last-touched timestamp; use it as an mtime-equivalent when reconciling cached state. |
| `POST /filter-file-ids` | Body `{file_ids: [], trust_tier?}` → `{accessible: [], trust_filtered: bool}`. Drops IDs the caller can't see. Pass `trust_tier` (`verified` \| `unverified`) to additionally narrow to that tier — grounding surfaces send `verified` so unverified sources stop acting as evidence. Omit it and behaviour is unchanged. An unknown value returns 422. **`trust_filtered` echoes whether the filter was applied**: core is versioned independently of its addons and drops unknown fields silently, so a caller that asked for a filter and does not get `trust_filtered: true` is talking to an older core and must fail closed rather than read the unfiltered list as verified. |
| `POST /files/bulk-state` | Body `{file_ids: []}` → `{statuses: [{id, drive, state}], not_found: []}`. State is `active`/`missing`/`trash`. Service-to-service (no auth). |
| `POST /files/bulk` | Body `{file_ids: []}` → `{files: [FileResponse], not_found: []}`. Returns full file metadata for active files; missing/trash appear in `not_found`. Service-to-service (no auth). Use when enriching search results to avoid N+1 single-file lookups. |
| `GET /file_relations?file_id=&drive=&kind=&limit=` | List relations where `file_id` appears on either side, **or** all relations for a `drive`. Exactly one of `file_id` or `drive` is required. `kind` filter is optional. `limit` caps results (default 5000, max 20000). |

#### Legacy secret-gated endpoints (`X-Internal-Secret` matches `CORE_INTERNAL_SECRET`)

The header is required when `CORE_INTERNAL_SECRET` is set on both sides. When unset (dev) the gate is a no-op; production deployments should always set it.

| Endpoint | Description |
|----------|-------------|
| `GET /files/{file_id}/content` | Raw text body. Mime allowlist (`text/markdown`, `text/plain`); size cap (`CORE_INTERNAL_CONTENT_MAX_BYTES`, default 10 MB). 415 on non-text or non-UTF-8. |
| `POST /files/{file_id}/tags` | Body `{tags: []}` → 204. Same validation as `PUT /api/files/{id}/tags`. Used by the knowledge scanner to project frontmatter onto core `File.tags`. |
| `POST /file_relations` | Body `{file_id_a, file_id_b, kind, viewer_id?}`. Creates a relation (same drive only). 400 self / cross-drive, 404 missing files, 409 duplicate. |
| `DELETE /file_relations/{relation_id}` | Removes a relation by id. |
| `GET /viewer-history?viewer_id=&drive=&after=&before=&kind=` | File IDs the viewer touched in the drive within `[after, before)`. `kind=viewed` (default) or `not_viewed`. Drive isolation via JOIN to `files` so cross-drive viewer history never leaks. |
| `POST /restart-pending` | Body `{source, reason?}` → 204. Touches `data/restart_pending` so the core's `RestartBanner` prompts the user to restart. Use when an addon changes user-visible config that requires a container restart to take effect. `source` is the addon name (opaque to core). |

#### Strict write endpoints

Strict writes fail closed and always require `X-Internal-Secret` to match a
non-empty `CORE_INTERNAL_SECRET`. If the environment variable is unset or
empty, core returns 503; if the header is missing or wrong, core returns 403.
The comparison is constant-time.

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

Success returns 204. The request may contain only `chapters`, and each item
may contain only `start_time`, `end_time`, and `title`; `source`, `ordering`,
and all other extra fields return 422. Core drops entries with a blank title
or an invalid/non-finite start, nulls an invalid/non-finite end, trims titles,
and assigns dense ordering after filtering. It does not impose a chapter-count
cap, title-length cap, non-negative-time rule, chronology rule, or sorting.

Approval replaces the file's complete chapter set and always writes
`source="curated"`; the caller cannot choose provenance. An empty list or a
list with no usable entries returns 422 and leaves the existing set untouched.
Unknown, missing, and trashed files return 404.

Internal API policy rationale:

| Rule | Why this endpoint passes |
|------|--------------------------|
| R1 first-class core entity | `file_chapters` is owned and rendered by core in the file-detail player companion. |
| R2 generic shape | The path and body describe only core chapter values; no addon, LLM, suggestion-status, source, or workflow name crosses the boundary. |
| R3 multi-addon viability | Intelligence promotes transcript-derived chapters. Media Import is the concrete second chapter producer and writes the identical core entity through the shared service because it currently runs in-process; the endpoint shape does not encode either producer. |
| R4 write asymmetry | Core's chapter panel reads and navigates the promoted data. The addon is not the sole consumer. |
| R5 promotion target | Untrusted candidates remain in the producing addon's database until user approval promotes them into the core-owned `file_chapters` set. |

##### Declare a file's trust tier

```http
PUT /api/internal/files/{file_id}/trust-tier
Content-Type: application/json
X-Internal-Secret: <CORE_INTERNAL_SECRET>

{"tier": "unverified"}
```

Success returns 204. `tier` must be `verified` or `unverified`; any other
value, a missing `tier`, or any extra field returns 422. Unknown, missing,
and trashed files return 404.

**A file a viewer has already ruled on returns 409** and is left untouched.
The check is a conditional update, so a viewer promoting the file
concurrently wins the race. Treat 409 as success-equivalent for a retry:
it means a person got there first, which is the outcome the design wants.

Use this at **ingest time only**, to declare what a file you are creating
is: a Web Clip lands `unverified`, a file the operator placed deliberately
lands `verified` (the column default, so most ingests need no call at all).

This endpoint deliberately does **not** touch `trust_reviewed_at`. That
stamp records a person's judgement, and an addon has judged nothing; only
the core UI writes it, through the public `PUT /api/files/{id}/trust-tier`.
Promotion and demotion are the viewer's to make, not yours.

Internal API policy rationale:

| Rule | Why this endpoint passes |
|------|--------------------------|
| R1 first-class core entity | `files.trust_tier` is a column on the core-owned `files` table, peer to the active/missing/trash lifecycle, and core's search UI filters on it. |
| R2 generic shape | Path, body, and values name no addon and no feature; `verified` / `unverified` describe the file, not a workflow. |
| R3 multi-addon viability | Knowledge lands Web Clips unverified. Media Import is the concrete second producer: anything pulled in from outside starts unverified for the same reason. |
| R4 write asymmetry | Core's search filter and file-detail control read the column, and core's own UI performs the human promotion. The addon write is an ingest-time declaration, not the decision. |
| R5 promotion target | The tier is itself a core entity; nothing addon-owned is promoted into core by this call. |

#### WS bridge

| Endpoint | Description |
|----------|-------------|
| `POST /addon-events` | Body `{event, data, drive?}` → 204. Core relays the payload to its WS broadcaster. Drive-scoped broadcasts are access-filtered (other-drive viewers don't receive). Send `X-Internal-Secret` when configured. Use this from external-service addons that can't reach the core's broadcaster directly. |

Known chapter event contracts:

| Event | Transport | Payload | Meaning |
|-------|-----------|---------|---------|
| `intelligence.chapter_suggestions.ready` | Core WS bridge | `{file_id, drive, created_at}` | A replacement candidate set is durable and the Intelligence UI should reload it. This replaces deadline-based polling for multi-call LLM work. |
| `intelligence.chapter_suggestions.failed` | Core WS bridge | `{file_id, drive, reason}` | Generation ended without a usable complete candidate set. The Intelligence UI should stop its progress state and keep any prior staged/core chapters unchanged. `reason` is diagnostic; UI copy remains generic. |
| `litloft:chapters-updated` | Browser `CustomEvent` | `{fileId}` | An addon UI has promoted a complete chapter set. Import `FILE_CHAPTERS_UPDATED_EVENT` from `frontend/src/lib/addonEvents.ts`; core's mounted `ChaptersPanel` uses it as a refetch signal even when chapters were already present. |

#### Auth conventions

- **Cookies**: forward the original request's `Cookie` header (`lit_token`, `lit_viewer`) when calling access-controlled endpoints (`accessible-drives`, `filter-file-ids`, `files/{id}`). The core evaluates the caller's unlocked groups from `lit_token`.
- **Shared secret**: send `X-Internal-Secret: <value>` for the secret-gated endpoints. Mismatch is 403; constant-time compared so token length / prefix never leaks via timing. Strict writes additionally return 503 when core has no secret configured; legacy endpoints retain their documented dev no-op when it is unset.
- **Service-to-service**: `bulk-state` and `files/bulk` need no auth. `addon-events` uses the legacy shared-secret gate: send the header whenever `CORE_INTERNAL_SECRET` is configured.

#### Drive policy shape

```json
{
    "default": true,
    "features": { "rag": false, "auto_tags": true }
}
```

- `default` is the fallback for any feature name not in `features`
- `features[name]` overrides `default` for that specific feature
- Silent drives (`drives.json` has no `addons` entry) → `{"default": true, "features": {}}`
- Boolean shorthand (`"intelligence": false`) → `{"default": false, "features": {}}`
- Returns 404 for unknown drive names (so addons can't probe via this endpoint)

Cache the response for 30 seconds with fail-open semantics; drives.json changes require a container restart anyway.

---

## Addon Scope

Every addon must declare a `scope` field in its metadata (`ADDON_META` for in-process, `manifest.json` for external service). Scope is the addon developer's declaration of whether the addon operates in a drive context.

| Scope | Meaning | URL | Sidebar visibility |
|-------|---------|-----|--------------------|
| `drive` | Only meaningful within a selected drive | `/drive/{drive}/addons/{name}` | Only when a drive is selected |
| `global` | Drive-independent; the addon manages any drive concept internally | `/addons/{name}` | Always |
| `both` | Works in either context | Both URLs resolve | Drive URL when a drive is selected, global URL otherwise |

Accessing an addon via a URL that doesn't match its scope returns 404 (e.g., a `drive`-scoped addon accessed at `/addons/{name}`).

### Choosing a Scope

- Pick `drive` if the addon's behavior only makes sense relative to a specific drive (e.g., a downloader writes files *into* a drive; a podcast feed lists files *from* a drive). Choosing `drive` ensures the user can't wander into the addon without first picking a drive, and keeps sidebar noise down when viewing other drives.
- Pick `global` if the addon operates across drives or has no drive concept at all (e.g., admin-only sync dashboards; Vault-based knowledge apps that manage their own drive association).
- Pick `both` when the addon offers both a drive-scoped experience and a cross-drive experience. The core provides `currentDrive` to the addon via URL context; the addon decides how to behave in each mode.

### Validation

The core rejects addons without a valid `scope`. The error is logged and the addon is excluded from the registry (the router may still be mounted but the addon won't appear in `/api/addons/status`, and no UI will show it).

### Drive Context Header (`X-Lit-Drive`)

For `scope=drive` (and `scope=both` routes invoked from a drive context), the frontend attaches an `X-Lit-Drive: {drive-name}` header to every `/api/addons/{name}/...` call. The Generic Addon Proxy:

1. Rejects requests missing the header with 400 when the route is not `drive_optional`.
2. Percent-decodes the header value, then verifies the drive is in the caller's accessible set. Unknown or forbidden drives → 404.
3. Forwards the validated header to the upstream service.

Addon-side workers and handlers read the header directly — **addon developers never re-validate drive access themselves**. The header is authoritative because the host checked it. See `addons/intelligence/app/drive_context.py` for a reference implementation of `require_drive()` / `assert_file_in_drive()`.

### Viewer Identity Header (`X-Lit-Viewer-Id`)

For features that depend on "who is asking" (e.g. intelligence Ask's personal-history retrieval), the addon proxy injects an `X-Lit-Viewer-Id` header derived from the caller's `lit_viewer` cookie:

1. The proxy **strips any client-supplied `X-Lit-Viewer-Id` first** so a malicious tab cannot impersonate another viewer by injecting the header itself.
2. The cookie value is trimmed and SHA-256-hashed (16-char prefix), matching `nickname_to_viewer_id` on the auth side. Nicknames longer than 50 chars or empty are treated as "no viewer".
3. The resulting header is forwarded to the upstream addon.

Addons consume the header read-only. The plaintext nickname never crosses the Docker boundary — only the hashed viewer_id does. When no profile is set, the header is absent (do not fall back to a synthetic value).

### Per-Drive Policy

Operators disable addon features per drive in `drives.json`:

```json
{
    "name": "Family",
    "path": "/app/drives/family",
    "addons": {
        "intelligence": { "rag": false, "auto_tags": false },
        "downloader": false
    }
}
```

The system enforces policy at two layers so a misconfigured addon cannot leak data:

1. **Host-side proxy** — `addon_feature` pre_check short-circuits disabled routes as 404; `/api/addons/status?drive=` strips slot entries for disabled addons.
2. **Addon-side workers** — Query `GET /api/internal/drive-policy?drive=&addon=` and no-op. Addon owners should also purge locally-stored data for drives whose umbrella `index` feature (by convention) is turned off — intelligence does this at startup by scanning its own index's distinct drives and calling `purge_drive()` for any the host reports as disabled.

Silent entries default to enabled. drives.json is read once per process; a restart is required for policy changes to take effect.

Scope is the addon developer's **capability** declaration and cannot be overridden by the operator — only the per-feature enable/disable toggle is configurable.

## UI Slot System

Addons can inject UI components into predefined **slots** in the core application. If no addon registers for a slot, the slot renders nothing.

### Available Slots

| Slot ID | Location | Layout | Use case |
|---------|----------|--------|----------|
| `search-modes` | Search results page (`/drive/{drive}/search`); not the GlobalSearch popup | Stack | Semantic search, Find, and other custom retrievers. Receives `{ query, drive, filter, onSelect }`. There is one mount and one layout: entries draw the results-page form and nothing else. The GlobalSearch popup obtains semantic hits by calling intelligence's HTTP routes directly via the thin wrapper at `frontend/src/lib/semanticSearch.ts` — the established public-contract pattern — not via this slot |
| `file-detail-sections` | File detail inspector, Info tab | Vertical stack | Suggested tags, summaries, visual descriptions, the Knowledge editor. **Not** a transcript (`player-side`) and **not** a derived relation (`file-relations`) — both have slots of their own and an entry left here as well renders in two places |
| `file-relations` | Inside the file detail inspector's **Related** heading, under the core's own relations | Stack | Connections between *this* file and others that the addon derives rather than the user states — similarity, shared keywords. Core has one heading for both kinds, because two headings meant a reader had to guess which one a given connection was filed under. Two obligations: **move**, do not copy — an entry left in `file-detail-sections` renders in both places, and core cannot detect that; and note that the **Related** heading appears whenever any addon publishes here, whether or not your entry has computed anything, so a section that is only ever a placeholder does not belong in this slot. A collapsed control that computes when opened does. Under the heading your entry is one part of a group, not a section: draw its name at `text-xs font-medium text-text-muted` with no card and no glyph of its own, so the heading grouping it stays the louder of the two (`DESIGN.md` §The Related group — core's own member follows the same table). |
| `player-side` | Beside a media player — an **inspector tab** where the reader has chosen "beside", a bounded box under the description where they have chosen "below" | Stack | Something that follows the file as it plays: a transcript, a cue list. One entry is one tab. See [Occupying the player-side slot](#occupying-the-player-side-slot) — the host places it two different ways and tells the entry which. |
| `dashboard-widgets` | Admin dashboard | Cards | Index statistics, cloud sync status |
| `dashboard-alerts` | Admin dashboard, above the drive cards | Stack | Something is wrong and an operator should see it before anything else — a queue of failed jobs, a provider that stopped answering. Render nothing when there is nothing wrong: the host draws no wrapper and no heading, so an entry that always renders is a permanent band above the page. |
| `folder-actions-menu` | Inside the folder toolbar's **Add** menu, under a separator below the core's own rows | Stack of menu rows | Anything that puts something into the current folder — a batch of AI-written tags, an import from a URL. Receives `{ drive, fileIds, path }` plus the reserved `onRequestClose`, and draws `ActionMenuItem` rows under the same contract as `file-actions-menu`. |
| ~~`folder-actions`~~ | — | — | **Removed.** It drew a second button beside `Add`, which cost the folder toolbar a control it does not have room for — measured, it wrapped the bar onto two rows between 768 and 785px. Use `folder-actions-menu`. |
| `file-actions-menu` | The `[...]` overflow menu on the file detail page | Stack of menu rows | Per-file actions too infrequent to deserve a section of their own. See [Contributing to the file actions menu](#contributing-to-the-file-actions-menu) — entries have extra obligations. |
| `file-detail-actions` | The file detail page's primary action row, between the state controls and the `[...]` menu | Inline buttons | Per-file actions that deserve to be reachable in one press rather than through the overflow menu — the file counterpart of `folder-actions-menu`. See [Contributing to the file action row](#contributing-to-the-file-action-row). |
| `sidebar-sections` | Sidebar | Stack | Per-addon shortcuts |
| `loft-player` | File detail (external-source files) | Stack | Embedded player for URL-only files |
| `active-summary-view` | File detail | Stack | Knowledge-promoted summary note rendering. Hidden when no addon registers — file detail page falls back to the AI summary section. |
| `drive-home-sections` | Drive home page | Stack | Per-drive feature widgets (e.g. "Pickup" recommendations) |
| `admin-settings-sections` | Admin settings page | Stack | Additional settings sections contributed by addons |
| `admin-intelligence-sections` | Intelligence admin page (`/drive/{drive}/addons/intelligence/admin`) | Stack | Intelligence-specific settings panels (features, LLM provider, transcription, RAG) |

### Naming a slot entry in the reader's language

A slot entry's `label` is read straight from your `manifest.json`, which is a
declaration and not a translation catalogue — so a label written there appears in
English beside core's translated headings. Add `i18n_key` to the entry instead:

```json
{ "id": "transcript", "label": "Transcript", "priority": 10,
  "i18n_key": "intelligence.slots.transcript" }
```

The key is resolved against the merged catalogue, and the key itself belongs in
**your** addon's `frontend/messages/{ja,en}.json` — never in core's `messages-core/`
(`frontend-conventions.md`). Keep `label` as well: it is the fallback, used when no
key is given and when the key does not resolve, so an entry that ships a key before
its translations reach the merged output degrades to English rather than to a raw
key on screen.

No core release is needed to adopt it. The backend passes manifest fields through
untouched, so adding the field to a manifest is enough.

### Occupying the `player-side` slot

One entry is one tab. The host draws it in two places and hands it three
props that say which, in addition to the usual slot props:

| Prop | Meaning |
|---|---|
| `fillHeight: boolean` | The host has given you a height budget: fill it as a flex item and scroll inside yourself. `true` in both current placements. Do not use `h-full` — the budget is a `max-height` clamp, and a percentage height against that resolves to `auto`, so the list lays itself out at full length and is silently clipped. |
| `labelledByHost: boolean` | The host has already written your name above you — the tab button carries it. Drop your own title when this is `true`, or the reader reads the name of the thing they just pressed twice. `false` in the box below the player, which has no heading of its own. |
| `onAvailability: (available: boolean) => void` | Whether you have anything for this file. |

**`onAvailability` is how a tab stops appearing on files it has nothing
for.** Core cannot look inside your panel — asking "does the transcript
have anything" by name would be the core-to-addon dependency the rules
forbid — so you say so. It is the generic form of the `onResolved` core's
own chapter panel uses.

- **Call it with `false` as soon as you mount**, before your fetch
  settles, and with `true` when you find something. Not calling it at all
  means "available", which is what keeps every entry written before this
  signal existed working unchanged — so an entry that wants gating has to
  opt in by answering.
- **Your component is not unmounted when you answer `false`.** The tab
  loses its button and the panel is hidden; the box below the player is
  hidden in CSS. You are the thing doing the reporting, so you stay
  mounted and can take the answer back.
- **The answer is per file.** Core forgets it when the file changes, but
  it does not know which file your in-flight request was for — abandon a
  stale response yourself, the way you already must for the rest of your
  state.
- The same answer decides whether core draws the beside/below toggle at
  all. An entry that says `false` while the file has no chapters either
  takes the toggle away with it, because both of the places it would move
  the panel between are empty.

### Contributing to the file action row

`file-detail-actions` sits in the row that already carries the like,
favorite, and trust controls, immediately before the `[...]` menu. It
receives the same file context as every other file slot (`fileId`,
`drive`, `filename`, `fileType`, `mimeType`, `mediaController`, …) and
adds no callbacks of its own.

The row is a `flex-wrap` line that is also rendered inside a ~300px
Markdown inspector and on a phone, so an entry must:

- **Bring its own trigger.** The host renders no wrapper, no label, and
  no separator — the slot is a bare stack.
- **Take no width or height from the host,** and hard-code neither. The
  same entry has to fit a narrow inspector column today.
- **Keep its tap target at least 44px on a coarse pointer,** even where
  the drawn control is smaller — and keep it *itself*, with a
  `pointer-coarse:` class of its own. The host does grow the row's
  children on a coarse pointer, in both the compact strip and the full
  inspector row, but the rule is `.file-action-row-touch > *` and it
  reaches only the **direct child**. An entry that wraps its trigger —
  for a menu, a popover, anything needing a positioned parent — gets the
  wrapper grown and the control left where it was: measured at 28x28
  inside a 44x44 wrapper, because the same rule's `align-items: center`
  stops the height reaching through. Core's own overflow button has this
  shape and carries its own `pointer-coarse:h-11 pointer-coarse:w-11`
  for it. Size classes alone are not enough on a control with no
  `display`: add `inline-flex items-center justify-center` or the glyph
  sits against the padding edge.
- **Render nothing when it has nothing to offer for this file.** The row
  belongs to the core's own controls; an entry that always draws is a
  permanent occupant of a line the user did not ask for.

### Contributing to the file actions menu

`file-actions-menu` is the only slot whose host is a transient popup, so
an entry there has obligations the other slots do not impose.

It receives everything the file detail page gives its other slots
(`fileId`, `drive`, `filename`, `fileType`, `mimeType`, `mediaController`,
…) plus two callbacks. **`onRequestClose` and `onDialogOpenChange` are
reserved names**: the host applies them after spreading the file context,
so an entry cannot override them.

| Prop | Type | Meaning |
|---|---|---|
| `onDialogOpenChange` | `(open: boolean) => void` | Tell the host a dialog of yours is open. While it is, the host stops closing the menu on an outside click or Escape. |
| `onRequestClose` | `() => void` | Ask the host to close the menu. |

**Do not close the menu when you open a dialog.** Closing it unmounts the
slot's subtree, and your dialog goes with it. The sequence is:

1. On click: open your dialog and call `onDialogOpenChange(true)`. The
   menu stays open behind your modal overlay.
2. On dismiss: call `onDialogOpenChange(false)`, then `onRequestClose()`.

The host clears its copy of the flag whenever the menu closes, so a
missed step 2 degrades rather than wedging the menu shut — but the
ordering above is what keeps the interaction correct.

Further constraints:

- **Render `ActionMenuItem` directly** (a fragment for several rows). It
  is imported from `@/components/ActionMenuItem` and takes
  `{ icon, label, onClick, disabled?, danger? }`. Wrapping rows in your
  own element breaks the `menu` → `menuitem` relationship the host
  declares for assistive technology.
- **Portal dialogs out of the menu**, at `z-50` — the modal-dialog tier
  in `DESIGN.md` §Layering. The menu itself is `z-30` and clips its
  overflow, and your overlay is what hides it while the dialog is up. Do
  not reach for a higher number: `z-50` already outranks the mobile
  Bottom Sheet, and going above it would put you over the immersive
  viewers and toasts as well.

  **Portal into `useDialogPortalTarget()`, never `document.body`
  directly:**

  ```tsx
  import { useDialogPortalTarget } from "@/components/DialogPortal";

  const host = useDialogPortalTarget();
  if (!open || !host) return null;
  return createPortal(<YourDialog />, host);
  ```

  It is `document.body` almost everywhere. The exception is the mobile
  Bottom Sheet, which hosts this menu on a phone: it runs vaul in
  `modal` mode, so anything portalled beside it gets
  `pointer-events: none` from `<body>` and `aria-hidden="true"` of its
  own, and would be visible but dead. The hook hands you a node inside
  the sheet in that case, and `document.body` in every other.
- The menu is a fixed 160px wide and clips its overflow. Keep labels
  short, and put anything larger in a portalled dialog rather than a
  nested popover.
- Returning `null` is fine and expected — an entry that does not apply to
  the current file should render nothing, and the host drops its
  separator when the slot comes out empty.

### Contributing to the add menu

`folder-actions-menu` is `file-actions-menu`'s counterpart for a folder,
and the contract is the same one: **render `ActionMenuItem` directly**
(a fragment for several rows), imported from
`@/components/ActionMenuItem`. The host owns the `role="menu"` container,
the separator above your rows, and their styling; you supply the rows.
Wrapping them in your own element breaks the `menu` → `menuitem`
relationship, and rendering a button gives a button inside a dropdown.

| Prop | Type | Meaning |
|---|---|---|
| `drive` | `string` | The drive being browsed. |
| `fileIds` | `string[]` | The files the listing currently holds. |
| `path` | `string` | The folder being browsed, drive-relative; `""` at the drive root. |
| `onRequestClose` | `() => void` | Ask the host to close the menu. Reserved: the host applies it after spreading the context above, so an entry cannot override it. |

There is no `onDialogOpenChange` here. This menu is not the file detail
page's `[...]`, which stays open behind a modal so its subtree survives —
an entry here that needs a dialog should render the dialog outside the
menu's subtree from the start.

The host renders nothing at all — not even the separator — when no addon
declares the slot, so an installed-but-idle addon costs the menu no
space.

### Declaring Slots

In `ADDON_META` (in-process) or manifest JSON (external service):

```json
"slots": {
    "file-detail-sections": [
        {
            "id": "suggested-tags",
            "label": "Suggested Tags",
            "priority": 20
        }
    ]
}
```

- `id`: unique within the addon
- `priority`: sort order (lower = appears first)

### How the Frontend Renders Slots

1. `AddonSlotsProvider` fetches `/api/addons/status` on mount
2. The response includes a `slots` field aggregated across all addons
3. Core components render `AddonSlot` for each extension point:

```tsx
import { AddonSlot } from "@/components/AddonSlot";

function FileDetail({ fileId }: { fileId: string }) {
  return (
    <div>
      {/* Core content always renders */}
      <FileMetadata />
      <TagEditor />

      {/* Slot: renders nothing if no addon registered for it */}
      <AddonSlot id="file-detail-sections" props={{ fileId }} layout="stack" />
    </div>
  );
}
```

`AddonSlot` accepts a `layout` prop: `"stack"` (vertical, default), `"tabs"` (tabbed UI), or `"menu"` (inline).

4. `AddonSlot` validates addon names (`/^[a-z][a-z0-9-]*$/`), then lazy-loads components from `frontend/src/addons/{addonName}/slots.ts`. Loaded modules are cached to avoid re-imports.

### Frontend Slot Components

Addon frontend can export slot components via `slots.ts`:

```typescript
// addons/{name}/frontend/slots.ts
import { lazy } from "react";

export const slotComponents = {
  "similar-files": lazy(() => import("./SimilarFilesSection")),
};
```

---

## Core API Surface for In-Process Addons

In-process addons share the Python process and can import core modules.

### Allowed Imports

| Module | What to use | Purpose |
|--------|-------------|---------|
| `app.config` | `DRIVES`, `DATA_DIR`, `get_drive_path()`, `load_drives()` | Drive configuration |
| `app.database` | `get_db`, `SessionLocal`, `Base` | DB session management |
| `app.models` | `File`, `Tag`, etc. | **Read-only** queries |
| `app.auth` | `get_unlocked_groups`, `filter_drives`, `get_viewer_id` | Access control |
| `app.services.scanner` | `register_single_file()` | Register new files in DB |
| `app.services.ws` | `manager.broadcast()` | WebSocket notifications |
| `app.services.event_hooks` | `emit()` | Fire events to listeners |
| `app.nanoid` | `generate_nanoid()` | ID generation |

**Import style**: always `import app.config as config`, never `from app.config import X`.

### Rules

| Rule | Reason |
|------|--------|
| Addon tables must use `{addon_name}_` prefix | Prevent name collisions (`podcast_feeds`, etc.) |
| Do not INSERT/UPDATE/DELETE core tables directly | Use core service functions |
| Read-only access to core tables is allowed | Querying `File`, `Tag`, etc. is expected |
| Do not modify core model schemas | Must not break core migrations |
| Create addon tables in `on_startup()` | `CREATE TABLE IF NOT EXISTS` pattern |

### Example: Custom Table

```python
# service.py
from app.database import Base
from sqlalchemy import Column, String, Integer

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

When addons broadcast real-time state changes to the frontend via `manager.broadcast()` (in-process) or the core's WebSocket bridge (external service), use a stable dotted namespace so frontend subscribers can filter cleanly:

```
{addon_name}.{domain}.{verb}
```

Examples:

| Event | Payload | Meaning |
|-------|---------|---------|
| `intelligence.suggested_tags.ready` | `{file_id, count}` | Auto-tag suggestions finished for a file |
| `intelligence.detailed_summary.updated` | `{file_id, edited_at}` | User edited / reverted / regenerated the detailed summary |
| `intelligence.detailed_summary.citations_ready` | `{file_id, citation_count, no_citation_count}` | Citation linking pass finished (after generation or edit) |

Rules of thumb:
- Prefix with the addon name so multiple addons can coexist without colliding.
- Use **domain** (`detailed_summary`, `transcript`, `suggested_tags`) not route paths.
- Use **verb** (`updated`, `ready`, `failed`) not HTTP methods. Past-tense is conventional.
- Keep payload fields minimal and stable — prefer `{file_id}` over echoing the full resource; the frontend refetches if it needs details.

### Per-Drive Policy Gating for State-Mutating Routes

When an addon route writes or mutates addon state (edit, revert, regenerate, backfill, etc.), put the operation behind an `addon_feature` pre-check in the manifest rather than a bare `file_access` check. This ensures that turning the feature off in `drives.json` short-circuits writes with 404 before they reach the addon.

Example from the intelligence manifest — detailed-summary edit / revert / regenerate all guard on `detailed_summaries`:

```json
{"path": "/files/{file_id}/summary/detailed/section",   "methods": ["PUT"],  "pre_check": {"type": "addon_feature", "feature": "detailed_summaries"}}
{"path": "/files/{file_id}/summary/detailed/revert",    "methods": ["POST"], "pre_check": {"type": "addon_feature", "feature": "detailed_summaries"}}
{"path": "/files/{file_id}/summary/detailed/regenerate","methods": ["POST"], "pre_check": {"type": "addon_feature", "feature": "detailed_summaries"}}
```

Read-only observation routes on the same resource (`GET /files/{id}/summary/detailed/citations`, `GET /files/{id}/summary/detailed`) can use `file_access` alone so existing cached data remains visible if the feature is later disabled — in that case the addon-side purge-on-startup is the source of truth for eventual cleanup.

---

## Sidebar Icon Reference

The sidebar maps `ADDON_META.icon` to [Lucide React](https://lucide.dev/) icons in `SidebarLibrarySection.tsx`:

```typescript
const ADDON_ICONS: Record<string, LucideIcon> = {
  download: Download,
  package: Package,
  rss: Rss,
  cloud: Cloud,
};
```

Unknown icon names fall back to the `Package` icon. To add a new icon, update this map.

Addons without `href` in their metadata do not appear in the sidebar (e.g., external service addons that only provide slot components).

---

## Quick Start

### In-Process Addon

```bash
# 1. Create addon structure
mkdir -p addons/my-addon/backend addons/my-addon/frontend
touch addons/my-addon/backend/__init__.py

# 2. Write router.py with router + ADDON_META

# 3. Write frontend components

# 4. (Optional) For local dev, create symlinks for IDE support
ln -s ../../addons/my-addon/backend backend/addons/my-addon
ln -s ../../../addons/my-addon/frontend frontend/src/addons/my-addon

# 5. Build and run
docker compose up -d --build
```

### External Service Addon

```bash
# 1. Create a new Git repo for your addon at addons/my-service/
#    This repo is independent of the main Litloft repo.
mkdir -p addons/my-service && cd addons/my-service
git init

# 2. Write your service (Dockerfile + app code)

# 3. Create manifest.json at the root of the addon repo
#    (declares proxy routes, slots, access control)
#    See the "Manifest File" section above for the schema.

# 4. Commit to the addon's own repo
git add manifest.json Dockerfile app/
git commit -m "feat: initial service with manifest"

# 5. Add the service to docker-compose.override.yml (main repo, gitignored)

# 6. (Optional) Frontend components in addons/my-service/frontend/

# 7. (Optional) Declare event hooks in manifest.json
#    Add an "event_hooks" array (see "Event Hooks" section above).
#    configure.py generates event-hooks.json automatically from these declarations.
#    Do NOT edit event-hooks.json directly.

# 8. Build and run
cd /path/to/litloft
docker compose up -d --build
```

**Key invariant**: nothing gets committed to the main Litloft repo as part of adding your addon. The main repo discovers your manifest automatically at build time (Dockerfile copies `addons/*/manifest.json`) and at startup (`addon_registry` scans for manifests).

### Verifying Clean Absence

Before shipping an addon, verify that removing it leaves no trace:

```bash
# 1. Temporarily move your addon out of the way
mv addons/my-service /tmp/

# 2. Rebuild and start
docker compose up -d --build

# 3. Check /api/addons/status — your addon should not appear
curl http://localhost:3000/api/addons/status | jq .

# 4. Load the UI — no phantom sidebar link, no broken slots

# 5. Restore
mv /tmp/my-service addons/
docker compose up -d --build
```

If anything referenced your addon after step 3, you've accidentally leaked addon-specific state into the main repo. Find it and move it into the addon's own repo.

---

## Existing Addons

| Addon | Type | Scope | Description |
|-------|------|-------|-------------|
| `downloader` | In-process | `drive` | yt-dlp downloads + LoftRef external-URL mode |
| `cloud-sync` | In-process | `global` | rclone backup to cloud storage (admin-only) |
| `podcast` | In-process | `drive` | Generate RSS feeds from folders |
| `intelligence` | External service | `drive` | Semantic search, Find, AI summaries, transcript refine, Whisper, CLIP, BLIP, auto-tags, visual description |
| `knowledge` | External service | `drive` | Markdown note Vaults, web clipping, per-file notes, file relations graph |

---

## Intelligence Addon Reference

The intelligence addon (formerly `semantic-search`) is the primary external service addon. It runs as a separate Docker container and provides AI-powered features through the slot system.

### Docker Setup

In `docker-compose.override.yml`:

```yaml
services:
  backend:
    environment:
      - INTELLIGENCE_SERVICE_URL=http://intelligence:8100

  intelligence:
    build: ./addons/intelligence
    expose: ["8100"]
    mem_limit: 4096m
    volumes:
      - ./data:/data:ro
      # Mask the core's token signing key (see "Read-only mounts for
      # addons" in the Docker Compose guide).
      - /dev/null:/data/.jwt_secret:ro
      - ./data/addons/intelligence:/intelligence-data
      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro
      # Mount each drive read-only:
      - /path/to/videos:/drives/videos:ro
    environment:
      - HOMEVAULT_DB_PATH=/data/data.db
      - SEARCH_CONFIG_PATH=/app/search-config.yml
      - ALLOWED_BASE_DIRS=/drives/
      - DRIVE_MOUNTS=Videos=/drives/videos
      - LLM_API_KEY=           # Optional: for external LLM APIs
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

### Configuration (`search-config.yml`)

Copy `search-config.yml.example` and customize. Key sections:

#### Feature Flags

```yaml
features:
  indexing: true          # CLIP/Whisper indexing pipeline
  search: true            # Semantic search API
  auto_tags: "false"      # "false" | "manual" | "on_index"
```

- `"false"`: Auto-tags disabled (default)
- `"manual"`: Tags generated only when user clicks "Generate AI tags" in the UI
- `"on_index"`: Tags generated automatically after each file is indexed

#### LLM Configuration

```yaml
llm:
  provider: "openai_compatible"  # "openai_compatible" | "disabled"
  base_url: "http://host.docker.internal:11434/v1"  # ollama example
  model: "gemma2:9b"
  max_tokens: 2048
  temperature: 0.3
  output_language: "auto"        # "auto" | "ja" | "en" — applies to auto_tags and summaries
```

Supports any OpenAI-compatible API: ollama, OpenAI, DeepSeek, vLLM, LM Studio. Set `LLM_API_KEY` in the environment for APIs that require authentication.

**Security note**: File content (transcripts, BLIP captions, text) is sent to the LLM API. Use a local LLM (e.g., ollama) for privacy-sensitive content.

#### BLIP Captioning (Optional)

```yaml
models:
  blip: "Salesforce/blip-image-captioning-base"  # empty = disabled
```

Generates English text descriptions of images/video frames. Used as context for auto-tags to improve image tag quality. Requires approximately 1GB additional memory.

#### Text Embedding Model (GUI-managed)

`models.text_embedding` is operator-selectable from `/admin/settings` → **Text Embedding**. The picker exposes a curated allowlist (the keys of `_MODEL_DIMS` in `app/workers/embedder.py`) grouped by language family: IBM Granite Embedding R2 multilingual (`ibm-granite/granite-embedding-97m-multilingual-r2`, `…-311m-…`) and the ruri family (`cl-nagoya/ruri-v3-30m`, `…-130m`, `…-310m`). Free-text model ids are rejected by the `PUT /admin/embedding` endpoint with HTTP 422 — silent fallback to a 384-dim default would break `vec_text` invisibly, so the API refuses unknown ids by design. Adding a model requires editing `_MODEL_DIMS` in code.

The selection is persisted to `embedding-overrides.json` in the addon's data volume and merged onto `models.text_embedding` at startup, parallel to the existing llm / rag / transcription / features overrides (the Phase 2D pattern). `search-config.yml` remains the read-only baseline and is not rewritten.

**Automatic re-index on model change.** On every startup, `_migrate_vec_text_if_needed` (in `app/database.py`) compares the model name recorded in the new `index_meta(key, value)` table against the configured one. **The trigger is the model name, not the vector dimension.** Two models with the same dimension (e.g. granite-embedding-311m-multilingual-r2 768 ↔ ruri-v3-130m 768) produce non-interchangeable vector spaces and a mixed index returns meaningless cosine scores, so a swap between same-dim families must still rebuild. When a mismatch is detected, inside a single SQLite SAVEPOINT the addon:

1. Drops and recreates `vec_text` at the new dimension.
2. Deletes the `embeddings` rows of type `text_content` and purges both `fts_text_content*` tables.
3. Purges `detailed_summary_citations`.
4. Resets `indexed_files.text_indexed = 0` so the background indexer re-embeds.
5. Upserts the new model name into `index_meta`.

While the re-index runs, Ask and text search are degraded (fewer or no text hits). The background indexer reports progress on `/api/addons/intelligence/status`. The settings UI surfaces this cost in a confirmation dialog before the `PUT` is sent, and the core `RestartBanner` shows the pending-restart state via the standard `data/restart_pending` sentinel touched by the addon through the Internal API.

**Upgrade safety.** Existing installs that pre-date this feature have no `index_meta` row. If `vec_text` exists and its current dimension matches the configured (baseline) model's dimension, the migration seeds the recorded model name without dropping anything. This avoids a surprise full re-embed on the first restart after upgrading.

The admin gate on `PUT/DELETE /api/addons/intelligence/admin/embedding` is enforced by the manifest's `proxy.routes` entry with `pre_check: {"type": "admin"}` rather than by per-route Python code. The addon ships `tests/test_admin_manifest_parity.py` to enforce that every `/admin/*` route declared in `app/routers/admin.py` has a matching manifest entry with `pre_check.admin` — this keeps the gate from drifting silently when new admin endpoints are added.

**Residual caveats:**

- `detailed_summary_citations` are purged but not regenerated automatically. After the text re-embed completes, the operator must run `python -m scripts.reindex_text_content` followed by `python -m scripts.backfill_detailed_citations --force` to restore citation snippets. The confirmation dialog states this, and the same contract applies to the pre-existing manual `reindex_text_content` path.
- Calibrated thresholds such as `min_score_text` (default 0.85) are **not** auto-retuned on a model swap. Different models produce different score distributions and the threshold may need re-evaluation against your corpus.
- Only curated models work. Free-text ids are rejected with HTTP 422; do not expect a silent fallback.
- There is no shadow index — search is degraded for the entire re-embed window. This is an accepted tradeoff for a self-hosted LAN application; a dual-index path was considered and dropped as overengineering.
- The parallel `vec_clip` migration in the same file is still **dimension-keyed**, so a hypothetical same-dim CLIP model swap would currently be missed. This is a known limitation tracked separately; fixing it is out of scope for this feature.

For the full design and the broader rationale, see `docs/superpowers/specs/2026-05-20-gui-text-embedding-model.md` (developer-internal; the `docs/superpowers/` tree is gitignored).

### Memory Requirements

| Configuration | Recommended Memory |
|---------------|-------------------|
| Whisper + CLIP only | 4GB |
| + BLIP captioning | 6GB |
| + BLIP + large models | 8GB |

### UI Slots Provided

| Slot | Slot entry ID | Description |
|------|---------------|-------------|
| `search-modes` | `find-mode` | Exploratory natural-language queries returning a ranked file list (LLM-decomposed query chips) |
| `file-detail-sections` | `suggested-tags` | AI tag suggestions with approve/dismiss |
| `file-detail-sections` | `summary` | Short AI summary with edit/revert |
| `file-detail-sections` | `detailed-summary` | Long-form Markdown summary (manual trigger) with auto-linked citations and inline section editing |
| `file-detail-sections` | `visual-description` | AI-generated visual description for images and video (vision model) |
| `player-side` | `transcript` | Whisper transcript with per-file refine / revert. An inspector tab beside a media file, or a box under the description where the reader has moved it; answers `onAvailability(false)` on a file it has nothing for, so no empty tab appears |
| `file-detail-sections` | `clip-frames` | CLIP frame analysis |
| `file-actions-menu` | `index-details` | Per-file indexing state with a *Regenerate* button per task (`metadata`, `clip`, `whisper`, `text`) and recent provider stats, in a dialog opened from the file `[...]` menu |
| `file-relations` | `similar-files` | Visually similar files, under the inspector's **Related** heading beside the file's stated relations (collapsed by default; expanding it starts the search) |
| `drive-home-sections` | `pickup` | Recommended files widget on the drive home page |
| `dashboard-widgets` | `index-status` | Index queue depth and model memory |
| `dashboard-alerts` | `failed-jobs` | The failed-jobs warning band, above the drive cards. Absent when nothing has failed. |
| `folder-actions-menu` | `folder-ai-actions` | Batch AI actions, as rows of the folder toolbar's **Add** menu (auto-tags, summaries, image descriptions) |
| `file-detail-actions` | `file-ai-actions` | The **AI** menu beside the like and favourite buttons. Lists only what this file does not have yet (tag candidates, summary, detailed summary, chapter candidates, image description); each entry disappears once its section has content, and the button hides itself when nothing is left to offer |
| `admin-intelligence-sections` | `admin-features` | Feature toggle panel on the intelligence admin page |
| `admin-intelligence-sections` | `admin-llm` | LLM provider configuration panel |
| `admin-intelligence-sections` | `admin-embedding` | Text embedding model picker (curated allowlist; triggers vec_text rebuild on change) |
| `admin-intelligence-sections` | `admin-transcription` | Transcription provider and settings panel |
| `admin-intelligence-sections` | `admin-rag` | RAG behaviour configuration panel |

For a narrative operator-focused walkthrough (feature flags, LLM providers, memory tuning, eval harness), see [addons/intelligence.md](addons/intelligence.md).

---

## Knowledge Addon Reference

External service (`./addons/knowledge`, port 8200, scope=drive).

### Docker Setup

```yaml
services:
  knowledge:
    build: ./addons/knowledge
    expose: ["8200"]
    volumes:
      - ./data/addons/knowledge:/knowledge-data
    environment:
      - HOMEVAULT_INTERNAL_URL=http://backend:8000
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

  backend:
    environment:
      - KNOWLEDGE_SERVICE_URL=http://knowledge:8200
```

### UI Slots Provided

| Slot | Slot entry ID | Description |
|------|---------------|-------------|
| `file-detail-sections` | `knowledge-edit` | Inline Markdown editor for per-file notes. `.md` only — every other kind renders nothing |
| `file-detail-actions` | `knowledge-media-capture` | Quote the current playback position, PDF page or text selection into the capture basket |
| `file-actions-menu` | `knowledge-create-note` | Make a note linked to this file |
| `header-actions` | `knowledge-capture-basket` | The capture basket itself |
| `search-result-actions` | `knowledge-search-capture` | Quote a search result |
| `active-summary-view` | `knowledge-active-summary` | Renders the knowledge note promoted as the active summary for a file |

### Data Model

- **Vaults**: named collections of notes (one active per drive at a time)
- **Notes**: Markdown documents, optionally attached to a core `File` row
- **Clips**: web-clipped pages saved from the browser extension or `/clips/pasted` endpoint
