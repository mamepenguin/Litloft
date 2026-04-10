# HomeVault — Feature List

A self-hosted file manager and media streaming web app for home LAN.

## Architecture

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12) + SQLite + ffmpeg |
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Infrastructure | Docker Compose (2 containers) |
| Deployment | Docker Compose |

```
Browser → :3000 (Next.js) → rewrites /api/* → :8000 (FastAPI)
```

---

## File Browsing

### Multi-Drive Support
- Register multiple storage locations as logical drives via `drives.json`
- Each drive is fully independent (tags, favorites, search are scoped per drive)
- Per-drive `readonly: true` to disable write operations
- Drive list displayed on the home page (`/`)

### Folder Navigation
- Browse the filesystem's folder structure as-is
- Breadcrumb navigation with hierarchy
- File count per folder
- Empty folders are preserved (managed via EmptyFolder table)

### File List
- **Grid view** / **List view** toggle (persisted in localStorage)
- Sort: newest / oldest / title / file size
- Pagination (30 items/page)
- File type icons (video / image / audio / document / other)
- Duration badge for video and audio files

### File Type System
- All files managed in a unified `File` table
- Two-column classification: `file_type` (category) and `mime_type` (detail)
- Auto-scan all drives on startup (hidden files excluded)
- Video: ffprobe for duration + ffmpeg for thumbnail generation
- Audio: ffprobe for duration
- `mimetypes` + custom mappings for extension-based classification

---

## File Operations

### Upload
- **Drag & drop** file upload (drop zone overlay)
- **Upload button** for file picker dialog
- **Folder upload**: preserves folder structure
- Chunked upload (5MB chunks, up to 2GB)
- Per-file progress bar
- Max 2 concurrent uploads
- Auto-generates thumbnail + duration for uploaded videos
- Rejects duplicate filenames
- Upload cancellation support
- Stale uploads auto-cleaned on startup (24h threshold)

### Download
- Download via streaming endpoint
- Range Request support (resumable for large files)
- Content-Type dynamically determined from mime_type
- Filename sent with RFC 5987 encoding

### File Rename
- Rename dialog
- Updates filesystem + DB + thumbnail path simultaneously
- Title auto-generated from filename

### File Move
- Folder picker dialog (tree browser)
- Cross-drive moves supported
- Updates filesystem + DB simultaneously

### File Copy
- Copy files to another drive/folder
- Creates new filesystem entry + DB record

### Clipboard Operations
- Copy / Cut / Paste for file organization
- Multi-file selection support

### Batch Operations
- Batch fetch multiple files
- Batch soft-delete
- Batch move
- Batch tag assignment
- Batch rename (regex pattern support)
- Batch restore from trash
- Batch purge (permanent delete)
- Batch copy

### Trash (Soft Delete)
- File deletion moves to trash (filesystem unchanged)
- Folder deletion soft-deletes all contents
- Trash list with sort and pagination
- Individual or batch restore
- Empty trash (bulk permanent delete)
- **Auto-purge**: physically deletes files after 30 days (on startup + every 24h)

### Create Folder
- **New Folder button** with inline input
- Filename validation (path separators, hidden files, length limit)

### Rename Folder
- Rename dialog
- Bulk SQL update for all file paths within the folder
- Thumbnail paths updated accordingly

### Move Folder
- Move folder to a different path
- Bulk update of all descendant file paths

### Delete Folder
- Soft-deletes folder contents recursively
- Confirmation dialog

---

## Metadata & Organization

### Favorites
- Per-file favorite toggle (star icon)
- Favorites list (`?view=favorites`)
- One-click access from sidebar

### Tags
- Up to 10 tags per file
- Tag names: max 30 chars, alphanumeric + underscore + hyphen
- Auto-lowercase normalization, deduplication
- Tag list with counts in sidebar
- Click to filter by tag
- Autocomplete from existing tags
- Orphan tag auto-cleanup

### Like / Dislike
- Vote on file detail page
- Count display

### Metadata Editing
- Inline editing of title and description

