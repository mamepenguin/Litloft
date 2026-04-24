# Litloft — Feature List

A self-hosted file manager and media streaming web app for home LAN.

## Architecture

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12) + SQLite + ffmpeg |
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Infrastructure | Docker Compose (2 core containers + addon containers) |
| Deployment | Docker Compose |

```
Browser → :3000 (Next.js) → rewrites /api/* → :8000 (FastAPI, internal only)
                         └── proxies /api/ws  → :8000 (WebSocket)
```

---

## File Browsing

### Multi-Drive Support
- Register multiple storage locations as logical drives via `drives.json`
- Each drive is fully independent (tags, favorites, search are scoped per drive)
- Per-drive `readonly: true` to disable write operations
- Per-drive `access_group` for password-gated access
- Per-drive `addons: { <name>: bool | { <feature>: bool } }` for granular addon policy
- Drive list displayed on the home page (`/`)

### Folder Navigation
- Browse the filesystem's folder structure as-is
- Breadcrumb navigation with hierarchy
- File count per folder
- Empty folders are preserved (managed via EmptyFolder table)
- Drive-scoped pages live under `/drive/{drive}/...` so addons with `scope=drive` can pick up the current drive via `useCurrentDrive()`

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

### File State Model (Active / Missing / Trash)

Each `File` row can be in one of three mutually-exclusive states, expressed via `deleted_at` and `missing_since` timestamps:

| State | `deleted_at` | `missing_since` | Meaning | Auto-purge |
|-------|--------------|-----------------|---------|------------|
| Active | NULL | NULL | Normal | — |
| Missing | NULL | SET | Not present on FS (NAS disconnected, file moved outside Litloft) | Never |
| Trash | SET | NULL | User-deleted, recoverable | 30 days |

All list queries filter via `active_file_filter()` so missing/trash files are invisible to the browser by default.

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
- If a `missing` file exists at the target path, upload revives the existing row instead of creating a new one (preserves viewer history, tags, transcript, etc.)

### Download
- Download via streaming endpoint
- Range Request support (resumable for large files)
- Content-Type dynamically determined from mime_type
- Filename sent with RFC 5987 encoding

### File Rename / Move / Copy
- Rename, move (cross-drive supported), copy — all update filesystem + DB + thumbnail path atomically
- Folder picker dialog (tree browser) for moves
- Rename auto-regenerates title from filename

### Text File Editing
- Inline editor for text files (`.md`, `.txt`, etc.) via `PUT /api/files/{id}/content`
- Atomic write pattern (`.tmp` → `os.replace`)
- Rejected on readonly drives

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

### Missing Files
- Scanner marks a formerly-visible file as `missing` when the FS entry is gone (instead of physically purging the row)
- Missing files retain viewer history, comments, tags, and addon-generated data (transcripts, embeddings, captions)
- Sidebar shows a "Missing files" link only when `missing_count > 0`
- Dedicated view `?view=missing` for per-file or bulk purge
- Scanner emits `files.missing` on marking and `files.recovered` when the file reappears (`missing_since` cleared)
- Stream requests for missing files return 410 Gone; metadata returns 404; thumbnails still serve cached copies
- Mutations (rename / move / tag / etc.) on missing files return 404
- Adding missing or trashed files to new playlists is rejected; existing playlist entries are preserved with their state for the frontend to display
- Drive-level disappearance is detected (`drive_path.exists() == False` → scanner early-returns) to avoid mass-missing events when a NAS is offline

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
- Tag names: max 30 chars, alphanumeric (incl. CJK) + underscore + hyphen
- Auto-lowercase normalization, deduplication
- Tag list with counts in sidebar
- Click to filter by tag
- Autocomplete from existing tags (drive-scoped, drive = security boundary)
- Orphan tag auto-cleanup
- Tags can be proposed by the intelligence addon (Suggested Tags slot, approve/dismiss workflow — never auto-applied)
- **`.md` files use frontmatter `tags:` as the canonical store** (β rule, spec `2026-04-24-knowledge-tag-unification.md`). UI edits the chip group in place and rewrites the frontmatter; core's `PUT /content` handler projects those tags onto `File.tags` synchronously in the same transaction (Phase 11). Obsidian-style external edits to `.md` are picked up on the next knowledge-addon scanner pass.
- Non-`.md` files (video, image, PDF, etc.) continue to write `File.tags` directly via `PUT /api/files/{id}/tags`.

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

