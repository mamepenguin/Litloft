# HTTP API reference

The browser uses these endpoints, and scripts can too. Every endpoint is served at `http://<host>:<port>/api/...` through the Next.js custom server.

Conventions:

- Responses are JSON unless noted. Errors are `{ "detail": "..." }`; the admin config and Markdown image routes put an object there instead, e.g. `{ "detail": { "code": "job_not_found" } }`.
- Authentication is the `access_token` JWT cookie. A non-browser client may send the JWT as `Authorization: Bearer <token>` instead. A Bearer credential takes priority over the cookie and never falls back to it.
- Viewer identity is a nickname in the `lit_viewer` cookie or the `X-Lit-Viewer` header. See [Viewer identity](#viewer-identity-and-watch-progress).
- Endpoints that take file ids from several drives filter them to the drives the caller can access.

---

## Status codes and pagination

| Code | Meaning |
|---|---|
| `200` / `201` | Success. `201` when a pin, collection, Smart Folder, text file, comment or (Internal API) file relation is created. |
| `202` | The Markdown image import job was queued. |
| `204` | Success, no body: unpin, delete a comment, Smart Folder, collection or collection item, delete progress, the Internal API writes, and progress writes made without a viewer identity. |
| `206` | A satisfied `Range` request on `/stream`. |
| `400` | Bad request: path traversal in a `path` / `folder` argument, a missing drive context on a `scope=drive` addon call, a cross-drive collection item or relation. |
| `401` | A comment posted without a viewer identity. |
| `403` | A non-admin caller on an admin route, editing or deleting someone else's comment, an addon call naming a drive the caller cannot access, a wrong setup token, a wrong `X-Internal-Secret`. |
| `404` | Not found. Also returned for a locked protected drive, so its existence stays hidden, and for Missing or Trash files on GET and mutating endpoints. `/stream`, `/render`, `/preview-text` and `/thumbnail` still serve trashed files. |
| `409` | Conflict: scan already running, duplicate collection name, folder already pinned, `conflict_mode=error` collision, a collection reorder whose item set does not match, setup already completed, a maintenance job already running, a relation that already exists, an Internal API trust-tier write on a file a viewer already ruled on. |
| `410` | Gone: `/stream`, `/render` or `/preview-text` on a Missing file. |
| `412` / `428` | `PUT /api/files/{id}/content`: `428` when `If-Match` is absent, `412` when it does not match the current ETag. |
| `413` | Body or file too large: 1 MB content write / text-file create, 5 MB render, 5 MB subtitle, 50 MB archive entry, `CORE_INTERNAL_CONTENT_MAX_BYTES` on the Internal API content read. |
| `415` | Unsupported media type: non-UTF-8 HTML on `/render`, a non-Markdown file on `/wiki-resolutions`, a mime outside the text allowlist on the content `PUT` or the Internal API content read. |
| `416` | A malformed or out-of-range `Range` header on `/stream`. |
| `422` | Validation error: schema rejection, the 500-comments-per-file ceiling, a chapter promotion with no valid entry, an admin config payload that fails validation. |
| `429` | Rate limit: `POST /api/auth/unlock` and `POST /api/files/{id}/comments`, per client IP. |
| `502` | An external-service addon did not answer. |
| `503` | An addon's proxy target is not configured, or a strict Internal API write was called while `CORE_INTERNAL_SECRET` is unset. |

Pagination: `GET /api/drives/{drive}/files`, `/trash` and `/missing` take `page` (1-based) and `limit` (default 30, max 500) and return `{ "data": [...], "meta": { "total", "page", "limit" } }`. A `page` past the end returns an empty list. `GET /api/files/{id}/versions` takes `limit` (default 50, capped at 100) and `offset` instead.

---

## System

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | `{ "status": "ok" }`. No auth. The Docker healthcheck polls it. |
| `GET` | `/api/addons/status?drive=` | `{ addons, slots }`: loaded addons and their UI slots. External-service addons whose target env var is unset are left out. Without `drive`, every loaded addon. With `drive`, addons whose `index` policy is off for that drive are dropped with their slots; an unknown drive, or one the caller has not unlocked, gives empty maps rather than `404`. |

## Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/unlock` | Body `{ "password": "...", "remember": bool }`. Always `200`: `{ "success": true, "groups": [...], "token": "..." }` on a match (and the `access_token` cookie is set), `{ "success": false, "error": "Invalid password" }` otherwise. `token` is for clients that send `Authorization: Bearer`. After 5 failed attempts from one IP within 60 s, further attempts get `429`. |
| `POST` | `/api/auth/lock` | Clear the `access_token` cookie. |
| `GET` | `/api/auth/status` | `{ unlocked_groups, has_protected_drives, is_admin }`. `is_admin` is true when the caller holds the `__admin__` group or has unlocked every protected drive. With no protected drive, it is true for everyone unless an `__admin__` password exists. |

## Drives

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives` | Drives the caller can access: `[{ name, protected, file_count }]`. `file_count` counts active files only. |
| `GET` | `/api/drives/{drive}/summary` | `{ name, trash_count, missing_count }`. |
| `GET` | `/api/drives/{drive}/folders?path=` | Direct subfolders of `path`: `[{ name, path, file_count, kind_counts, dominant_kind }]`. `file_count` and `kind_counts` cover the whole subtree. `kind_counts` maps a kind (`video`, `image`, `audio`, `document`, `archive`, `text`, `pdf`, `other`) to its file count, classified as the listing's `type` filter does; kinds with no files are absent, and the values sum to `file_count`. `dominant_kind` is the largest kind, or `null` for an empty folder. |
| `GET` | `/api/drives/{drive}/folder-tree?root=&type_filter=&depth=1&flat=&include_files=` | Tree nodes `{ kind: "folder" \| "file", name, path, ... }`, folders first. By default, one level of subfolders under `root`, each with `file_count` (subtree, after `type_filter`) and `has_children`. `include_files=true` (default `false`) also returns the files directly under `root` that match `type_filter`, each with `file_id`, `file_type`, `mime_type`. With files hidden, a folder that holds only files has `has_children: false`. `flat=true` returns the whole drive as one flat list, capped at 50,000 entries, and honours `include_files`. `depth` accepts only `1`. `type_filter` takes the listing's `type` values. |
| `GET` | `/api/drives/{drive}/files?path=&recursive=&search=&favorite=&liked=&tag=&type=&trust=&sort=&order=&page=&limit=` | Active files, paginated. `path` matches `folder_path` exactly (direct children); `recursive=true` includes the subtree, and with an empty `path` the whole drive. `search` (max 200 chars) matches title or folder path; each item then carries `match_source`: `filename`, `path` or `both`. `favorite` and `liked` take `true` / `false`. `tag` matches a tag name, case-insensitive. `trust` is `verified`, `unverified`, or `unreviewed` (files no viewer has ruled on, in either tier). `sort` is `created_at` (default), `title`, `file_size`, `liked_at`, `updated_at` or `random`; `order` is `desc` (default) or `asc`. `updated_at` changes on any row update, including tags, favourite and thumbnail. `type` is `video`, `image`, `audio`, `document`, `archive`, `other`, `text`, `pdf` or `subtitle`; `markdown` is accepted as an alias of `text`; anything else is `422`. `document` includes `text` and `pdf`. `text` is mime `text/markdown` or a name ending `.md`, `.markdown` or `.txt`. `pdf` is `application/pdf` or `.pdf`. |
| `GET` | `/api/drives/{drive}/files/by-path?path=...` | One active file by its exact drive-relative path. `404` when none matches. |
| `POST` | `/api/drives/{drive}/files` | Create a file with text content. Body `{ "path": "<rel>", "content": "<utf-8 text>", "conflict_mode": "rename" \| "error" }`. `rename` (default) adds a suffix on collision (`foo.md` → `foo (1).md`); `error` returns `409` instead. Any extension; 1 MB cap; `400` on traversal. `201` on creation; `200` when, in `rename` mode, it revived a Missing row at the same path. A Markdown file's links are synced into relations as on the content `PUT`. |
| `GET` | `/api/drives/{drive}/tags?folder_path=&path=&type=` | `[{ name, count }]`. `folder_path` counts only files in that folder's subtree; `path` only files directly in that folder (`path=` is the drive root) and omits tags none of them carry. `type` counts only files of that kind and omits tags none of them carry. |
| `GET` | `/api/drives/{drive}/folder-counts?type=` | `[{ path, count }]`: active files per exact `folder_path`, optionally of one kind, ordered by path. The root is `""`. Folders with no matching file are absent. |
| `GET` | `/api/drives/{drive}/duplicates` | `{ groups: [{ hash, total_size, files }], total_groups, total_wasted_bytes }`. Files are grouped by content hash and size. Not paginated. |
| `GET` | `/api/drives/{drive}/watch-history?limit=&filter=&type=` | This viewer's recently opened files in the drive, newest first, each with `watch_progress: { position, duration }`. `filter=unfinished` (default) keeps files played to less than 90 %, which leaves out files that were only opened; `filter=all` keeps everything. `type` takes the listing's values and applies before `limit` (default 20, max 50). `{ "data": [] }` without a viewer identity. |
| `GET` | `/api/drives/{drive}/addon-policies` | `{ "addons": { "<name>": { "default": bool, "features": { ... } } } }` for this drive. A malformed `drives.json` is `500`. |
| `GET` | `/api/drives/{drive}/pins` | Pinned folders: `[{ path }]`. |
| `POST` | `/api/drives/{drive}/pins` | Body `{ path }`. `201`; `409` if already pinned. |
| `DELETE` | `/api/drives/{drive}/pins?path=...` | Unpin (`204`; `404` if not pinned). |
| `POST` | `/api/drives/{drive}/scan` | Rescan the drive and return `{ added, missing, recovered, updated, total }`. Only one scan runs at a time across all drives; `409` while one is running. |

## Files

File ids are 12-character nanoids and are validated as such in the path.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/files/{id}` | File metadata, plus detected subtitle tracks and `has_chapters`. |
| `PUT` | `/api/files/{id}` | Update `title` / `description`. |
| `GET` | `/api/files/{id}/neighbors?sort=&order=` | `{ prev_id, next_id, position, total }` within the file's folder. `sort` is `created_at` (default), `title`, `file_size` or `liked_at`; anything else is `422`. The sequence is the folder's active files that have a value in the sort column; it ignores every listing filter and `recursive`. `position` (1-based) and `total` count that sequence. A file with no value in the sort column (an unliked file under `liked_at`) gets all four fields `null`. |
| `GET` | `/api/files/{id}/stream?download=` | The file's bytes, with `Range` support (`206`, or `416` on a bad range). `410` for a Missing file. Every response carries `X-Content-Type-Options: nosniff`. `text/html`, `application/xhtml+xml`, `image/svg+xml`, `text/xml`, `application/xml` and `application/xslt+xml` are always sent as `Content-Disposition: attachment`; `download=true` does the same for any file, and is the download path. HEIC/HEIF is converted to JPEG. A `text/markdown` or `text/plain` file of 1 MB or less, requested without `Range`, comes back whole with an `ETag` to send as `If-Match` on the content `PUT`. |
| `GET` | `/api/files/{id}/render` | A `text/html` file (`404` otherwise) as a sandboxed document for an iframe, with `Content-Security-Policy: sandbox allow-scripts allow-popups; default-src 'none'; ...` and an injected script that posts its `scrollHeight` to the parent. UTF-8 only (`415`), 5 MB cap (`413`). |
| `GET` | `/api/files/{id}/preview-text` | The first 400 characters of a `.docx` / `.xlsx` / `.pptx` file as `text/plain`. `400` for any other mime. |
| `GET` | `/api/files/{id}/thumbnail` | JPEG, at most 320 px on the long edge; video and PDF thumbnails are 320x180. Carries an `ETag` and `Cache-Control: no-cache`; send the `ETag` as `If-None-Match` to get `304` when unchanged. Falls back to a placeholder image. Served for trashed and Missing files too. |
| `GET` | `/api/files/{id}/exif` | `{ datetime_original, make, model, f_number, exposure_time, iso_speed, focal_length, gps_lat, gps_lon }`. `404` when there is no EXIF data. |
| `PUT` | `/api/files/{id}/content` | Replace a `text/markdown` or `text/plain` file's body (`415` for other mimes) with the raw UTF-8 request body, 1 MB cap. Requires `If-Match` with the current ETag (`428` when absent, `412` on mismatch). Send `X-Litloft-Save-Kind: explicit` for a user-initiated save; anything else is recorded as `auto`. Responds `200` with the new `ETag`, and `X-Litloft-Version-Action: created \| collapsed \| promoted \| unchanged` when the version history was touched. For Markdown it adds a frontmatter `id:` when missing and updates the file's tags, aliases, relations and thumbnail from the body. Those updates commit separately, so a failure in one does not undo the write. |
| `GET` | `/api/files/{id}/versions?limit=&offset=` | Version history of a text file: `{ versions: [{ id, created_at, nickname, kind, size_bytes, lines_added, lines_removed }], total, limit, offset }`. `kind` is `auto` or `explicit`. `404` for a file outside the text allowlist. `Cache-Control: no-store`. |
| `GET` | `/api/files/{id}/versions/{version_id}` | `{ id, content, etag }`. `404` for an unknown version, `500` when the stored body cannot be read. |
| `GET` | `/api/files/{id}/versions/{version_id}/diff` | Line diff against the previous version: `{ id, lines: [{ kind: "add" \| "del" \| "context", text }], lines_added, lines_removed }`. |
| `GET` | `/api/files/{id}/wiki-resolutions` | How each `[[X]]` in a Markdown file resolves (`415` for other files): `{ "resolutions": { "<target>": { "kind": "resolved" \| "unresolved" \| "ambiguous", ... } } }`. Resolved entries carry `file_id`, `filename` and `basename`; ambiguous entries carry `candidates`. |
| `PUT` | `/api/files/{id}/tags` | Body `{ tags }`, at most 10. Replaces `File.tags`. It does not edit a Markdown file's frontmatter, where a `.md` file's tags are kept; change those through the content `PUT`. There is no `GET`; tags are on the file response. |
| `PUT` | `/api/files/{id}/trust-tier` | Body `{ tier }`: `verified` or `unverified`. Returns the file. Also stamps `trust_reviewed_at`, which marks the tier as a viewer's decision. Unverified files stay searchable but are not used to ground Ask answers. |
| `GET` | `/api/files/{id}/relations?kind=` | `{ relations: [{ relation_id, kind, direction, origin, created_at, created_by, file }] }`, newest first, both directions. `direction` is `outgoing` when this file is the relation's `file_a`, else `incoming`. `origin` is `markdown` (from a Markdown file's links), `internal` (from the Internal API) or `null`. `file` has `id`, `drive`, `filename`, `title`, `folder_path`, `file_type`, `mime_type`, `thumbnail_url`, `has_thumbnail`, `file_size`, `duration`, `missing_since`, `created_at`, `updated_at`. Trashed counterparts are left out; Missing ones are included. |
| `GET` | `/api/files/{id}/chapters` | `{ chapters: [{ start_time, end_time, title, ordering }], source }`. `source` is `extracted`, `curated` or `null`. |
| `GET` | `/api/files/{id}/subtitles/{index}` | One detected sidecar subtitle as WebVTT (SRT is converted). Video and `.loft` files only. 5 MB cap (`413`). |
| `GET` | `/api/files/{id}/archive` | Entries of a zip file, up to 10,000. `404` when the file is not an archive. |
| `GET` | `/api/files/{id}/archive/entry?path=...` | One entry's bytes. Symlink entries and traversal are `400`; entries over 50 MB (declared or decompressed) are `413`. Images and plain text are served inline, everything else as an attachment. |
| `GET` | `/api/files/{id}/comments` | Comments, oldest first, each with `is_mine`. |
| `POST` | `/api/files/{id}/comments` | Body `{ body }`, 1 to 1000 characters. `201`. Needs a viewer identity (`401`). 10 per 60 s per IP (`429`); `422` once a file has 500 comments. |
| `PUT` | `/api/files/{id}/comments/{cid}` | Edit your own comment (`403` otherwise). |
| `DELETE` | `/api/files/{id}/comments/{cid}` | Delete your own comment (`204`; `403` otherwise). |
| `POST` | `/api/files/{id}/progress` | Body `{ position?, duration? }`. Always updates `last_played_at`; the playback position is updated only when both fields are sent. An empty body records a view. |
| `GET` | `/api/files/{id}/progress` | `{ position, duration }`; zeros when there is no record or no viewer identity. |
| `DELETE` | `/api/files/{id}/progress` | Remove this viewer's history row for the file (`204`). |
| `POST` | `/api/files/{id}/like` | Toggle the like. Liking sets `liked_at` to now, so a re-liked file sorts first in the Liked view. |
| `POST` | `/api/files/{id}/favorite` | Toggle the favourite flag. |
| `POST` | `/api/files/{id}/restore` | Restore from trash. |
| `DELETE` | `/api/files/{id}` | Move to trash. |
| `DELETE` | `/api/files/{id}/purge` | Delete permanently, from disk too. Accepts a trashed or Missing file. |
| `PUT` | `/api/files/{id}/rename` | Body `{ "new_filename": "..." }`. |
| `PUT` | `/api/files/{id}/move` | Body `{ "target_drive": null, "target_folder_path": "..." }`. `null` or `""` means the file's current drive. A `target_drive` the caller cannot access is `404`, the same as one that does not exist. |
| `POST` | `/api/files/{id}/copy` | Same body and the same `404` as move. |