### Pinned Folders
- Pin frequently used folders (bookmarks)
- Pinned folders shown in sidebar
- Managed independently per drive

### Duplicate Detection
- Hash-based duplicate file detection
- Grouped duplicate list
- Wasted storage calculation

---

## Video Playback

### Streaming
- Native HTML5 `<video>` player
- Range Request support (seekable)
- Auto-generated thumbnails (ffmpeg `thumbnail=300` filter for representative frame, skips first 10% intro)
- `?t=` URL parameter to seek to specific time

### Subtitles / Captions
- Display embedded subtitle tracks
- Automatic SRT to VTT conversion
- Subtitle stream selection by index

### Cast
- Cast button via Remote Playback API

### Preview System
- `FilePreview` component branches by file_type
- Video: VideoPlayer with live preview on hover
- Image: preview with prev/next navigation
- Archive: ZIP content listing + individual entry extraction
- Other: file info display

### Prev/Next Navigation
- Navigate to adjacent files on file detail page
- Respects current sort order

---

## Playlists

- User-created playlists (managed per drive)
- Playlist list view
- Create / rename / delete playlists
- Add / remove / reorder items
- Automatic folder playback

---

## Comments / Notes

- Per-file comments (requires profile setup)
- Comment list view
- Edit / delete (author only)
- Rate limit: 10 per 60s per IP, max 500 per file

---

## Watch History & Profiles

### Profiles
- **Nickname-based**: no account required, server-side SHA-256 hash to viewer_id
- Without profile: localStorage fallback (no server storage)
- No profile listing API (privacy by design)

### Watch History
- Auto-save/restore playback position (resume playback)
- Recently played files on drive home
- Unfinished video filter
- Manual progress clearing

---

## Search

### Global Search
- **Cmd+Shift+F** or sidebar search icon to open
- Recursive filename search across entire drive
- 300ms debounce for API calls
- Up to 200 results (file type icon + path + thumbnail)
- Click to navigate to file detail page
- Escape to close

### Semantic Search (addon)
- Text embedding-based semantic search
- Whisper video transcription + transcript search
- CLIP frame-level image search
- Similar file detection (similarity score + keyword display)
- Search index status and management UI
- RRF vs cosine similarity comparison debug UI

### Ask / RAG (addon)
- Natural-language question answering over indexed files with citations
- Reuses the semantic search engine as the retriever, then asks the LLM for an answer grounded in retrieved file excerpts
- On-demand only (no cache, no worker); exposed as the `ask` tab in global search

---

## UI / UX

### Sidebar
- **Library**: Home, Favorites, All Files
- **Tags**: Tag list with counts (per drive)
- **Pinned Folders**: Shortcuts to pinned folders
- **Drives**: Drive list (current drive highlighted)
- **Addons**: Links to enabled addons (dynamic)
- Mobile: hamburger menu toggle

### Context Menu
- File: right-click for Download / Rename / Move / Delete
- Folder: right-click for Rename / Move / Delete
- Mobile: long-press (500ms) to trigger
- Auto-repositioning at screen edges

### Theme
- Light / Dark / System-follow (3-mode toggle)
- CSS variable-based design tokens

### PWA
- `manifest.json` + apple-mobile-web-app-capable
- Add to home screen support

### Internationalization (i18n)
- Japanese / English (next-intl)
- Cookie-based locale switching (no URL prefix)

---

## Security

### Access Control
- **Password protection**: per-drive access control via `passwords.json`
- **Protected drive invisibility**: completely excluded from API responses when locked (404, not 403)
- **`/unlock` page**: no UI link, accessible only by URL
- **JWT authentication**: `hv_token` cookie for drive access control
- **Remember option**: "Remember this device" valid for 1 year

### Input Validation & Defense
- **Path traversal prevention**: `os.path.realpath()` + base_dir boundary check on all file operations
- **Filename sanitization**: `<>:"/\|?*\x00` forbidden, no `.` prefix, 255 char limit
- **Readonly drives**: per-drive write protection via `drives.json`
- **Upload safety**: 2GB file size limit, chunk size validation, temp directory isolation
- **Content-Disposition**: RFC 5987 encoding to prevent header injection
- **SQL injection prevention**: parameterized queries, LIKE escaping
- **Scan exclusion control**: asyncio.Lock for concurrent execution prevention
- **Comment rate limiting**: 10 per 60s per IP
- **Archive extraction**: ZIP bomb prevention (50MB decompressed limit)

