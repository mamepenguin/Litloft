# HTTP API reference

A high-level catalogue of Litloft's HTTP API. The browser uses these endpoints; CLI scripts can too. All endpoints are served from `http://<host>:<port>/api/...` and are proxied to the backend through the Next.js custom server.

> Conventions: all responses are JSON unless noted. Error responses are `{ "detail": "..." }` (a few newer endpoints put a machine-readable object there instead, e.g. `{ "detail": { "code": "job_not_found" } }`). Authentication is cookie-based (`access_token` JWT + optional `lit_viewer` identity cookie); non-browser clients may send the JWT as `Authorization: Bearer <token>` and the viewer nickname as `X-Lit-Viewer` instead. A Bearer credential takes priority over the cookie and never falls back to it. Cross-drive endpoints automatically filter to the viewer's accessible drives.

---

## Status codes and pagination

Common status codes across endpoints:

| Code | Meaning in Litloft |
|---|---|
| `200` / `201` | Success. `201` on resource creation (pin a folder, create a collection / smart folder / text file, post a comment). |
| `202` | Accepted — the markdown-image import job was queued. |
| `204` | Success, no body (unpin, delete a comment, delete a smart folder, delete a collection or item, internal tag / chapter writes, and progress writes made without a viewer cookie). |
| `206` | Partial content — a satisfied `Range` request on `GET /api/files/{id}/stream`. |
| `400` | Bad request — most often path traversal in a `path`/`folder` argument, a missing drive context on a `scope=drive` addon call, or a cross-drive collection item. |
| `401` / `403` | Not authenticated / not permitted. `401` when a comment is posted without a viewer identity; `403` for non-admin callers of admin routes, for editing or deleting someone else's comment, and for an addon call naming a drive the caller cannot access. |
| `404` | Not found — **also returned for a locked protected drive**, so its existence stays hidden, and for Missing/Trash files on GET or mutating endpoints. |
| `409` | Conflict — scan already in progress, duplicate collection name, folder already pinned, `conflict_mode=error` collision on file create, collection reorder whose item set does not match, setup already completed, maintenance job already running. |
| `410` | Gone — streaming, rendering, or extracting preview text from a Missing file. |
| `412` / `428` | `PUT /api/files/{id}/content` optimistic locking: `428` when `If-Match` is absent, `412` when it does not match the current content ETag. |
| `413` | Payload too large — body cap exceeded (1 MB content write / text-file create, 5 MB render, 5 MB subtitle, 50 MB archive entry). |
| `415` | Unsupported media type — non-UTF-8 HTML for `/render`, a non-Markdown file for `/wiki-resolutions`, a mime outside the text allowlist for the content `PUT`. |
| `416` | Range not satisfiable — malformed or out-of-bounds `Range` header on `/stream`. |
| `422` | Validation error — FastAPI schema rejection, the 500-comments-per-file ceiling, or a chapter promotion whose entries are all invalid. |
| `429` | Rate limit exceeded. Two in-memory per-IP limiters: `POST /api/auth/unlock` (5 / 60 s) and `POST /api/files/{id}/comments` (10 / 60 s). |
| `503` | An addon's proxy target is not configured, or a write-gated Internal API endpoint was called while `CORE_INTERNAL_SECRET` is unset. |

Pagination: list endpoints that paginate take `page` (1-based) and `limit` (default 30, max 500), and return `{ "data": [...], "meta": { "total", "page", "limit" } }`. `GET /api/drives/{drive}/files`, `/trash`, and `/missing` are the paginated surfaces; `GET /api/files/{id}/versions` uses `limit` (default 50, capped at 100) / `offset` instead and returns the total alongside. There is no cursor API — pagination is offset/page based, and an out-of-range `page` returns an empty list rather than an error.

---

## System

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe. Always `{ "status": "ok" }` with `200` once the app is up. No auth. This is what the Docker healthcheck polls (every 30s, 10s timeout, 3 retries, 10s start period). |
| `GET` | `/api/addons/status?drive=` | Loaded-addon catalogue and UI slot map. Without `drive`: every loaded addon (admin/global view). With `drive`: addons whose per-drive `index` policy is off are dropped, along with their slots. External-service addons whose target env var is unset are omitted entirely. An unknown `drive` yields empty maps (not `404`). |

## Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/unlock` | Try a password, get a JWT cookie. Body: `{ "password": "...", "remember": bool }`. Responds `200` either way: `{ "success": true, "groups": [...], "token": "..." }` on match, `{ "success": false, "error": "Invalid password" }` on miss. `token` is echoed so non-browser clients can resend it as `Authorization: Bearer`. Rate-limited to 5 attempts per 60 s per client IP (`429` when exceeded). |
| `POST` | `/api/auth/lock` | Clear the JWT cookie. |
| `GET` | `/api/auth/status` | Inspect the current viewer: `{ unlocked_groups, has_protected_drives, is_admin }`. `is_admin` is true only when the caller can see every protected drive. |

## Drives

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives` | List drives accessible to the viewer: `{ name, protected, file_count }`. Counts are active files only (trash and missing excluded); a locked drive's count never leaves the server. |
| `GET` | `/api/drives/{drive}/summary` | `{ name, trash_count, missing_count }`. |
| `GET` | `/api/drives/{drive}/folders?path=` | Direct subfolders under a path, with recursive file counts. |
| `GET` | `/api/drives/{drive}/folder-tree?root=&type_filter=&depth=1&flat=` | Lazy-expandable tree for the 2-pane browser. Default mode returns one level under `root` (subfolders plus depth-1 files matching `type_filter`), each folder carrying `file_count` and `has_children`. `flat=true` returns a flattened subtree, capped at 50,000 entries. `depth` currently accepts only `1`. |
| `GET` | `/api/drives/{drive}/files?path=&recursive=&search=&favorite=&liked=&tag=&type=&sort=&order=&page=&limit=` | List files with filters. `path` is an exact `folder_path` match (direct children); `recursive=true` widens it to the whole subtree, and a recursive query with an empty `path` covers the drive. `search` matches title **or** folder path (each item carries a `match_source` of `filename` / `path` / `both`). `liked=true` selects files carrying a like stamp (`liked=false` the rest). `sort` is one of `created_at`, `title`, `file_size`, `liked_at`, `random`. |
| `GET` | `/api/drives/{drive}/files/by-path?path=...` | Resolve one active file by exact normalized drive-relative path. Returns 404 when no active row matches; unlike the paginated listing, this has no search ceiling. |
| `POST` | `/api/drives/{drive}/files` | Create a file in the drive. Body `{ "path": "<rel>", "content": "<utf-8 text>", "conflict_mode": "rename" \| "error" }`. `conflict_mode` defaults to `rename`, preserving automatic suffixing (`foo.md` → `foo (1).md`). `error` returns 409 on any DB/filesystem collision and never creates a suffix. Any extension is accepted; 1 MB body cap; 400 on traversal. `201` on creation, `200` when the write revived a missing row at the same path (default `rename` mode only). |
| `GET` | `/api/drives/{drive}/tags?folder_path=` | Tag names with usage counts. `folder_path` scopes the counts to that folder's subtree. |
| `GET` | `/api/drives/{drive}/duplicates` | Files grouped by `(file_hash, file_size)`, plus `total_groups` and `total_wasted_bytes`. Not paginated. |
| `GET` | `/api/drives/{drive}/watch-history?limit=&filter=` | This viewer's recently opened files in the drive. `filter=unfinished` (default) applies the 90 %-completion gate; `filter=all` does not. `limit` defaults to 20, max 50. Returns `{ "data": [] }` when no viewer identity is present. |
| `GET` | `/api/drives/{drive}/addon-policies` | Read-only per-drive addon policy snapshot for the browser: `{ "addons": { "<name>": { "default": bool, "features": { ... } } } }`. Malformed `drives.json` surfaces as `500`, never as "all enabled". |
| `GET` | `/api/drives/{drive}/pins` | Pinned folders. |
| `POST` | `/api/drives/{drive}/pins` | Pin a folder (`201`; `409` if already pinned). |
| `DELETE` | `/api/drives/{drive}/pins?path=...` | Unpin (`204`). The path is a query parameter, not a path segment. |
| `POST` | `/api/drives/{drive}/scan` | Force a rescan. Scans are globally serialised; returns `409 Scan already in progress` if any drive is currently scanning. |

## Files

File ids are 12-character nanoids and are validated as such in the path.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/files/{id}` | File metadata, plus detected subtitle tracks and a `has_chapters` flag. |
| `PUT` | `/api/files/{id}` | Update `title` / `description`. |
| `GET` | `/api/files/{id}/neighbors?sort=&order=` | Previous / next file id within the same folder under the given ordering, for player and viewer navigation. |
| `GET` | `/api/files/{id}/stream?download=` | Range-requested media stream (`206` on a satisfied range, `416` on a bad one). Returns 410 for missing files. All responses carry `X-Content-Type-Options: nosniff`. HTML / SVG / XML mimes (`text/html`, `application/xhtml+xml`, `image/svg+xml`, `text/xml`, `application/xml`, `application/xslt+xml`) are forced to `Content-Disposition: attachment` to block top-level navigation XSS; `<img src>` SVG rendering is unaffected since browsers ignore the header on sub-resources. `download=true` forces attachment for any mime — this is the download path; there is no separate `/download` endpoint. HEIC/HEIF is transparently converted to JPEG. Text files inside the write allowlist and under 1 MB are returned whole with a strong content-hash `ETag`, which is the value to send back as `If-Match` on the content `PUT`. |
| `GET` | `/api/files/{id}/render` | Inline HTML preview for AI artifacts. `text/html` only (404 otherwise). Returns a sandboxed document with `Content-Security-Policy: sandbox; default-src 'none'; ...` plus a small bootstrap script that reports `scrollHeight` to the parent via `postMessage`. UTF-8 only (415 for other encodings), 5 MB cap (413). Companion to `/stream`: `/stream` forces attachment for HTML; `/render` is the iframe path. |
| `GET` | `/api/files/{id}/preview-text` | First ~400 characters of a `.docx` / `.xlsx` / `.pptx` file as `text/plain`, for card previews. `400` for any other mime. |
| `GET` | `/api/files/{id}/thumbnail` | 320x180 JPEG. Falls back to a placeholder image when the file has no generated thumbnail. Served for trashed and missing files too. |
| `GET` | `/api/files/{id}/exif` | EXIF data (images). `404` when the file is not an image or has no EXIF row. |
| `PUT` | `/api/files/{id}/content` | Write text body. `text/markdown` and `text/plain` only (415 otherwise); raw UTF-8 request body, 1 MB cap. Requires `If-Match` with the current content ETag (`428` when absent, `412` on mismatch). Optional request header `X-Litloft-Save-Kind: explicit` marks the write as a user-initiated save; anything else is treated as `auto`. Responds `200` with the new `ETag` and, when a version row was touched, `X-Litloft-Version-Action: created \| collapsed \| promoted \| unchanged`. For Markdown it also injects a frontmatter `id:` when missing and syncs tags, aliases, wiki-link / `loft://` relations, and the derived thumbnail — each projection commits separately so a failure cannot roll back the durable content write. |
| `GET` | `/api/files/{id}/versions?limit=&offset=` | Version history for a text/Markdown file: `{ versions: [{ id, created_at, nickname, kind, size_bytes, lines_added, lines_removed }], total, limit, offset }`. `kind` is `auto` or `explicit`. `limit` defaults to 50 and is capped at 100. `404` for a file outside the text allowlist. Responses are `Cache-Control: no-store`. |
| `GET` | `/api/files/{id}/versions/{version_id}` | One stored version's full body: `{ id, content, etag }`. `404` for an unknown version, `500` when the stored blob cannot be read. |
| `GET` | `/api/files/{id}/versions/{version_id}/diff` | Line diff of that version against its predecessor: `{ id, lines: [{ kind: "add" \| "del" \| "context", text }], lines_added, lines_removed }`. |
| `GET` | `/api/files/{id}/wiki-resolutions` | Per-target resolver verdict for every `[[X]]` in a `.md` body. Markdown-only (415 otherwise). Shape: `{"resolutions": {"<target>": {"kind": "resolved" \| "unresolved" \| "ambiguous", ...}}}`; resolved entries also carry `file_id`, `filename`, and `basename`. |
| `PUT` | `/api/files/{id}/tags` | Set tags (canonical store: frontmatter for `.md`, DB for others). Replaces the whole set. There is no `GET` counterpart — tags come back on the file response. |
| `PUT` | `/api/files/{id}/trust-tier` | Vouch for a source or withdraw the vouch: `{tier}`, one of `verified` \| `unverified`. Returns the updated file. Stamps `trust_reviewed_at`, which is what separates a person's judgement from a bulk-migrated row. Unverified files stay searchable but stop grounding Ask answers. Demoting never changes anything distilled from the file — a note keeps its own standing. |
| `GET` | `/api/files/{id}/relations?kind=` | Related files via `file_relations`, both directions, newest first. Trashed counterparts are dropped; missing ones are kept so the UI can grey them out. |
| `GET` | `/api/files/{id}/chapters` | Ordered chapter set plus the `source` (`extracted` or `curated`) of the current set. |
| `GET` | `/api/files/{id}/subtitles/{index}` | One detected sidecar subtitle track as WebVTT (SRT is converted on the fly). 5 MB cap (413). |
| `GET` | `/api/files/{id}/archive` | List archive entries (zip). `404` when the file is not an archive. |
| `GET` | `/api/files/{id}/archive/entry?path=...` | Stream one entry. Symlink entries are rejected (400) and both the declared and the decompressed size are capped at 50 MB (413). Only image and plain-text entries are served inline; everything else is an attachment. |
| `GET` | `/api/files/{id}/comments` | Comments, oldest first, each flagged `is_mine`. |
| `POST` | `/api/files/{id}/comments` | Add a comment (`201`). Requires a viewer identity (`401` without one). Rate-limited 10/60s/IP; `422` past 500 comments on one file. |
| `PUT` | `/api/files/{id}/comments/{cid}` | Edit own (`403` otherwise). |
| `DELETE` | `/api/files/{id}/comments/{cid}` | Delete own (`204`; `403` otherwise). |
| `POST` | `/api/files/{id}/progress` | Update watch progress. Empty body = view-only. |
| `GET` | `/api/files/{id}/progress` | Get viewer's progress. |
| `DELETE` | `/api/files/{id}/progress` | Remove this viewer's history row for the file (`204`). An explicit user action only — playback completion must not call it. |
| `POST` | `/api/files/{id}/like` | Toggle the per-file like stamp. Liking sets `liked_at` to now, so a file liked again returns to the top of the Liked view; liking a liked file clears it. |
| `POST` | `/api/files/{id}/favorite` | Toggle the per-file favorite flag. |
| `POST` | `/api/files/{id}/restore` | Restore from trash. |
| `DELETE` | `/api/files/{id}` | Soft delete (trash). |
| `DELETE` | `/api/files/{id}/purge` | Hard delete (irreversible). Accepts a trashed or a missing file; there is no `?purge=true` variant on `DELETE /api/files/{id}`. |
| `PUT` | `/api/files/{id}/rename` | Rename. Body `{ "new_filename": "..." }`. |
| `PUT` | `/api/files/{id}/move` | Move to another folder (and optionally another drive). Body `{ "target_drive": null, "target_folder_path": "..." }`. A `target_drive` the caller cannot access is `404`, indistinguishable from one that does not exist. `null` **or an empty string** means "the drive it is already in". |
| `POST` | `/api/files/{id}/copy` | Copy to another folder. Same body shape as move, and the same `404` on an inaccessible `target_drive`. |