### Batch operations

Batch endpoints take `{ "ids": [...] }`, 1 to 100 ids, plus the fields named below.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/files/batch/get` | The files the caller can access, as a list. |
| `POST` | `/api/files/batch/delete` | Move to trash. `{ deleted, errors }`. |
| `PUT` | `/api/files/batch/move` | Adds `target_drive` / `target_folder_path`. `{ moved, errors }`. An inaccessible `target_drive` fails the whole request with `404`. |
| `PUT` | `/api/files/batch/tags` | Adds the given tags to each file. The single-file `PUT` replaces them instead. `{ updated, errors }`. |
| `PUT` | `/api/files/batch/rename` | Adds `mode` (`template`, `regex` or `prefix_suffix`) and that mode's fields: `template`, `start_number`, `zero_pad`; `pattern`, `replacement`; `action`, `value`. `{ renamed, results: [{ id, old_name, new_name }] }`. Unlike the others, one inaccessible id fails the whole request with `404`. |
| `POST` | `/api/files/batch/restore` | Restore from trash. `{ restored, errors }`. |
| `POST` | `/api/files/batch/purge` | Delete trashed or Missing files permanently. `{ purged, errors }`. |
| `POST` | `/api/files/batch/copy` | Adds `target_drive` / `target_folder_path`. `{ copied, errors }`. An inaccessible `target_drive` fails the whole request with `404`. |

`errors` lists the ids that failed and why; the rest of the batch still runs.

## Folder operations

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/drives/{drive}/folders` | Body `{ "path": "<parent>", "name": "..." }`. |
| `PUT` | `/api/drives/{drive}/folders` | Rename. Body `{ "path": "...", "new_name": "..." }`. |
| `PUT` | `/api/drives/{drive}/folders/move` | Body `{ "path": "...", "target_path": "..." }`. |
| `DELETE` | `/api/drives/{drive}/folders?path=...` | Move the folder's active files to trash. The drive root cannot be deleted (`400`). |