---

## Admin

### Health Check Dashboard (`/admin`)
- Per-drive file count and disk usage
- Scan status
- System uptime
- Trash file count
- Cache sizes

### Search Compare (`/admin/search-compare`)
- Semantic search algorithm comparison debug UI

---

## Addons

Plugin-based feature extension. Two addon architectures supported.

### In-Process Addons
Run within the main backend process. Enable/disable via symlinks.

| Addon | Description | Page |
|-------|-------------|------|
| cloud-sync | Cloud storage synchronization | `/cloud-sync` |
| downloader | Download files by URL (yt-dlp support) | `/download` |
| podcast | Generate RSS feeds from folders | `/podcast` |

### Standalone Service Addons
Run as separate Docker containers. Added via `docker-compose.override.yml`.

| Addon | Description | Port |
|-------|-------------|------|
| intelligence | Semantic search, CLIP analysis, Whisper transcription, LLM auto-tags, BLIP captioning, RAG Q&A | :8100 |

### Event Hooks
- Core emits `files.deleted`, `files.restored`, `files.purged`, `scan.complete` events
- Listener URLs configured in `event-hooks.json`
- No-op if config file is absent

---

## WebSocket

- Real-time event notifications (scan progress, upload completion, etc.)
- JWT cookie-based filtering for protected drive notifications
- Unauthenticated connections allowed (for all-public mode)

---

## Infrastructure & Deployment

### Docker Compose
- **backend**: FastAPI (expose 8000, internal only)
- **frontend**: Next.js (ports 3000, sole entry point)
- Backend healthcheck → frontend uses `depends_on: condition: service_healthy`
- Drive directories mounted via volumes (readonly controlled by drives.json)
- `data/` persists SQLite DB + thumbnail images

### Updating
- `git pull && docker compose up -d --build`
- Current version preserved on build failure

---

## Testing

| Target | Framework |
|--------|-----------|
| Backend | pytest (run inside Docker) |
| Frontend | Vitest 3 + jsdom 25 + React Testing Library |
| E2E | Playwright |

---

## API Endpoints

### Health Check

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |

### Authentication (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/unlock | Unlock drive access with password |
| POST | /api/auth/lock | Lock (logout) |
| GET | /api/auth/status | Get unlock status and protected drive info |

### Drives (`/api/drives`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives | List drives |
| GET | /api/drives/{drive}/folders?path= | List folders |
| GET | /api/drives/{drive}/files?path=&search=&sort=&order=&page=&limit=&favorite=&tag=&type= | List files |
| GET | /api/drives/{drive}/tags | List tags |
| POST | /api/drives/{drive}/folders | Create folder |
| PUT | /api/drives/{drive}/folders | Rename folder |
| PUT | /api/drives/{drive}/folders/move | Move folder |
| DELETE | /api/drives/{drive}/folders?path= | Delete folder |
| POST | /api/drives/{drive}/scan | Trigger scan |

### Pinned Folders (`/api/drives/{drive}/pins`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/pins | List pinned folders |
| POST | /api/drives/{drive}/pins | Pin a folder |
| DELETE | /api/drives/{drive}/pins | Unpin a folder |

### Trash (`/api/drives/{drive}/trash`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/trash?sort=&order=&page=&limit= | List trashed files |
| POST | /api/drives/{drive}/trash/empty | Empty trash |

### Watch History (`/api/drives/{drive}/watch-history`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/watch-history?limit=&filter= | List watch history |

### Duplicate Detection (`/api/drives/{drive}/duplicates`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/duplicates | List duplicate file groups |

