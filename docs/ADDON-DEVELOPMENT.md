# Addon Development Guide

This guide covers how to build addons for HomeVault using the addon architecture v2 (slot-based, declarative proxy).

## Addon Types

| Type | How it runs | Use case | Example |
|------|-------------|----------|---------|
| **In-process** | Inside the backend Python process | Lightweight features | downloader, podcast, cloud-sync |
| **External service** | Separate Docker container | Heavy workloads, ML models | intelligence |

---

## Clean Separation Principle

HomeVault's addon system is designed around one core rule: **the main HomeVault repo must contain zero knowledge of any specific addon.**

### What this means

- **Each addon lives in its own independent Git repo** at `addons/{name}/` (gitignored by the main repo).
- **No addon-specific files are checked into the main repo.** Not code, not manifests, not configuration. An OSS clone of HomeVault with no addons installed has no mention of `intelligence`, `downloader`, `cloud-sync`, or any other addon.
- **Addons declare themselves at load time** — via `ADDON_META` in their own `router.py` (in-process) or `manifest.json` in their own repo directory (external service).
- **Absence is the default.** If an addon is not present in `addons/`, the main backend has no notion of it. No phantom sidebar entries, no empty UI slots, no broken proxy routes, no 502s when someone clicks a link.

### Why

1. **OSS distribution** — HomeVault is designed for OSS release. A user cloning the repo and running `docker compose up` should get a clean, working core experience without any unused addon plumbing cluttering the UI.
2. **Symmetry** — In-process and external service addons use the same self-declaration pattern. Adding a new addon never requires a PR to the main repo.
3. **Failure isolation** — An addon that fails to load, or a container that fails to start, does not break the core. The core simply doesn't know about that addon.

### Practical consequences for addon authors

- **Never commit addon-specific files to the main repo.** The `backend/addon-manifests/` directory that used to hold external service manifests no longer exists; manifests live in each addon's own repo.
- **When you rename or modify an addon, commit the changes to the addon's own repo, not the main one.**
- **Test addon absence.** Before shipping, verify that removing `addons/{name}/` and rebuilding leaves no trace of your addon in the core UI.

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

**Nothing addon-specific is checked into the main HomeVault repo.** Each addon lives in its own git repo under `addons/{name}/`. If you don't clone an addon, the main repo has zero trace of it.

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
- External service addons declare themselves via `addons/{name}/manifest.json` — the manifest lives in the addon's own repo, not in the main HomeVault repo.
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

If neither candidate directory contains any `manifest.json` files, the registry logs `"No addon manifests found"` and proceeds with an empty external-addon set. **This is the normal case for a stock HomeVault install with no external addons** — no error, no warning, just silence.

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
| Event hooks | `event-hooks.json` | No | Webhook subscriptions |
| Page wrapper | `frontend/src/app/addons/[name]/page.tsx` and `.../drive/[name]/addons/[addon]/page.tsx` | Core-provided dispatcher | Generic routes that lazy-import each addon's `Page.tsx` |

The manifest file is the key difference from in-process addons. Since external services have no Python code in the backend process, the manifest tells the core app how to proxy requests and what UI slots to register. The manifest lives in the addon's own repo, so the main HomeVault repo has no knowledge of any specific addon.

### Manifest File

The manifest lives in **the addon's own Git repo**, at the top of the addon directory:

```
addons/my-service/        # ← addon's own repo root
  manifest.json           # ← committed to the addon repo, NOT the main HomeVault repo
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

    "slots": {
        "search-modes": [
            {"id": "my-search", "label": "My Search", "priority": 10}
        ]
    },

    "proxy": {
        "target_env": "MY_SERVICE_URL",
        "target_default": "http://my-service:8100",
        "health_check": "/health",
        "routes": [...]
    }
}
```

The proxy exposes routes at `/api/addons/{name}/{path}`. For example, a route with `"path": "/search"` becomes `GET /api/addons/my-service/search`.

**Why the manifest lives in the addon's repo**: the main HomeVault backend discovers the manifest dynamically at startup via `addons/*/manifest.json`. No file in the main repo ever needs to know that your addon exists. When you evolve the manifest (new routes, new slots, new filters), commit those changes to the addon repo — the main repo stays untouched. See [Clean Separation Principle](#clean-separation-principle) for the rationale.

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

**`drive_access`** — Filter an array by drive name:

```json
{
    "type": "drive_access",
    "array_path": "results",
    "drive_field": "drive"
}
```

Removes items from `response.results[]` where `item.drive` is not accessible.

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

### Docker Compose

`docker-compose.override.yml` (not tracked by git):

