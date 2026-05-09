# HTTP API reference

A high-level catalogue of Litloft's HTTP API. The browser uses these endpoints; CLI scripts can too. All endpoints are served from `http://<host>:<port>/api/...` and are proxied to the backend through the Next.js custom server.

> Conventions: all responses are JSON unless noted. Error responses are `{ "detail": "..." }`. Authentication is cookie-based (`access_token` + optional `lit_viewer`). Cross-drive endpoints automatically filter to the viewer's accessible drives.

---

## Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/unlock` | Try a password, get a JWT cookie. Body: `{ "password": "..." , "remember": bool }`. |
| `GET` | `/api/auth/me` | Inspect the current viewer (groups, viewer_id). |
| `POST` | `/api/auth/logout` | Clear the JWT cookie. |

## Drives

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives` | List drives accessible to the viewer. |
| `GET` | `/api/drives/{drive}` | Drive info (counts, last scan). |
| `GET` | `/api/drives/{drive}/folders?path=...` | Folder listing under a path. |
| `GET` | `/api/drives/{drive}/files?path=...&type=...&tag=...&sort=...&page=...` | List files with filters. |
| `POST` | `/api/drives/{drive}/files` | Create a file in the drive. Body `{ "path": "<rel>", "content": "<utf-8 text>" }`. Any extension (or none) is accepted; `content` is stored as opaque UTF-8 text. 1 MB body cap. On same-name collision with an active or trashed file, the basename is auto-suffixed (`foo.md` → `foo (1).md` → `foo (2).md` …). A *missing*-state file at the same path is revived in place (UPSERT). 409 is only returned at the suffix-numbering ceiling (~99 collisions). 400 on path traversal. |
| `GET` | `/api/drives/{drive}/duplicates` | Files grouped by `file_hash`. |
| `GET` | `/api/drives/{drive}/pins` | Pinned folders. |
| `POST` | `/api/drives/{drive}/pins` | Pin a folder. |
| `DELETE` | `/api/drives/{drive}/pins/{path}` | Unpin. |
| `POST` | `/api/drives/{drive}/scan` | Force a rescan. |

## Files

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/files/{id}` | File metadata. |
| `GET` | `/api/files/{id}/stream` | Range-requested media stream. Returns 410 for missing files. |
| `GET` | `/api/files/{id}/thumbnail` | Lazy-generated 320x180 JPEG. |
| `GET` | `/api/files/{id}/sprite` | Sprite preview sheet (videos). |
| `GET` | `/api/files/{id}/exif` | EXIF data (images). |
| `GET` | `/api/files/{id}/content` | Text body (text/Markdown only). |
| `PUT` | `/api/files/{id}/content` | Write text body. 1 MB cap. Triggers Markdown frontmatter sync. |
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

## Playlists

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives/{drive}/playlists` | List. |
| `POST` | `/api/drives/{drive}/playlists` | Create. |
| `GET` | `/api/drives/{drive}/playlists/{id}` | Detail with items. |
| `PATCH` | `/api/drives/{drive}/playlists/{id}` | Rename / reorder. |
| `DELETE` | `/api/drives/{drive}/playlists/{id}` | Remove. |
| `POST` | `/api/drives/{drive}/playlists/{id}/items` | Add a file. Rejected for missing/trashed. |
| `DELETE` | `/api/drives/{drive}/playlists/{id}/items/{file_id}` | Remove. |

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

All require master-viewer authentication.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/dashboard` | Aggregated metrics. |
| `GET` | `/api/admin/duplicates` | Paginated duplicate groups. |
| `GET` | `/api/admin/config/setup-status` | `data/setup_completed`. |
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