These emit the `folders.*` events, plus `files.moved` when a rename or move changed file paths. See [WebSocket events](websocket-events.md).

## Search

Keyword search is the `search` parameter of `GET /api/drives/{drive}/files`. Semantic search belongs to the intelligence addon. Saved searches are Smart Folders, shared by everyone who can open the drive:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives/{drive}/smart-folders` | The drive's Smart Folders, newest first. |
| `POST` | `/api/drives/{drive}/smart-folders` | Body `{ name, query, file_type?, sort_by?, sort_order? }`. `201`. |
| `PATCH` | `/api/drives/{drive}/smart-folders/{id}` | Update any of those fields. |
| `DELETE` | `/api/drives/{drive}/smart-folders/{id}` | `204`. |

## Trash and missing

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives/{drive}/trash?sort=&order=&page=&limit=` | Trashed files, paginated. `sort` is `deleted_at` (default), `created_at`, `title` or `file_size`. |
| `POST` | `/api/drives/{drive}/trash/empty` | Delete the drive's trash permanently. `{ "purged": n }`. |
| `GET` | `/api/drives/{drive}/missing?sort=&order=&page=&limit=` | Missing files, paginated. `sort` is `missing_since` (default), `created_at`, `title` or `file_size`. |
| `POST` | `/api/drives/{drive}/missing/purge-all` | Delete every Missing record in the drive. `{ "purged": n }`. |