```yaml
services:
  my-service:
    build: ./addons/my-service
    expose: ["8100"]
    volumes:
      - ./data:/data:ro
    mem_limit: 2g
    restart: unless-stopped
```

### Event Hooks

`event-hooks.json` (not tracked by git):

```json
{
    "hooks": {
        "scan.complete": [
            {"url": "http://my-service:8100/webhook/scan-complete", "secret_env": "MY_WEBHOOK_SECRET"}
        ],
        "files.deleted": [
            {"url": "http://my-service:8100/webhook/files-deleted", "secret_env": "MY_WEBHOOK_SECRET"}
        ]
    }
}
```

Available events: `scan.complete`, `files.deleted`, `files.restored`, `files.purged`

### Internal API

For complex cases where declarative filters aren't sufficient, external services can call the core's Internal API on the Docker network:

| Endpoint | Description |
|----------|-------------|
| `GET backend:8000/api/internal/accessible-drives` | Accessible drive names for the given auth token |
| `GET backend:8000/api/internal/files/{file_id}` | File metadata (id, drive, filename, file_type) |
| `POST backend:8000/api/internal/filter-file-ids` | Filter file IDs by access control |

Forward the original request's cookies when calling these endpoints so access control works correctly.

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

### Per-Drive Policy (future)

Scope is the addon developer's **capability** declaration. A separate runtime **policy** layer (allowing operators to enable/disable addons per drive via `drives.json`) is out of scope for now but may be added later. Scope cannot be overridden by the operator; only the enable/disable toggle will be.

## UI Slot System

Addons can inject UI components into predefined **slots** in the core application. If no addon registers for a slot, the slot renders nothing.

### Available Slots

| Slot ID | Location | Layout | Use case |
|---------|----------|--------|----------|
| `search-modes` | GlobalSearch modal | Tabs | Semantic search, Q&A |
| `file-detail-sections` | File detail panel | Vertical stack | Related files, AI tags, transcripts |
| `dashboard-widgets` | Admin dashboard | Cards | Index statistics |
| `folder-actions` | Folder toolbar | Inline buttons | Batch AI tags, folder-level actions |

### Declaring Slots

In `ADDON_META` (in-process) or manifest JSON (external service):

```json
"slots": {
    "file-detail-sections": [
        {
            "id": "similar-files",
            "label": "Similar Files",
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
#    This repo is independent of the main HomeVault repo.
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

# 7. (Optional) Configure event-hooks.json (main repo, gitignored)

# 8. Build and run
cd /path/to/homevault
docker compose up -d --build
```

**Key invariant**: nothing gets committed to the main HomeVault repo as part of adding your addon. The main repo discovers your manifest automatically at build time (Dockerfile copies `addons/*/manifest.json`) and at startup (`addon_registry` scans for manifests).

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

| Addon | Type | Description |
|-------|------|-------------|
| `downloader` | In-process | Download videos via yt-dlp |
| `cloud-sync` | In-process | Sync drives with cloud storage via rclone |
| `podcast` | In-process | Generate RSS feeds from folders |
| `intelligence` | External service | Semantic search, CLIP analysis, Whisper transcription, LLM auto-tags, BLIP captioning, RAG Q&A |

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
      - ./data/addons/intelligence:/intelligence-data
      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro
      # Mount each drive read-only:
      - /path/to/videos:/drives/videos:ro
    environment:
      - HOMEVAULT_DB_PATH=/data/videos.db
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

### Memory Requirements

| Configuration | Recommended Memory |
|---------------|-------------------|
| Whisper + CLIP only | 4GB |
| + BLIP captioning | 6GB |
| + BLIP + large models | 8GB |

### UI Slots Provided

| Slot | Component | Description |
|------|-----------|-------------|
| `search-modes` / `semantic-search` | `SemanticSearchSlot` | Semantic search tab in global search |
| `search-modes` / `ask` | `AskSearchMode` | Natural-language Q&A over indexed files with citations |
| `file-detail-sections` / `suggested-tags` | `SuggestedTagsSection` | AI tag suggestions with approve/dismiss |
| `file-detail-sections` / `transcript` | `TranscriptSection` | Whisper transcription display |
| `file-detail-sections` / `clip-frames` | `ClipFramesSection` | CLIP frame analysis |
| `file-detail-sections` / `index-details` | `IndexDetailsSection` | Per-file index status |
| `file-detail-sections` / `similar-files` | `SimilarFilesSection` | Visually similar files |
| `dashboard-widgets` / `index-status` | `IndexStatusWidget` | Index statistics on admin dashboard |
| `folder-actions` / `folder-auto-tags` | `FolderAutoTagsButton` | Batch AI tag generation for folder |
