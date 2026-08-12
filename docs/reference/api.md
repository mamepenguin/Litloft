# HTTP API reference

A high-level catalogue of Litloft's HTTP API. The browser uses these endpoints; CLI scripts can too. All endpoints are served from `http://<host>:<port>/api/...` and are proxied to the backend through the Next.js custom server.

> Conventions: all responses are JSON unless noted. Error responses are `{ "detail": "..." }`. Authentication is cookie-based (`access_token` JWT + optional `lit_viewer` identity cookie). Cross-drive endpoints automatically filter to the viewer's accessible drives.

---

## Status codes and pagination

Common status codes across endpoints:

| Code | Meaning in Litloft |
|---|---|
| `200` / `201` | Success. `201` on resource creation (e.g. pin a folder). |
| `204` | Success, no body (e.g. profile preferences with no server-side persistence). |
| `400` | Bad request — most often path traversal in a `path`/`folder` argument. |
| `401` / `403` | Not authenticated / not permitted for this group. |
| `404` | Not found — **also returned for a locked protected drive**, so its existence stays hidden, and for Missing/Trash files on GET or mutating endpoints. |
| `409` | Conflict — scan already in progress, duplicate collection name, naming-conflict ceiling, setup already completed. |
| `410` | Gone — streaming a Missing file (`GET /api/files/{id}/stream`). |
| `413` | Payload too large — body cap exceeded (e.g. 1 MB content write, 5 MB render). |
| `415` | Unsupported media type — wrong encoding/MIME for `/render`, `/wiki-resolutions`. |
| `429` | Rate limit exceeded. Two in-memory per-IP limiters: `POST /api/auth/unlock` (5 / 60 s) and `POST /api/files/{id}/comments` (10 / 60 s). |

Pagination: list endpoints that paginate take `page` (1-based) and return the current slice; `GET /api/drives/{drive}/files` and the admin duplicates endpoint are the primary paginated surfaces. There is no cursor API — pagination is offset/page based, and an out-of-range `page` returns an empty list rather than an error.

---

## System

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe. Always `{ "status": "ok" }` with `200` once the app is up. No auth. This is what the Docker healthcheck polls (every 30s, 10s timeout, 3 retries, 10s start period). |
| `GET` | `/api/addons/status?drive=` | Loaded-addon catalogue and UI slot map. Without `drive`: every loaded addon (admin/global view). With `drive`: addons whose per-drive `index` policy is off are dropped, along with their slots. An unknown `drive` yields empty maps (not `404`). |

## Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/unlock` | Try a password, get a JWT cookie. Body: `{ "password": "..." , "remember": bool }`. Rate-limited to 5 attempts per 60 s per client IP (`429` when exceeded). |
| `GET` | `/api/auth/me` | Inspect the current viewer (groups, viewer_id). |
| `POST` | `/api/auth/logout` | Clear the JWT cookie. |