## Collections

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/drives/{drive}/collections` | Most recently updated first. |
| `POST` | `/api/drives/{drive}/collections` | Body `{ name, description? }`. `201`; `409` on a duplicate name in the drive. |
| `GET` | `/api/drives/{drive}/collections/{id}` | The collection with its items. |
| `PUT` | `/api/drives/{drive}/collections/{id}` | Body `{ name?, description? }`. |
| `DELETE` | `/api/drives/{drive}/collections/{id}` | `204`. |
| `POST` | `/api/drives/{drive}/collections/{id}/items` | Body `{ "file_ids": [...] }`, 1 to 100. Ids already in the collection are skipped. A Missing or trashed file is `404`, a file from another drive `400`. Returns the collection with its items. |
| `DELETE` | `/api/drives/{drive}/collections/{id}/items/{item_id}` | `204`. |
| `PUT` | `/api/drives/{drive}/collections/{id}/items/reorder` | Body `{ "item_ids": [...] }`, exactly the current items in the new order (`409` otherwise). |

## Upload

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/drives/{drive}/upload/init` | Body `{ filename, file_size, folder_path, relative_path, chunk_size }`; `chunk_size` defaults to 5 MiB. Returns `{ upload_id, chunk_size, total_chunks }`. |
| `POST` | `/api/drives/{drive}/upload/{upload_id}/chunk` | `multipart/form-data` with `chunk_index` and `chunk`. Returns the received and total chunk counts. |
| `POST` | `/api/drives/{drive}/upload/{upload_id}/complete` | Finish and return the file. An upload to the path of a Missing file revives that record. |
| `DELETE` | `/api/drives/{drive}/upload/{upload_id}` | Cancel. |