## Media Playback

### Streaming
- Native HTML5 `<video>` / `<audio>` player
- Range Request support (seekable)
- Auto-generated thumbnails (ffmpeg `thumbnail=300` filter for representative frame, skips first 10% intro)
- `?t=` URL parameter to seek to specific time

### Subtitles / Captions
- Display embedded subtitle tracks
- Automatic SRT to VTT conversion
- Subtitle stream selection by index
- Sidecar subtitle files in the same folder (matched by stem with NFC normalization)
- Whisper-generated transcripts (via intelligence addon) served as VTT and selectable as a fallback subtitle track; UI lets the user toggle between embedded and Whisper sources

### Cast
- Cast button via Remote Playback API

### Preview System
- `FilePreview` component branches by file_type
- Video: VideoPlayer with live preview on hover
- Image: preview with prev/next navigation
- Archive: ZIP content listing + individual entry extraction
- Markdown: `MarkdownPreview` with syntax highlighting (highlight.js), GitHub-flavored task lists, and Mermaid diagrams
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
- Missing / trashed items stay in playlists but are flagged to the UI for graceful display

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
- Modes added by addons appear as tabs (`search-modes` slot) — e.g. Semantic Search, Ask

### Semantic Search (intelligence addon)
- Embedding-based retrieval combining 5 parallel channels:
  - Text embedding (multilingual-e5 or Ruri) — query and metadata
  - CLIP embedding (OpenAI / llm-jp CLIP) — image & video frames
  - FTS5 over metadata, transcripts, and extracted text content
- Two fusion modes:
  - **precision** (UI default): weighted cosine combination with strict cutoff
  - **recall** (used by Ask): weighted Reciprocal Rank Fusion (text 1.0 / transcript 1.5 / clip 0.2)
- File-level grouping with highlights, CLIP keyword chips, and similar-file links

### Ask (intelligence addon)
- Natural-language question answering with citations over indexed files
- Internally uses the recall retriever, then asks the LLM for an answer grounded in retrieved excerpts
- SSE streaming response (`text/event-stream`) — tokens + final `{answer, citations, sources}` JSON
- Two-layer citation safety:
  1. Internal API filter: LLM-returned file_ids are crosschecked against the user's accessible drives (`POST /api/internal/filter-file-ids`)
  2. Whitelist validator: any citation file_id not in the retriever's candidate set is dropped (blocks hallucinated IDs)
- On-demand only (no cache, no worker); exposed as the `ask` tab in global search
- Feature-flagged via `features.rag` — default disabled

---

## AI Intelligence (intelligence addon)

Runs as a separate Docker container (`./addons/intelligence`). All features below are off by default and gated by `search-config.yml` feature flags and per-drive policy in `drives.json`.

### Indexing Pipeline
- Priority queue with per-worker concurrency caps (Whisper semaphore=1, CLIP x N, metadata, text_content)
- Webhook-driven reconciliation (`scan.complete`, `files.deleted`, `files.restored`, `files.missing`, `files.recovered`, `files.purged`)
- Stores `indexed_files`, `transcript_chunks`, FTS5 tables, and sqlite-vec vector tables in an isolated DB

### Auto Tags
- **Modes**: `"false"` | `"manual"` | `"on_index"`
- Suggest → Approve/Dismiss workflow (tags never applied automatically)
- File-detail button and folder-level batch button (`folder-auto-tags` slot)
- Context: transcript (video/audio), BLIP caption (image), extracted text (document), metadata + filename
- Output language controlled by `llm.output_language` (`"auto"` / `"ja"` / `"en"` / ...)