### Upload (`/api/drives/{drive}/upload`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/drives/{drive}/upload/init | Initialize upload |
| POST | /api/drives/{drive}/upload/{id}/chunk | Send chunk |
| POST | /api/drives/{drive}/upload/{id}/complete | Complete upload |
| DELETE | /api/drives/{drive}/upload/{id} | Cancel upload |

### File Operations (`/api/files`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/files/{id} | Get file details |
| PUT | /api/files/{id} | Edit metadata |
| GET | /api/files/{id}/stream | Stream / download |
| GET | /api/files/{id}/thumbnail | Get thumbnail |
| GET | /api/files/{id}/neighbors?sort=&order= | Get prev/next file IDs |
| POST | /api/files/{id}/like | Like |
| POST | /api/files/{id}/dislike | Dislike |
| POST | /api/files/{id}/favorite | Toggle favorite |
| PUT | /api/files/{id}/tags | Edit tags |
| PUT | /api/files/{id}/rename | Rename |
| PUT | /api/files/{id}/move | Move |
| POST | /api/files/{id}/copy | Copy |
| DELETE | /api/files/{id} | Soft delete (move to trash) |
| POST | /api/files/{id}/restore | Restore from trash |
| DELETE | /api/files/{id}/purge | Permanently delete |

### Archive (`/api/files/{id}/archive`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/files/{id}/archive | List archive contents (ZIP, Shift_JIS support) |
| GET | /api/files/{id}/archive/entry?path= | Extract archive entry |

### Subtitles (`/api/files/{id}/subtitles`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/files/{id}/subtitles/{index} | Get subtitle (VTT format, auto SRT conversion) |

### Batch Operations (`/api/files/batch`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/files/batch/get | Batch fetch files |
| POST | /api/files/batch/delete | Batch soft-delete |
| PUT | /api/files/batch/move | Batch move |
| PUT | /api/files/batch/tags | Batch set tags |
| PUT | /api/files/batch/rename | Batch rename (regex) |
| POST | /api/files/batch/restore | Batch restore |
| POST | /api/files/batch/purge | Batch permanent delete |
| POST | /api/files/batch/copy | Batch copy |

### Watch Progress (`/api/files/{id}/progress`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/files/{id}/progress | Save playback position |
| GET | /api/files/{id}/progress | Get playback position |
| DELETE | /api/files/{id}/progress | Clear playback position |

### Comments (`/api/files/{id}/comments`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/files/{id}/comments | List comments |
| POST | /api/files/{id}/comments | Post comment |
| PUT | /api/files/{id}/comments/{comment_id} | Edit comment |
| DELETE | /api/files/{id}/comments/{comment_id} | Delete comment |

### Playlists (`/api/drives/{drive}/playlists`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/playlists | List playlists |
| POST | /api/drives/{drive}/playlists | Create playlist |
| GET | /api/drives/{drive}/playlists/{id} | Get playlist details |
| PUT | /api/drives/{drive}/playlists/{id} | Rename playlist |
| DELETE | /api/drives/{drive}/playlists/{id} | Delete playlist |
| POST | /api/drives/{drive}/playlists/{id}/items | Add items |
| DELETE | /api/drives/{drive}/playlists/{id}/items/{item_id} | Remove item |
| PUT | /api/drives/{drive}/playlists/{id}/items/reorder | Reorder items |

### Search (`/api/search`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/search?q=&drive= | Search files (filename + semantic) |
| GET | /api/search/status | Search service status |
| POST | /api/search/queue/{action} | Queue control (pause/resume/reindex) |
| POST | /api/search/queue/prioritize | Prioritize file indexing |
| GET | /api/search/similar/{file_id} | Find similar files |
| GET | /api/search/files/{file_id}/transcript | Get video transcript |
| GET | /api/search/files/{file_id}/index-details | Get index metadata |
| GET | /api/search/files/{file_id}/clip-timestamps | Get CLIP timestamp data |
| GET | /api/search/files/{file_id}/frame?t= | Extract video frame |

### Admin (`/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/dashboard | System dashboard |

### Addons (`/api/addons`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/addons/status | List enabled addons |

### WebSocket

| Path | Description |
|------|-------------|
| /api/ws | Real-time event notifications |