## Drives

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives` | List drives accessible to the viewer. |
| `GET` | `/api/drives/{drive}` | Drive info (counts, last scan). |
| `GET` | `/api/drives/{drive}/folders?path=...` | Folder listing under a path. |
| `GET` | `/api/drives/{drive}/files?path=...&type=...&tag=...&sort=...&page=...` | List files with filters. |
| `GET` | `/api/drives/{drive}/files/by-path?path=...` | Resolve one active file by exact normalized drive-relative path. Returns 404 when no active row matches; unlike the paginated listing, this has no 500-item search ceiling. |
| `POST` | `/api/drives/{drive}/files` | Create a file in the drive. Body `{ "path": "<rel>", "content": "<utf-8 text>", "conflict_mode": "rename" | "error" }`. `conflict_mode` defaults to `rename`, preserving automatic suffixing (`foo.md` → `foo (1).md`). `error` returns 409 on any DB/filesystem collision and never creates a suffix. Any extension is accepted; 1 MB body cap; 400 on traversal. Missing-state recovery applies in the default `rename` mode. |
| `GET` | `/api/drives/{drive}/duplicates` | Files grouped by `file_hash`. |
| `GET` | `/api/drives/{drive}/pins` | Pinned folders. |
| `POST` | `/api/drives/{drive}/pins` | Pin a folder. |
| `DELETE` | `/api/drives/{drive}/pins/{path}` | Unpin. |
| `POST` | `/api/drives/{drive}/scan` | Force a rescan. Scans are globally serialised; returns `409 Scan already in progress` if any drive is currently scanning. |

## Files

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/files/{id}` | File metadata. |
| `GET` | `/api/files/{id}/stream` | Range-requested media stream. Returns 410 for missing files. All responses carry `X-Content-Type-Options: nosniff`. HTML / SVG / XML mimes (`text/html`, `application/xhtml+xml`, `image/svg+xml`, `text/xml`, `application/xml`) are forced to `Content-Disposition: attachment` to block top-level navigation XSS; `<img src>` SVG rendering is unaffected since browsers ignore the header on sub-resources. |
| `GET` | `/api/files/{id}/render` | Inline HTML preview for AI artifacts. `text/html` only (404 otherwise). Returns a sandboxed document with `Content-Security-Policy: sandbox; default-src 'none'; ...` plus a small bootstrap script that reports `scrollHeight` to the parent via `postMessage`. UTF-8 only (415 for other encodings), 5 MB cap (413). Companion to `/stream`: `/stream` forces attachment for HTML; `/render` is the iframe path. |
| `GET` | `/api/files/{id}/thumbnail` | Lazy-generated 320x180 JPEG. |
| `GET` | `/api/files/{id}/sprite` | Sprite preview sheet (videos). |
| `GET` | `/api/files/{id}/exif` | EXIF data (images). |
| `GET` | `/api/files/{id}/content` | Text body (text/Markdown only). |
| `PUT` | `/api/files/{id}/content` | Write text body. 1 MB cap. Triggers Markdown frontmatter sync (tags, aliases, wiki-link / loft:// relations). |
| `GET` | `/api/files/{id}/wiki-resolutions` | Per-target resolver verdict for every `[[X]]` in a `.md` body. Markdown-only (415 otherwise). Shape: `{"resolutions": {"<target>": {"kind": "resolved" \| "unresolved" \| "ambiguous", ...}}}`. |
| `GET` | `/api/files/{id}/tags` | Get tags. |
| `PUT` | `/api/files/{id}/tags` | Set tags (canonical store: frontmatter for `.md`, DB for others). |
| `GET` | `/api/files/{id}/relations` | Related files. |
| `GET` | `/api/files/{id}/comments` | Comments. |
| `POST` | `/api/files/{id}/comments` | Add a comment. Rate-limited 10/60s/IP. |
| `PATCH` | `/api/files/{id}/comments/{cid}` | Edit own. |
| `DELETE` | `/api/files/{id}/comments/{cid}` | Delete own (or admin). |
| `POST` | `/api/files/{id}/progress` | Update watch progress. Empty body = view-only. |
| `GET` | `/api/files/{id}/progress` | Get viewer's progress. |
| `POST` | `/api/files/{id}/like` | Toggle like (per-viewer). |
| `POST` | `/api/files/{id}/restore` | Restore from trash. |
| `DELETE` | `/api/files/{id}` | Soft delete (trash). |
| `DELETE` | `/api/files/{id}?purge=true` | Hard delete (irreversible). |
| `POST` | `/api/files/{id}/rename` | Rename. |
| `POST` | `/api/files/{id}/move` | Move to another folder. |
| `POST` | `/api/files/{id}/copy` | Copy to another folder. |
| `GET` | `/api/files/{id}/download` | Force-download original. |
| `GET` | `/api/files/{id}/archive/entries` | List archive entries (zip/tar/rar). |
| `GET` | `/api/files/{id}/archive/entry?path=...` | Stream one entry. |

## Folder operations

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/folders/move` | Batch move. |
| `POST` | `/api/folders/copy` | Batch copy. |
| `POST` | `/api/folders/delete` | Batch soft delete. |
| `POST` | `/api/folders/download` | Stream a zip of the folder. |

## Search

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/files/search?drive=&q=&type=&tag=&sort=&limit=` | Keyword + filter search. |
| `GET` | `/api/drives/{drive}/smart-folders` | List Smart Folders. |
| `POST` | `/api/drives/{drive}/smart-folders` | Save a query as Smart Folder. |
| `DELETE` | `/api/drives/{drive}/smart-folders/{id}` | Remove. |

## Trash and missing

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/files/trash` | List trashed files. |
| `GET` | `/api/files/missing` | List missing files. |
| `POST` | `/api/files/trash/empty` | Purge trash older than 30 days. |
| `POST` | `/api/files/missing/purge-all` | Purge all missing files (in batches of 200). |

## Collections

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives/{drive}/collections` | List. |
| `POST` | `/api/drives/{drive}/collections` | Create. |
| `GET` | `/api/drives/{drive}/collections/{id}` | Detail with items. |
| `PATCH` | `/api/drives/{drive}/collections/{id}` | Rename / reorder. |
| `DELETE` | `/api/drives/{drive}/collections/{id}` | Remove. |
| `POST` | `/api/drives/{drive}/collections/{id}/items` | Add a file. Rejected for missing/trashed. |
| `DELETE` | `/api/drives/{drive}/collections/{id}/items/{item_id}` | Remove. |

## Upload

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/drives/{drive}/upload/init` | Begin a chunked upload. Body: `{ filename, size, mime, folder }`. |
| `POST` | `/api/drives/{drive}/upload/{upload_id}/chunk` | Push a chunk. |
| `POST` | `/api/drives/{drive}/upload/{upload_id}/complete` | Finalise; revives missing files at the same path. |
| `DELETE` | `/api/drives/{drive}/upload/{upload_id}` | Abort. |

## Profile

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/profile` | Current viewer's preferences. |
| `PATCH` | `/api/profile` | Update nickname / preferences. |
| `GET` | `/api/profile/history` | Personal watch history. |
| `DELETE` | `/api/profile/history` | Clear personal watch history. |

## Admin

All require master-viewer authentication **except** `setup-status` and `complete-setup`, which are intentionally unauthenticated so the first-run wizard can run before any password exists.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/dashboard` | Aggregated metrics. |
| `GET` | `/api/admin/duplicates` | Paginated duplicate groups. |
| `GET` | `/api/admin/config/setup-status` | `{ completed, drives }` (unauthenticated). `drives` (seeded `name`/`path`/`access_group`) is returned only while setup is incomplete; `[]` once `data/setup_completed` exists. |
| `GET` | `/api/admin/config/restart-status` | `data/restart_pending`. |
| `GET` | `/api/admin/config/drives` | Read drives.json. |
| `PUT` | `/api/admin/config/drives` | Replace drives.json (validated). |
| `GET` | `/api/admin/config/passwords` | Masked entries. |
| `PUT` | `/api/admin/config/passwords` | Replace passwords.json. |
| `POST` | `/api/admin/config/passwords/append` | Add an entry. |
| `DELETE` | `/api/admin/config/passwords/{index}` | Remove an entry. |
| `PUT` | `/api/admin/config/addon-policy` | Update per-drive addon policy. |
| `POST` | `/api/admin/config/complete-setup` | Finalise the wizard; creates `data/setup_completed`. |

## Addon proxy

For addon-specific endpoints, prefix with `/api/addons/<name>/`. The proxy:

- Validates `X-HV-Drive` header for `scope=drive` addons.
- Looks up per-drive policy.
- Forwards to the addon (in-process invocation or HTTP to the addon container).

Examples:

- `GET /api/addons/intelligence/search?q=...`
- `POST /api/addons/intelligence/ask`
- `POST /api/addons/intelligence/files/{id}/refine`
- `POST /api/addons/knowledge/clip`
- `GET /api/addons/cloud-sync/mappings`
- `POST /api/addons/media_import/import`

Each addon documents its surface in its addon page.

## Internal API

Available only on the Docker network (frontend never proxies these). For addon use.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/internal/accessible-drives` | none | All drive names. |
| `GET` | `/api/internal/drive-policy?drive=` | none | Policy for a drive. |
| `GET` | `/api/internal/files/{id}` | none | File metadata. |
| `GET` | `/api/internal/files/{id}/content` | `CORE_INTERNAL_SECRET` | File body (text MIME allowlist + size cap). |
| `POST` | `/api/internal/files/{id}/tags` | `CORE_INTERNAL_SECRET` | Set tags. |
| `PUT` | `/api/internal/files/{id}/chapters` | `CORE_INTERNAL_SECRET` (strict) | Replace the full chapter set with approved values. Core assigns dense ordering and `source=curated`; empty/fully invalid input is 422. Unset secret is 503. |
| `GET` | `/api/internal/viewer-history?viewer_id=&kind=` | none | Watched/not-watched lookup. |
| `POST` | `/api/internal/filter-file-ids` | none | Filter a list to those the caller can see. |
| `POST` | `/api/internal/files/bulk-state` | none | Lifecycle bulk read. |
| `POST` | `/api/internal/file_relations` | none | Create relation. |
| `GET` | `/api/internal/file_relations?file_id=` | none | Read both directions. |
| `DELETE` | `/api/internal/file_relations/{id}` | none | Remove. |
| `POST` | `/api/internal/addon-events` | none | Bridge an event onto the WS broadcaster. |

See [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy) for the rules new endpoints must satisfy.

## WebSocket

Connect to `/api/ws`. The frontend Custom Server proxies it to the backend. See [websocket events](websocket-events.md).