### AI Summaries
- Display-only 1-sentence short summary + paragraph long summary
- Modes: `"false"` | `"manual"` | `"on_index"`
- Manual edit + revert-to-AI supported (`SummaryEditRequest` / `summary/revert`)
- Batch generation per folder (`folder-summaries` slot)
- Window sampling for long content (configurable size/count)
- Never writes to the core Litloft DB — lives in the intelligence addon's own store

### Detailed Summaries (long-form Markdown)
- Modes: `"false"` | `"manual"` | `"on_index"` — manual is the safe default (generation is expensive); `"on_index"` auto-generates after indexing completes
- Independent of `summaries` (can be enabled alone)
- Background task generation with polling status (`generating` / `generated`)
- Markdown download endpoint (`/files/{id}/summary/detailed.md`)
- Rendered in `detailed-summary` slot via the same MarkdownPreview (chrome/mermaid opt-outs available)
- **Auto-linked citations**: each bullet / paragraph is embedded after generation and matched against transcript / document chunks of the same file. Matches above `summaries.citation_threshold` (default 0.55) surface as a clickable link badge (solid `Link2` icon for `top_score ≥ 0.90`, dashed for weaker). Segments the retriever can't confidently pin (below threshold, margin-gated, or paragraph-spread-gated) render **no marker** — the line reads as plain summary prose. The earlier ⚠ "no strong source" badge was removed: it didn't correlate with real hallucination (fabrications live at high cosine too) and fired on ordinary synthesis paragraphs, training readers to ignore it. Top-k is controlled by `summaries.citation_top_k` (default 3). Citation hover-cards show an excerpt from the source chunk and (for video/audio) a "jump" button that seeks the player via the existing transcript integration
- **Section-level edit / revert**: each `## ` heading section can be edited inline; on first edit the AI-generated version is copied to `detailed_original` so the user can revert globally ("Restore AI version"). Edits re-run citation linking automatically
- **Regenerate conflict guard**: regenerating an edited summary requires an explicit confirmation (API returns 409 without `force: true`), preventing accidental loss of hand-edits
- WebSocket events: `intelligence.detailed_summary.updated` (edit / revert / regenerate) and `intelligence.detailed_summary.citations_ready` (citations pass complete) let the UI refresh without polling

### Transcript Refine
- LLM-based ASR transcript correction for Whisper / LoftRef content
- Modes: `"false"` | `"manual"` | `"on_index"`
- Originals preserved in `TranscriptChunk.text_original` — revert anytime
- **Word-level re-alignment**: chunk-level LLM edit → WhisperX wav2vec2 forced alignment to recompute word timings (CJK per-character, other per-word). Embeddings recomputed on corrected text
- Graceful fallback: aligner failures preserve prior word rows rather than corrupting timings
- Per-file button + folder batch button (`folder-refine-transcripts` slot via the downloader-compatible refine manifest)

### Whisper Transcription
- `faster-whisper` (CTranslate2 int8)
- Model size configurable: `small` (default) / `large-v3-turbo` / `large-v3`
- Word-level VTT output for karaoke-style highlighting
- Memory-aware idle unload (default 300s)
- Carefully tuned thresholds for Japanese / multilingual content (`compression_ratio_threshold`, `no_speech_threshold`, `log_prob_threshold`)

### CLIP Frame Analysis
- `ffmpeg` + scenedetect → representative frames → CLIP vector index
- Optional BLIP captioning for frames (English descriptions; used as auto-tag context)
- Frame search + timestamp hovercards in file detail

### LoftRef (external source)
- Downloader addon's "link" mode creates a Litloft file row that references an external URL
- Intelligence addon ingests LoftRef transcripts when available, so YouTube-style links can participate in search, Ask, and summaries without downloading the media