An upload session belongs to the drive it was opened on; using it under another drive is `404`.

## Viewer identity and watch progress

There is no profile or account API. The nickname in the `lit_viewer` cookie or `X-Lit-Viewer` header is hashed into a `viewer_id`, and watch history and comment ownership are keyed by it. Requests without a nickname are accepted: progress writes do nothing and return `204`, and history reads come back empty.

Per-viewer endpoints: `POST` / `GET` / `DELETE /api/files/{id}/progress` and `GET /api/drives/{drive}/watch-history`.

## Admin

`/api/admin/dashboard` and `/api/admin/markdown-images/...` require an admin caller (`403` otherwise; see `is_admin` under [Auth](#auth)). Under `/api/admin/config`:

- `setup-status` and `setup-token/verify` need no auth.
- The `GET` routes require an admin caller.
- The writes and `complete-setup` require an admin caller once `data/setup_completed` exists, and the setup token in `X-Litloft-Setup-Token` until then.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/dashboard` | `{ drives, system }`. Each drive: `name`, `file_count`, `file_types`, `last_scanned_at`, `is_scanning`. `system`: `filesystems` (one row per mounted filesystem, with `mount_label`, `total_bytes`, `used_bytes`, `free_bytes` and the `drives` on it), `db_size_bytes`, `thumbnail_cache_bytes`, `converted_cache_bytes`, `upload_temp_bytes`, `total_files`, `trash_count`, `missing_count`, `uptime_seconds`. |
| `GET` | `/api/admin/config/setup-status` | `{ completed, drives }`. `drives` (`name`, `path`, `access_group`) is filled only while setup is incomplete. |
| `POST` | `/api/admin/config/setup-token/verify` | Body `{ token }` → `{ ok: true }`, or `403 setup_token_invalid`. `404` once setup is complete. |
| `POST` | `/api/admin/config/complete-setup` | Create `data/setup_completed`. `409 already_completed` if it exists. |
| `GET` | `/api/admin/config/drives` | `drives.json` as stored, including addon policy. |
| `PUT` | `/api/admin/config/drives` | Replace `drives.json`. Each entry needs a unique `name` and an absolute `path` that exists in the container. Returns `{ ok, count }`. |
| `GET` | `/api/admin/config/passwords` | `[{ password: "***", groups }]`. Real passwords are never returned. |
| `PUT` | `/api/admin/config/passwords` | Replace `passwords.json`. `***` is rejected as a value. Passwords must be unique. Each `groups` entry must be a drive's `access_group` or `__admin__`, which grants `/admin` without unlocking a drive. Once setup is complete, writing an entry with `__admin__` needs a caller holding `__admin__` (`403 admin_grant_forbidden`). Returns `{ ok, count }`. |
| `POST` | `/api/admin/config/passwords/append` | Add one `{ password, groups }` entry, validated and gated the same way. Returns `{ ok, count }`. |
| `DELETE` | `/api/admin/config/passwords/{index}` | Remove the entry at that 0-based index (`404` when out of range). |
| `GET` | `/api/admin/config/addon-policy` | `{ "<drive>": { "<addon>": bool \| { feature: bool } } }`. Drives without an `addons` field appear with `{}`. |
| `PUT` | `/api/admin/config/addon-policy` | Same shape. Each listed drive's `addons` is replaced; other drives and fields are kept. Unknown drives and addons are `422`. |
| `GET` | `/api/admin/config/restart-status` | `{ pending, files }`. `pending` is true after any successful write to `drives.json` or `passwords.json` through these routes, until the backend restarts. |

Validation errors from these routes are `422` with `{ "detail": { "code", "message", "field"? } }`.

### Markdown image import

Copies the remote images a folder's Markdown files reference into the drive and points the files at the local copies. Create an analysis first, then start an import from it.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/markdown-images/analyses` | Body `{ drive, folder_path, recursive }`. Returns `analysis_id`, `expires_at` (30 minutes later), `counts`, `host_counts` and `samples`. |
| `POST` | `/api/admin/markdown-images/imports` | Body `{ analysis_id, allowed_hosts }`; only images on those hosts are fetched. `202`. `404 analysis_not_found` for an expired or unknown id, `409 maintenance_busy` while another job runs. |
| `GET` | `/api/admin/markdown-images/imports/current` | `{ "job": ... }`, or `{ "job": null }`. |
| `GET` | `/api/admin/markdown-images/imports/{job_id}` | The job (`404 job_not_found`). |
| `POST` | `/api/admin/markdown-images/imports/{job_id}/cancel` | Request cancellation; returns the job. |

## Addons

Addon endpoints live under `/api/addons/<name>/`. An in-process addon (cloud-sync, media_import) serves them from its own router. An external-service addon (intelligence, knowledge) is reached through the core's proxy, which:

- reads the drive from the `X-Lit-Drive` header (percent-encoded). A `scope=drive` route without it is `400`; a drive the caller cannot access is `403`. A route marked `drive_optional` is gated another way.
- runs the route's pre-checks (file access, per-drive addon policy, admin). A route whose addon feature is off for the drive is `404`.
- removes items from inaccessible drives from the response.
- returns `404` for an unknown addon or route, `503` when the addon's target is not configured, `502` when the addon does not answer.

Examples:

- `GET /api/addons/intelligence/search?q=...`
- `POST /api/addons/intelligence/ask`
- `POST /api/addons/intelligence/refine/files/{id}`
- `POST /api/addons/knowledge/clips`
- `GET /api/addons/cloud-sync/status`
- `POST /api/addons/media_import/link`

Each addon's page under [`docs/addons/`](../addons/) documents its endpoints.

## Internal API

For addons, on the Docker network only: the frontend server answers `/api/internal/*` with `404`.

In the Auth column, none means no secret. With secret, `X-Internal-Secret` must equal `CORE_INTERNAL_SECRET` when that variable is set, and is not checked when it is unset. Strict uses the same header, but an unset `CORE_INTERNAL_SECRET` is `503`. A wrong secret is `403`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/internal/accessible-drives` | none | `{ drives: [...] }`: drive names the forwarded credential (cookie or Bearer) can access. With no credential, public drives only. |
| `GET` | `/api/internal/drive-policy?drive=&addon=` | none | `{ default, features }` for one addon on one drive. Both parameters required; `404` for an unknown drive. |
| `GET` | `/api/internal/files/{id}` | none | `{ id, drive, filename, file_type, folder_path, thumbnail_path, updated_at }` of an active file. |
| `GET` | `/api/internal/files/{id}/content` | secret | The file's text. `text/markdown` and `text/plain` only (`415`), UTF-8 only (`415`), capped at `CORE_INTERNAL_CONTENT_MAX_BYTES` (default 10 MB, `413`). |
| `POST` | `/api/internal/files/{id}/tags` | secret | Body `{ tags }`. Replaces `File.tags` (`204`). |
| `PUT` | `/api/internal/files/{id}/chapters` | strict | Body `{ chapters: [{ start_time, end_time, title }] }`. Replaces the chapter set (`204`); core assigns the ordering and sets `source=curated`. `422` when no entry is valid. |
| `PUT` | `/api/internal/files/{id}/trust-tier` | strict | Body `{ tier }`. Sets the tier at ingest (`204`) without stamping `trust_reviewed_at`. `409` when a viewer has already ruled on the file. |
| `GET` | `/api/internal/viewer-history?viewer_id=&drive=&kind=&after=&before=` | secret | `{ file_ids }`: files in `drive` the viewer has (`kind=viewed`, default) or has not (`kind=not_viewed`) opened, optionally within an ISO-8601 `after` / `before` window. `viewer_id` is 16 hex characters. `404` for an unknown drive. |
| `POST` | `/api/internal/filter-file-ids` | none | Body `{ file_ids, trust_tier? }` → `{ accessible, trust_filtered }`: the active ids on drives the forwarded credential can access, optionally only those of that tier. `trust_filtered` says whether the tier filter was applied. |
| `POST` | `/api/internal/files/bulk-state` | none | Body `{ file_ids }` → `{ statuses: [{ id, drive, state }], not_found }`. `state` is `active`, `missing` or `trash`. |
| `POST` | `/api/internal/files/bulk` | none | Body `{ file_ids }` → `{ files, not_found }`. Full file responses for active ids, with `subtitles` empty; trashed and Missing ids are in `not_found`. |
| `POST` | `/api/internal/file_relations` | secret | Body `{ file_id_a, file_id_b, kind, viewer_id? }`. `201` with the relation. Both files must be in the same drive (`400`); `409` if it exists. |
| `GET` | `/api/internal/file_relations?file_id=&drive=&kind=&limit=` | none | Relations touching `file_id` in either direction, or all relations in `drive`. One of the two is required (`400`). `limit` defaults to 5000, max 20000. |
| `DELETE` | `/api/internal/file_relations/{id}` | secret | `204`. |
| `POST` | `/api/internal/restart-pending` | secret | Body `{ source, reason? }`. Sets the restart-pending flag the admin banner reads (`204`). |
| `POST` | `/api/internal/addon-events` | secret | Body `{ event, data, drive? }`. Broadcasts the event to browsers (`204`). See [WebSocket events](websocket-events.md#addon-events). |

The rules a new endpoint must pass are in [Internal API policy](../developer-guide/addon-dev.md#internal-api-policy).

## WebSocket

`/api/ws`. See [WebSocket events](websocket-events.md).