### Batch operations

Batch endpoints take `{ "ids": [...] }` (plus operation-specific fields) and never fail the whole call for one bad id: each result carries a count and a per-id `errors` array.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/files/batch/get` | Resolve many ids to file responses, filtered to accessible drives. |
| `POST` | `/api/files/batch/delete` | Soft delete many files. |
| `PUT` | `/api/files/batch/move` | Move many files. Body adds `target_drive` / `target_folder_path`. The destination is checked once for the whole request, so an inaccessible `target_drive` is a request-level `404` and nothing moves — it is not reported as per-file errors. |
| `PUT` | `/api/files/batch/tags` | **Merge** tags into many files (unlike the single-file `PUT`, which replaces). |
| `PUT` | `/api/files/batch/rename` | Pattern rename. Body adds `mode` plus the fields that mode needs. |
| `POST` | `/api/files/batch/restore` | Restore many trashed files. |
| `POST` | `/api/files/batch/purge` | Hard delete many trashed or missing files. |
| `POST` | `/api/files/batch/copy` | Copy many files into one target folder. Same request-level `404` on an inaccessible `target_drive`. |

## Folder operations

Folder mutations are drive-scoped and live under the drive's `/folders` path. Each one emits `folders.created` / `folders.moved` / `folders.deleted` (plus `files.moved` when file rows shifted) so the tree and the file pane refresh together.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/drives/{drive}/folders` | Create a folder. Body `{ "path": "<parent>", "name": "..." }`. |
| `PUT` | `/api/drives/{drive}/folders` | Rename in place. Body `{ "path": "...", "new_name": "..." }`. |
| `PUT` | `/api/drives/{drive}/folders/move` | Move a folder. Body `{ "path": "...", "target_path": "..." }`. |
| `DELETE` | `/api/drives/{drive}/folders?path=...` | Delete a folder (its files go to trash). |

