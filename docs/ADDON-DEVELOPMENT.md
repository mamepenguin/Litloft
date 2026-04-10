# Addon Development Guide

This guide covers how to build addons for HomeVault using the addon architecture v2 (slot-based, declarative proxy).

## Addon Types

| Type | How it runs | Use case | Example |
|------|-------------|----------|---------|
| **In-process** | Inside the backend Python process | Lightweight features | downloader, podcast, cloud-sync |
| **External service** | Separate Docker container | Heavy workloads, ML models | intelligence |

---

## How Addons Are Loaded

Understanding the full loading flow is essential before building an addon.

### File Layout

```
project root/
  addons/                          # Addon source code (independent Git repos, gitignored)
    my-addon/
      backend/                     # Python code
        __init__.py
        router.py
      frontend/                    # React components
        MyAddonPage.tsx

  backend/
    addons/                        # Symlinks for local dev (gitignored)
      my-addon -> ../../addons/my-addon/backend
    addon-manifests/               # External service manifests (checked into git)
      intelligence.json

  frontend/
    src/
      addons/                      # Symlinks for local dev (gitignored)
        my-addon -> ../../../addons/my-addon/frontend
      app/
        addons/{name}/page.tsx     # Auto-generated at Docker build (gitignored)
```

### Docker Build: How Files Get Into Containers

Addons live in `addons/` at the project root. The Dockerfiles copy them into the containers at build time. **Symlinks are not used inside Docker.**

**Backend Dockerfile** (simplified):

```dockerfile
COPY backend/app/ ./app/                    # Core app code
COPY backend/addon-manifest[s]/ ./addon-manifests/  # External service manifests
COPY backend/addon[s]/ ./addons/            # Local addons dir (may contain symlinks)
COPY addon[s]/ /tmp/_all_addons/            # Top-level addons dir

# Resolve symlinks: delete them, then copy actual backend code from each addon
RUN find addons -maxdepth 1 -type l -delete; \
    for addon_dir in /tmp/_all_addons/*/; do \
      [ -d "$addon_dir/backend" ] || continue; \
      name="$(basename "$addon_dir")"; \
      cp -r "$addon_dir/backend" "addons/$name"; \
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
- `backend/addon-manifests/` is for external service addons only and IS checked into git.
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
   └─ Read backend/addon-manifests/*.json
       └─ Register each manifest in addon_registry

3. GET /api/addons/status
   └─ Returns merged data from both sources:
       ├─ addons: { name → metadata } (in-process + external)
       └─ slots: { slot-id → [entries sorted by priority] }
```

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

At Docker build time, the Dockerfile automatically generates `src/app/addons/{name}/page.tsx` for every addon that has a `Page.tsx`. No manual page wrapper creation needed.

The page is accessible at `/addons/{name}` (e.g., `/addons/downloader`).

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
| Service code | `addons/{name}/` | No (separate repo) | The service itself |
| Manifest | `backend/addon-manifests/{name}.json` | **Yes** | Proxy routes, slots, access control |
| Frontend UI | `addons/{name}/frontend/` | No (separate repo) | UI components |
| Docker config | `docker-compose.override.yml` | No | Container configuration |
| Event hooks | `event-hooks.json` | No | Webhook subscriptions |
| Page wrapper | `frontend/src/app/addons/{name}/page.tsx` | Auto-generated | Created by Dockerfile if `Page.tsx` exists |

The manifest file is the key difference from in-process addons. Since external services have no Python code in the backend process, the manifest tells the core app how to proxy requests and what UI slots to register.

### Manifest File

`backend/addon-manifests/{name}.json`:

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
# 1. Create service in addons/my-service/ with Dockerfile

# 2. Create manifest (checked into main repo)
#    backend/addon-manifests/my-service.json

# 3. Add service to docker-compose.override.yml

# 4. (Optional) Frontend components in addons/my-service/frontend/

# 5. (Optional) Configure event-hooks.json

# 6. Build and run
docker compose up -d --build
```

---

## Existing Addons

| Addon | Type | Description |
|-------|------|-------------|
| `downloader` | In-process | Download videos via yt-dlp |
| `cloud-sync` | In-process | Sync drives with cloud storage via rclone |
| `podcast` | In-process | Generate RSS feeds from folders |
| `intelligence` | External service | Semantic search, CLIP analysis, Whisper transcription, LLM auto-tags, BLIP captioning |

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
      - ./addons/intelligence/search-data:/search-data
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
  tag_language: "auto"           # "auto" | "ja" | "en"
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
| `file-detail-sections` / `suggested-tags` | `SuggestedTagsSection` | AI tag suggestions with approve/dismiss |
| `file-detail-sections` / `transcript` | `TranscriptSection` | Whisper transcription display |
| `file-detail-sections` / `clip-frames` | `ClipFramesSection` | CLIP frame analysis |
| `file-detail-sections` / `index-details` | `IndexDetailsSection` | Per-file index status |
| `file-detail-sections` / `similar-files` | `SimilarFilesSection` | Visually similar files |
| `dashboard-widgets` / `index-status` | `IndexStatusWidget` | Index statistics on admin dashboard |
| `folder-actions` / `folder-auto-tags` | `FolderAutoTagsButton` | Batch AI tag generation for folder |
