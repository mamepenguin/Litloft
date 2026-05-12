# Architecture

Litloft is two containers and zero or more addon containers, glued together by:

- A **Next.js custom server** that proxies HTTP and WebSocket to the backend and serves the SPA.
- A **FastAPI backend** that owns the SQLite database, the filesystem-walking scanner, and the Internal API used by addons.
- A **lightweight slot system** in the frontend that lets addons inject UI without forking core.

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

Backend never has `ports:` exposed externally. The frontend is the only public entry point.

## Layered responsibilities

| Layer | Responsibility |
|---|---|
| **Browser (SPA)** | Render UI, handle interaction, hold the WebSocket. Uses `app/` Server Components for auth-sensitive shells. |
| **Next.js custom server** | Proxy HTTP and WS, terminate TLS (when fronted by a reverse proxy). Performs no business logic. |
| **FastAPI routers** (`backend/app/routers/`) | HTTP boundary: validate input, call services, return JSON. |
| **Services** (`backend/app/services/`) | Business logic: scanner, fileops, thumbnail, upload, heic, subtitle, preview, hash, ws, addon_registry, config_writer. |
| **Models** (`backend/app/models.py`) | SQLAlchemy ORM. Use `active_file_filter()` for default queries. |
| **Schemas** (`backend/app/schemas.py`) | Pydantic request / response shapes. |

## Data on disk

| Path | What |
|---|---|
| `data/videos.db` | The core SQLite DB. |
| `data/thumbnails/` | Lazy-generated 320x180 JPEGs. |
| `data/uploads/` | In-flight chunked upload state. |
| `data/snapshots/` | Periodic SQLite snapshots (admin-triggered). |
| `data/converted/` | ffmpeg conversion cache (e.g. HEIC → JPEG). |
| `data/previews/` | Sprite preview sheets. |
| `data/addons/<name>/` | Per-addon state (DB, models, logs). |
| `data/setup_completed` | Sentinel — wizard skipped iff present. |
| `data/restart_pending` | Flag — admin banner shown iff present. |
| `data/.jwt_secret` | Auto-generated JWT signing key. |

## Auth model

- `lit_viewer` cookie — nickname → SHA256 → 16-char `viewer_id`. The identity, no server session table.
- `access_token` cookie (httponly) — JWT carrying the unlocked `groups`.
- A drive is visible iff its `access_group` is in the JWT's `groups`, or it has no `access_group`.
- A *master viewer* is one whose `groups` cover every protected drive — they get admin access.
- When `passwords.json` is absent, every viewer is implicitly admin.

See [drives and access](../user-guide/drives-and-access.md).

## File-state finite machine

```
            (scanner discovers)
               ┌─────────┐
              ─▶│ Active  │
              │ └─┬───┬───┘
   (re-upload │   │   │ (user delete)
   to same    │   │   ▼
   path)      │   │ ┌────────┐
              │   │ │ Trash  │── 30d ──▶ Purged (row gone, file gone)
              │   │ └────┬───┘
              │   │      │ (user restore: clears both flags)
              │   │      └──────────┐
              │   ▼                 ▼
   (recovered)│ ┌──────────┐    ┌──────┐
              └─┤ Missing  │ ◀──┤ Active│
                └────┬─────┘    └──────┘
                     │  (scanner observes file gone)
                     │
                     └─ kept indefinitely, manually purged
```

See [file states](../reference/file-states.md).

## Tag canonical store split

Markdown files use frontmatter as the canonical store; everything else uses the DB.

- `.md`: `PUT /api/files/{id}/content` is the only write path. The handler re-projects `tags` into `File.tags` inside the same transaction. Projection failure is non-fatal — content write must remain durable.
- non-`.md`: chip editor → `PUT /api/files/{id}/tags` → `Tag` table.
- Frontend always calls `saveFileTags(file, tags)`; the helper branches by extension. UI layer must not branch.

The frontmatter parser is implemented twice (core + knowledge) because they live in separate containers. Drift caught in PR review.

The same canonical / projection split applies to the Markdown `id:` field added in Phase A of spec `2026-05-12-markdown-link-three-forms.md`: the frontmatter `id:` is canonical, `File.md_id` is the projection cache. Injection sites today are `PUT /api/files/{id}/content` and the knowledge `note_scanner` reconcile loop; the shared helper is `ensure_id` (duplicated in core and knowledge for the same cross-container reason).

## Addon model

Two flavours:

- **In-process** — Python module symlinked into `backend/addons/<name>`. Loaded at startup; shares the FastAPI app. Used by `cloud-sync`, `media_import`.
- **Independent service** — separate container, talks to core via the public addon proxy and the internal API. Used by `intelligence`, `knowledge`.

Two scopes:

- `drive` — bound to a specific drive per request. URL pattern `/drive/{drive}/addons/{name}/...`. Required `X-HV-Drive` header on internal calls.
- `global` — no drive binding. URL pattern `/admin/...`.

See [addon overview](../addons/overview.md) and [addon development](addon-dev.md).

## Internal API

`/api/internal/*` is on the Docker network only. It is small by design — only data the core owns and renders gets exposed:

- Drive enumeration, drive policy.
- File metadata, file content (text MIMEs, gated, size-capped).
- Tag write (gated).
- File relations (read/write).
- Filter-file-ids (access control).
- Bulk lifecycle.
- Addon-events bridge (post → WebSocket).

See [Internal API policy](addon-dev.md#internal-api-policy) for the rules.

## Concurrency primitives

- **Scanner** — guarded by `asyncio.Lock`; second concurrent run returns `409 Conflict`.
- **Sprite generation** — `asyncio.Semaphore(2)` plus an in-progress set to dedup.
- **ZIP extraction** — `asyncio.Semaphore(3)`.
- **Atomic file writes** — write to `.tmp`, then `os.replace()`.

## Migrations

Schema migrations live next to the model and run on backend boot. Forward-only — rolling back over a migration is unsafe without a DB backup.

## i18n

- `next-intl` with cookie-only routing (`NEXT_LOCALE`); no URL prefix.
- Core strings in `frontend/src/messages-core/{ja,en}.json` (tracked).
- Addon strings in `addons/<name>/frontend/messages/{ja,en}.json` (tracked in addon repo).
- A merge script (`scripts/merge-addon-messages.mjs`) deep-merges them into `frontend/src/messages/` (gitignored, generated) at build time.

Core keys must only live in `messages-core/`; addon keys must only live in addon dirs.

## Build pipeline

`docker compose up -d --build`:

1. Backend image — `backend/Dockerfile` installs Python deps, ffmpeg.
2. Frontend image — `frontend/Dockerfile` runs `pnpm install`, runs the merge script, `pnpm build`.
3. Each addon image — `addons/<name>/Dockerfile`.

The frontend build does not embed any drive content — drives are mounted at runtime.

## Testing

- Backend: `pytest` inside Docker (`backend/Dockerfile.test`). Pydantic does not work cleanly with local Python 3.14, so always run inside the container.
- Frontend: `vitest 3.x` (do not upgrade to 4 — rolldown native bindings issue), `jsdom 25.x` (do not upgrade to 29 — ESM compat).

See [testing](testing.md).

## See also

- [Backend development](backend-dev.md)
- [Frontend development](frontend-dev.md)
- [Addon development](addon-dev.md)
