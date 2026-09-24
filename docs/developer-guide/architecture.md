# Architecture

Litloft runs as two containers, plus one container for each independent-service addon:

- A Next.js custom server that serves the app and proxies HTTP and WebSocket traffic to the backend.
- A FastAPI backend that owns the SQLite database, the scanner, and the Internal API used by addons.
- A slot system in the frontend that lets addons add UI without changes to core.

## Topology

```
┌──────────┐       :3000 (custom server)
│ Browser  │ ────▶ ┌────────────────────────┐         expose:8000 (Docker network only)
└──────────┘       │ Next.js                │  ───▶  ┌────────┐
                   │  ├─ /api/* rewrite     │        │ FastAPI│ SQLite, ffmpeg, scanner
                   │  └─ /api/ws proxy      │        │backend │ │
                   └────────────────────────┘        └────┬───┘ │
                                                          │     │ Internal API
                                                ┌─────────┴─────┴──┐
                                                │ Addons            │
                                                │ (intelligence,    │
                                                │  knowledge,       │
                                                │  cloud-sync,      │
                                                │  media_import)    │
                                                └───────────────────┘
```

The backend has no `ports:` entry. The frontend is the only entry point, and it answers `/api/internal/*` with 404 so the Internal API cannot be reached from outside. See [custom server](frontend-dev.md#custom-server).

## Layers

| Layer | Responsibility |
|---|---|
| **Next.js custom server** (`frontend/server.js`) | Proxy HTTP and WebSocket. No business logic. |
| **Routers** (`backend/app/routers/`) | HTTP boundary: validate input, call services, return JSON. |
| **Services** (`backend/app/services/`) | Business logic: scanner, file operations, thumbnails, uploads, event hooks, and so on. |
| **Models** (`backend/app/models.py`) | SQLAlchemy ORM. File listings go through `active_file_filter()`. |
| **Schemas** (`backend/app/schemas.py`) | Pydantic request and response shapes. |

## Data on disk

| Path | What |
|---|---|
| `data/data.db` | The core SQLite database (WAL mode). |
| `data/thumbnails/` | Generated JPEG thumbnails. |
| `data/converted/` | HEIC → JPEG conversion cache. |
| `data/uploads/` | In-flight chunked upload state. |
| `data/addons/<name>/` | Addon state, where the compose examples mount it (for example `./data/addons/intelligence:/intelligence-data`). |
| `data/setup_completed` | Sentinel: the first-run wizard is skipped when present. |
| `data/restart_pending` | Flag: the admin "pending changes" banner is shown when present. |
| `data/.jwt_secret` | Auto-generated JWT signing key. |

## Auth model

- `lit_viewer` cookie (or the `X-Lit-Viewer` header): nickname → SHA-256 → 16-character `viewer_id`. There is no server-side session table.
- `access_token` cookie (httponly): a JWT carrying the unlocked `groups`.
- A drive is visible when it has no `access_group`, or its `access_group` is in the JWT's `groups`.
- A viewer is admin when they hold every protected drive's group, or the `__admin__` group. When no drive is protected and no `__admin__` password exists (including when `passwords.json` is absent or empty), everyone is admin. See `is_admin()` in `backend/app/auth.py`.

See [drives and access](../user-guide/drives-and-access.md).

## File states

| State | `deleted_at` | `missing_since` | How it is entered | How it leaves |
|---|---|---|---|---|
| Active | NULL | NULL | Scanner discovers the file, or an upload | — |
| Missing | NULL | set | Scanner no longer finds the file | Returns to Active when the path reappears; removed only by an explicit purge |
| Trash | set | NULL | User deletes the file | Restore returns it to Active; purged after 30 days |

See [file states](../reference/file-states.md) and the File state section of [`.claude/rules/design-decisions.md`](../../.claude/rules/design-decisions.md).

## Tags and Markdown frontmatter

- `.md`: frontmatter `tags:` is canonical and `File.tags` is a projection. `PUT /api/files/{id}/content` writes the file, then projects tags in a separate transaction, so a projection failure never undoes the content write.
- Other files: `File.tags` is canonical, written by `PUT /api/files/{id}/tags`.
- The frontend always calls `saveFileTags(file, tags)`, which picks the path.

Frontmatter `id:` and `aliases:` follow the same split (`File.md_id`, `File.md_aliases`), and `[[wiki links]]` are resolved per drive. The frontmatter parser exists twice, in core and in the knowledge addon, because they run in different containers. See [backend development](backend-dev.md#markdown).

## Addon model

Two kinds:

- In-process: a Python package loaded into the backend at startup. Used by `cloud-sync` and `media_import`.
- Independent service: its own container, reached through the core's addon proxy, calling back through the Internal API. Used by `intelligence` and `knowledge`.

Three scopes, declared by the addon:

- `drive`: URL `/drive/{drive}/addons/{name}`. The frontend sends an `X-Lit-Drive` header on `/api/addons/{name}/...` calls.
- `global`: URL `/addons/{name}`.
- `both`: either URL.

See [addon development](addon-dev.md).

## Internal API

`/api/internal/*` is reachable only on the Docker network. It exposes only data the core owns and renders. The full endpoint list is in [ADDON-DEVELOPMENT.md → Internal API](../ADDON-DEVELOPMENT.md#internal-api); the rules for adding one are in [Internal API policy](addon-dev.md#internal-api-policy).

## Concurrency

- Scanner: `asyncio.Lock`. A second concurrent run returns `409 Conflict`.
- ZIP extraction: `asyncio.Semaphore(3)`.
- Atomic file writes: write a temporary file, then `os.replace()`.

## Migrations

Schema migrations are in `_migrate()` in `backend/app/database.py` and run on backend start. They are forward-only: rolling back needs a database backup.

## i18n

Core strings are in `frontend/src/messages-core/`, addon strings in each addon's `frontend/messages/`. A merge script combines them at build time. See [frontend development → i18n](frontend-dev.md#i18n).

## Build

`docker compose up -d --build` builds:

1. The backend image (`backend/Dockerfile`): Python dependencies, ffmpeg, and each addon's `backend/` copied in as a real directory.
2. The frontend image (`frontend/Dockerfile`): `pnpm install`, addon frontends copied in, the translation merge, then `pnpm build`.
3. One image per independent-service addon (`addons/<name>/Dockerfile`).

Drives are mounted at runtime; no drive content is built into an image.

## Testing

See [testing](testing.md).

## See also

- [Backend development](backend-dev.md)
- [Frontend development](frontend-dev.md)
- [Addon development](addon-dev.md)