## Search

There is no standalone search endpoint. Keyword search is the `search` parameter on `GET /api/drives/{drive}/files` (matched against title and folder path, drive-scoped); semantic search is an addon surface reached through the addon proxy. Saved searches are Smart Folders:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives/{drive}/smart-folders` | List the drive's Smart Folders, newest first. Shared within the drive — not filtered per viewer. |
| `POST` | `/api/drives/{drive}/smart-folders` | Save a query as a Smart Folder (`201`). Body `{ name, query, file_type?, sort_by?, sort_order? }`. |
| `PATCH` | `/api/drives/{drive}/smart-folders/{id}` | Update any subset of those fields. |
| `DELETE` | `/api/drives/{drive}/smart-folders/{id}` | Remove (`204`). |

## Trash and missing

Both lists are drive-scoped and paginated; there is no cross-drive trash or missing view.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives/{drive}/trash?sort=&order=&page=&limit=` | List trashed files. `sort` defaults to `deleted_at`. |
| `POST` | `/api/drives/{drive}/trash/empty` | Purge the drive's trash. Returns `{ "purged": n }`. |
| `GET` | `/api/drives/{drive}/missing?sort=&order=&page=&limit=` | List missing files. `sort` defaults to `missing_since`. |
| `POST` | `/api/drives/{drive}/missing/purge-all` | Purge all missing files in the drive (in batches of 200). Returns `{ "purged": n }`. |