### LLM Providers
- `ollama` — native `/api/chat`; sends `think: false` to skip chain-of-thought on reasoning models (Gemma 4, DeepSeek-R1, QwQ)
- `openai_compatible` — OpenAI SDK, works with OpenAI, DeepSeek, vLLM, LM Studio, or ollama
- `disabled` — all LLM features no-op
- Retry + rate-limit + per-request timeout knobs in `search-config.yml`

### Eval Harness
- `/eval-rag` slash command runs a regression harness over a fixed test drive (`evals/test-drive`), scores retrieval + answer quality against ground truth, and writes a report to `evals/reports/`
- Used during LLM / prompt changes to avoid Ask quality regressions

---

## Knowledge (knowledge addon)

External service (`./addons/knowledge`, port 8200). Scope: `drive`.

- Per-drive Markdown note Vaults (active vault selection)
- Per-file note attachment via `knowledge-edit` slot in file detail
- Web clipping (`/clips` and `/clips/pasted` endpoints) for saving external pages
- Vault summary in the sidebar via `sidebar-sections` slot
- Full-text search over notes

---

## Downloader (downloader addon)

In-process. Scope: `drive`.

- Queue-based yt-dlp downloads with cancel support
- **LoftRef mode**: register an external URL as a Litloft file without downloading the media, with a background fetcher populating metadata/transcripts
- LoftRef player slot (`loftref-player`) for embedded playback of external sources

---

## Podcast (podcast addon)

In-process. Scope: `drive`.

- Generate RSS feeds from folders
- Per-feed title, description, and episode enumeration

---

## Cloud Sync (cloud-sync addon)

In-process. Scope: `global`. Admin-only.

- rclone-backed drive backup to cloud storage
- Scheduled sync + manual trigger per drive
- Log tail + status widget on admin dashboard

---

## UI / UX

### Sidebar
- **Library**: Home, Favorites, All Files
- **Tags**: Tag list with counts (per drive)
- **Pinned Folders**: Shortcuts to pinned folders
- **Playlists**: Playlists for the current drive
- **Drives**: Drive list (current drive highlighted)
- **Addons**: Links to enabled addons (dynamic). Scope=drive addons only appear when a drive is selected
- **Missing**: Shown only when missing files exist in the current drive
- Addon-injected sections via `sidebar-sections` slot (e.g. knowledge Vault summary)
- Mobile: hamburger menu toggle

### Context Menu
- File: right-click for Download / Rename / Move / Delete
- Folder: right-click for Rename / Move / Delete
- Mobile: long-press (500ms) to trigger
- Auto-repositioning at screen edges

### Theme
- Light / Dark / System-follow (3-mode toggle)
- CSS variable-based design tokens (Pinterest-inspired palette, coral accent)
- Japanese typography contracts applied in `jp-ui-contracts`

### PWA
- `manifest.json` + apple-mobile-web-app-capable
- Add to home screen support

### Internationalization (i18n)
- Japanese / English (next-intl)
- Cookie-based locale switching (no URL prefix)
- Addon translations live in the addon's own `frontend/messages/` and are merged at runtime

---

## Security

### Access Control
- **Password protection**: per-drive access control via `passwords.json`
- **Protected drive invisibility**: completely excluded from API responses when locked (404, not 403)
- **`/unlock` page**: no UI link, accessible only by URL
- **JWT authentication**: `lit_token` cookie for drive access control
- **Remember option**: "Remember this device" valid for 1 year
- **Admin endpoint gating**: `/admin` requires an unlocked token for every `access_group` declared in `drives.json` (owner-only)

### Addon Access Boundaries
- Host-side Generic Addon Proxy validates `X-Lit-Drive` header against the caller's accessible drive set before forwarding
- Proxy response filters: `drive_access`, `drive_access_nested`, `current_drive_only`, `current_drive_only_nested`, `null`
- Proxy pre-checks: `file_access`, `addon_feature`, `admin`
- Per-drive policy: `drives.json` `addons` field disables features per drive (either by boolean shorthand or `{feature: bool}` map); matching entries are stripped from `/api/addons/status` and blocked at the proxy
- Intelligence addon purges local data for drives whose `index` feature is turned off (configuration change + restart = reconciliation)

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
- Addon-injected widgets via `dashboard-widgets` slot (intelligence index status, cloud sync status, etc.)

### Search Compare (`/admin/search-compare`)
- Semantic search algorithm comparison debug UI (RRF vs cosine, with/without cutoff)

---

## Addon System

Plugin-based feature extension. See [ADDON-DEVELOPMENT.md](ADDON-DEVELOPMENT.md) for the full developer reference and [DRIVE-POLICY.md](DRIVE-POLICY.md) for operator-side configuration.

### Types

| Type | How it runs | Config | Examples |
|------|-------------|--------|----------|
| In-process | Inside the backend Python process | `addons/{name}/backend/` + symlink into `backend/addons/` | cloud-sync, downloader, podcast |
| External service | Separate Docker container | `addons/{name}/manifest.json` + `docker-compose.override.yml` | intelligence, knowledge |

### Capability Layer: `scope`
Each addon declares `scope: "drive" | "global" | "both"` in `ADDON_META` or `manifest.json`. URLs and sidebar visibility follow:

| Scope | URL patterns | Sidebar |
|-------|--------------|---------|
| `drive` | `/drive/{drive}/addons/{name}` only | Visible only when a drive is selected |
| `global` | `/addons/{name}` only | Always visible |
| `both` | Both URLs resolve | Drive URL when selected, global URL otherwise |

### Policy Layer: per-drive `addons` field
Operators toggle features per drive in `drives.json`:

```json
{ "name": "Family", "path": "/app/drives/family", "addons": {"intelligence": false} }
{ "name": "Work", "path": "/app/drives/work", "addons": {"intelligence": {"rag": false, "auto_tags": true}} }
```

- Missing / unspecified keys default to enabled (graceful degradation)
- Addon-side workers evaluate policy via `GET /api/internal/drive-policy?drive=&addon=`
- Host-side event hooks drop / strip disabled-drive payloads before forwarding
- `addon_feature` pre-check short-circuits disabled routes as 404

### Event Hooks
- Core emits `files.deleted`, `files.restored`, `files.missing`, `files.recovered`, `files.purged`, `scan.complete`
- Listener URLs configured in `event-hooks.json`
- No-op if config file is absent
- Hooks are drive-aware: disabled drives are filtered out per addon/feature before delivery

### UI Slots

| Slot ID | Location | Layout | Example use |
|---------|----------|--------|-------------|
| `search-modes` | Global search modal | Tabs | Semantic search, Ask |
| `file-detail-sections` | File detail panel | Stack | Transcript, similar files, suggested tags, summaries, knowledge note |
| `dashboard-widgets` | Admin dashboard | Cards | Index status, cloud sync status |
| `folder-actions` | Folder toolbar | Inline buttons | Batch AI tags, batch summaries, batch refine |
| `sidebar-sections` | Sidebar | Stack | Knowledge Vault summary |
| `loftref-player` | File detail (external source) | Stack | External URL player |

---

## WebSocket

- Real-time event notifications (scan progress, upload completion, missing/recovered, etc.)
- JWT cookie-based filtering for protected drive notifications
- Unauthenticated connections allowed (for all-public mode)
- Proxied through Next.js custom server so the backend stays internal-only

---

## Infrastructure & Deployment

### Docker Compose
- **backend**: FastAPI (expose 8000, internal only)
- **frontend**: Next.js (ports 3000, sole entry point)
- Backend healthcheck → frontend uses `depends_on: condition: service_healthy`
- Drive directories mounted via volumes (readonly controlled by drives.json)
- `data/` persists SQLite DB + thumbnail images + JWT secret
- Addon containers added via `docker-compose.override.yml` (not tracked by main repo)