## Collections

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives/{drive}/collections` | List, most recently updated first. |
| `POST` | `/api/drives/{drive}/collections` | Create (`201`; `409` on a duplicate name within the drive). |
| `GET` | `/api/drives/{drive}/collections/{id}` | Detail with items. |
| `PUT` | `/api/drives/{drive}/collections/{id}` | Rename / edit the description. |
| `DELETE` | `/api/drives/{drive}/collections/{id}` | Remove (`204`). |
| `POST` | `/api/drives/{drive}/collections/{id}/items` | Add files. Body `{ "file_ids": [...] }`, max 100 per call. Already-present ids are skipped; missing/trashed files are `404` and a file from another drive is `400`. Returns the updated detail. |
| `DELETE` | `/api/drives/{drive}/collections/{id}/items/{item_id}` | Remove one item (`204`). |
| `PUT` | `/api/drives/{drive}/collections/{id}/items/reorder` | Reorder. Body `{ "item_ids": [...] }` must be exactly the current item set (`409` otherwise). |

## Upload

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/drives/{drive}/upload/init` | Begin a chunked upload. Body: `{ filename, file_size, folder_path, relative_path, chunk_size }` (`chunk_size` defaults to 5 MiB). Returns `{ upload_id, chunk_size, total_chunks }`. |
| `POST` | `/api/drives/{drive}/upload/{upload_id}/chunk` | Push a chunk as `multipart/form-data` with fields `chunk_index` and `chunk`. Returns the received/total chunk counts. |
| `POST` | `/api/drives/{drive}/upload/{upload_id}/complete` | Finalise; revives missing files at the same path (emitting `files.recovered`) and returns the file record. |
| `DELETE` | `/api/drives/{drive}/upload/{upload_id}` | Abort. |