### Updating
- `git pull && docker compose up -d --build`
- Current version preserved on build failure

---

## Testing

| Target | Framework |
|--------|-----------|
| Backend | pytest (run inside Docker, `backend/Dockerfile.test`) |
| Frontend | Vitest 3 + jsdom 25 + React Testing Library |
| E2E | Playwright |
| Intelligence addon | pytest (inside addon's own Dockerfile.test), plus `/eval-rag` regression harness |
| Knowledge addon | pytest (inside addon's own Dockerfile.test) |

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
| GET | /api/drives/{drive}/summary | Drive summary (counts, latest activity) |
| GET | /api/drives/{drive}/folders?path= | List folders |
| GET | /api/drives/{drive}/files?path=&search=&sort=&order=&page=&limit=&favorite=&tag=&type= | List files |
| GET | /api/drives/{drive}/tags | List tags |
| POST | /api/drives/{drive}/folders | Create folder |
| POST | /api/drives/{drive}/files | Create text file |
| PUT | /api/drives/{drive}/folders | Rename folder |
| PUT | /api/drives/{drive}/folders/move | Move folder |
| DELETE | /api/drives/{drive}/folders?path= | Delete folder |
| POST | /api/drives/{drive}/scan | Trigger scan |

### Pinned Folders

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/pins | List pinned folders |
| POST | /api/drives/{drive}/pins | Pin a folder |
| DELETE | /api/drives/{drive}/pins | Unpin a folder |

### Trash & Missing

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/trash?sort=&order=&page=&limit= | List trashed files |
| POST | /api/drives/{drive}/trash/empty | Empty trash |
| GET | /api/drives/{drive}/missing?sort=&order=&page=&limit= | List missing files |
| POST | /api/drives/{drive}/missing/purge-all | Bulk purge all missing files (chunked commits) |

### Watch History

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/watch-history?limit=&filter= | List watch history |

### Duplicate Detection

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drives/{drive}/duplicates | List duplicate file groups |

### Upload

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
| PUT | /api/files/{id}/content | Edit text file content |
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
| POST | /api/files/{id}/restore | Restore from trash (also clears missing state) |
| DELETE | /api/files/{id}/purge | Permanently delete |

### Archive

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/files/{id}/archive | List archive contents (ZIP, Shift_JIS support) |
| GET | /api/files/{id}/archive/entry?path= | Extract archive entry |

### Subtitles

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/files/{id}/subtitles/{index} | Get subtitle (VTT format, auto SRT conversion) |

### Batch

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

### Watch Progress

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/files/{id}/progress | Save playback position |
| GET | /api/files/{id}/progress | Get playback position |
| DELETE | /api/files/{id}/progress | Clear playback position |

### Comments

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/files/{id}/comments | List comments |
| POST | /api/files/{id}/comments | Post comment |
| PUT | /api/files/{id}/comments/{comment_id} | Edit comment |
| DELETE | /api/files/{id}/comments/{comment_id} | Delete comment |

### Playlists

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

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/dashboard | System dashboard |

### Addons

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/addons/status?drive= | List enabled addons (drive-aware catalog) |
| * | /api/addons/{name}/... | Generic proxy to in-process or external addon (headers: `X-Lit-Drive` for drive-scoped addons) |

### Internal API (Docker-internal)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/internal/accessible-drives | Drive names accessible with the caller's cookies |
| GET | /api/internal/files/{id} | File metadata (id, drive, filename, file_type, folder_path) |
| POST | /api/internal/filter-file-ids | Filter file IDs by access control |
| GET | /api/internal/drive-policy?drive=&addon= | Per-drive addon policy (`{default, features}` shape) |

### WebSocket

| Path | Description |
|------|-------------|
| /api/ws | Real-time event notifications |