A session is bound to the drive it was opened for; using it under another drive's path is a `404`.

## Viewer identity and watch progress

There is no profile API. Viewer identity is carried entirely by the `lit_viewer` cookie (or the `X-Lit-Viewer` header) holding a nickname, which the backend hashes to a `viewer_id`; nothing about the viewer is stored server-side beyond the rows keyed by that id. Preferences live in the browser. Requests without an identity are accepted — progress writes become a no-op `204` and history reads come back empty.

Per-viewer state is reached through the endpoints already listed above: `POST` / `GET` / `DELETE /api/files/{id}/progress` for a single file, and `GET /api/drives/{drive}/watch-history` for the drive's continue-watching list.

## Admin

`/api/admin/dashboard` and every `/api/admin/markdown-images/...` route require master-viewer authentication (`403` otherwise). Under `/api/admin/config`, `setup-status` and `complete-setup` are intentionally unauthenticated so the first-run wizard can run before any password exists; the `GET` routes require admin; and the writes accept an unauthenticated caller **only** while `data/setup_completed` is absent, then require admin like everything else.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/dashboard` | Aggregated metrics: per-drive disk usage, file counts by type, last scan time and current scan state, plus DB / thumbnail / converted-cache sizes and uptime. |
| `GET` | `/api/admin/config/setup-status` | `{ completed, drives }` (unauthenticated). `drives` (seeded `name`/`path`/`access_group`) is returned only while setup is incomplete; `[]` once `data/setup_completed` exists. |
| `POST` | `/api/admin/config/complete-setup` | Finalise the wizard; creates `data/setup_completed`. `409 already_completed` if it is already there. |
| `GET` | `/api/admin/config/drives` | Read drives.json at full fidelity, including addon policy. |
| `PUT` | `/api/admin/config/drives` | Replace drives.json (validated, atomic write). Returns `{ ok, count }`. |
| `GET` | `/api/admin/config/passwords` | Entries with every password value masked as `***`. Real passwords never leave the server. |
| `PUT` | `/api/admin/config/passwords` | Replace passwords.json (validated, atomic write). A masked value is rejected. |
| `POST` | `/api/admin/config/passwords/append` | Append one entry without resending the masked others. Body is a single `{ password, groups }` object. |
| `DELETE` | `/api/admin/config/passwords/{index}` | Remove the entry at that 0-based index (`404` when out of range). |
| `GET` | `/api/admin/config/addon-policy` | Per-drive addon policy projected out of drives.json. Drives with no `addons` field appear with an empty object. |
| `PUT` | `/api/admin/config/addon-policy` | Merge submitted policy into drives.json. A drive's `addons` key is replaced wholesale; omitted drives and all non-addon fields are preserved. |
| `GET` | `/api/admin/config/restart-status` | `data/restart_pending`: `{ pending, files }`. The flag is set by every successful write in this router and cleared on the next backend startup. |

### Markdown image import

A maintenance flow that rewrites remote `<img>` / `![]()` sources in Markdown files into local drive files. Analyse first, then start an import against that analysis id.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/markdown-images/analyses` | Scan a folder for remote image references. Body `{ drive, folder_path, recursive }`. Returns `analysis_id`, an `expires_at` 30 minutes out, and per-host counts and samples. |
| `POST` | `/api/admin/markdown-images/imports` | Start the import (`202`). Body `{ analysis_id, allowed_hosts }` — only references on listed hosts are fetched. `404 analysis_not_found` for a stale id, `409 maintenance_busy` when another maintenance job holds the lock. |
| `GET` | `/api/admin/markdown-images/imports/current` | `{ "job": ... }` for the running job, or `{ "job": null }`. |
| `GET` | `/api/admin/markdown-images/imports/{job_id}` | Job status by id (`404 job_not_found`). |
| `POST` | `/api/admin/markdown-images/imports/{job_id}/cancel` | Request cancellation; returns the updated job. |

## Addon proxy

For addon-specific endpoints, prefix with `/api/addons/<name>/`. The proxy:

- Validates the `X-Lit-Drive` header (percent-encoded, so non-ASCII drive names round-trip) for `scope=drive` addons; a route may opt out with `drive_optional` when it cannot send headers, in which case a stronger per-route gate applies. A drive the caller cannot access is `403`; a missing drive context on a `scope=drive` route is `400`.
- Runs per-route pre-checks (file access, per-drive addon policy, admin) and filters drive-bearing arrays out of the response.
- Forwards to the addon (in-process invocation or HTTP to the addon container). An unknown addon or unmatched route is `404`; an unconfigured target is `503`.

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
| `GET` | `/api/internal/drive-policy?drive=&addon=` | none | Policy for one addon on one drive. Both parameters are required. |
| `GET` | `/api/internal/files/{id}` | none | File metadata. |
| `GET` | `/api/internal/files/{id}/content` | `CORE_INTERNAL_SECRET` | File body (text MIME allowlist + size cap). |
| `POST` | `/api/internal/files/{id}/tags` | `CORE_INTERNAL_SECRET` | Replace tags (`204`). |
| `PUT` | `/api/internal/files/{id}/chapters` | `CORE_INTERNAL_SECRET` (strict) | Replace the full chapter set with approved values (`204`). Core assigns dense ordering and `source=curated`; empty/fully invalid input is 422. Unset secret is 503. |
| `GET` | `/api/internal/viewer-history?viewer_id=&kind=` | `CORE_INTERNAL_SECRET` | Watched/not-watched lookup. |
| `PUT` | `/api/internal/files/{id}/trust-tier` | `CORE_INTERNAL_SECRET` (strict) | Declare a file's tier at ingest (`204`). Never stamps `trust_reviewed_at` — that is a person's judgement, made through the public endpoint. `409` when a viewer already ruled on the file (conditional update; the viewer wins). Unset secret is 503. |
| `POST` | `/api/internal/filter-file-ids` | none | Filter a list to those the caller can see. Optional `trust_tier` narrows further to that tier; omitted, behaviour is unchanged. The response carries `trust_filtered` so a caller can tell an applied filter from an older core that ignored the field. |
| `POST` | `/api/internal/files/bulk-state` | none | Lifecycle bulk read. |
| `POST` | `/api/internal/files/bulk` | none | Full file metadata in bulk for a list of ids, so addons can enrich results without N+1 lookups. Trashed and missing ids come back under `not_found`. |
| `POST` | `/api/internal/file_relations` | `CORE_INTERNAL_SECRET` | Create relation. |
| `GET` | `/api/internal/file_relations?file_id=` | none | Read both directions. |
| `DELETE` | `/api/internal/file_relations/{id}` | `CORE_INTERNAL_SECRET` | Remove. |
| `POST` | `/api/internal/restart-pending` | `CORE_INTERNAL_SECRET` | Touch `data/restart_pending` on an addon's behalf so the core's RestartBanner prompts the user (`204`). Body carries a generic `source` and optional `reason`. |
| `POST` | `/api/internal/addon-events` | `CORE_INTERNAL_SECRET` | Bridge an event onto the WS broadcaster. |

See [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy) for the rules new endpoints must satisfy.

## WebSocket

Connect to `/api/ws`. The frontend Custom Server proxies it to the backend. The connection is accepted even without a valid JWT — an unauthenticated socket simply receives public-drive events only. See [websocket events](websocket-events.md).
