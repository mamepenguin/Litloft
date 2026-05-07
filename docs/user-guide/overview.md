# Overview of features

Litloft is two things at once:

1. **A personal media server** — stream video and audio with resume, browse images and Markdown, view PDFs and Office documents, drop in ZIP archives and explore them in place.
2. **A file manager for trusted home networks** — upload via drag-and-drop or chunked HTTP, rename, move, copy, tag, comment, organise into playlists, and recover from a 30-day soft-delete trash.

Optional addons add AI search, summaries, Q&A over your library, scheduled cloud backups, and lightweight URL-based imports for online videos.

## Mental model

A Litloft installation has:

- One or more **drives** — top-level content areas, each mapped to a host directory and optionally protected by a password group. A drive is a security boundary; cross-drive features (search, favourites, tags) are intentionally absent.
- A **viewer identity** — a self-chosen nickname stored in a cookie, hashed to a 16-char ID. Used for comments and watch-history attribution. There are no accounts; identity is local to each device.
- A **JWT** — issued when a viewer unlocks a password group. Drives become visible only when the viewer holds their `access_group`.

## What you can do

### Browse and view
- Folder browser with grid and list modes, lazy-loaded thumbnails.
- Video and audio players with byte-range streaming, resume from last position, subtitles, sprite scrubbing previews.
- Image viewer with swipe, double-page spread, slideshow, EXIF panel.
- Markdown renderer with Mermaid, syntax highlighting, frontmatter chips, internal `loft://` links.
- PDF viewer, in-browser Office (DOCX/XLSX/PPTX) preview, ZIP/TAR/RAR archive browsing.

### Organise
- Tags (separate per drive). For Markdown files the YAML frontmatter is the canonical store.
- Playlists with arbitrary ordering.
- Favourites (`is_favorite` flag), pinned folders.
- Per-file comments (rate-limited).
- File relations (`kind`-typed graph; for Markdown derived from `loft://` links).

### Search and discovery
- Keyword search over filename, title, description.
- Tag and type filters.
- Saved searches as Smart Folders.
- Duplicate detection by content hash.
- Continue-watching, recently added, popular, and favourites carousels per drive.

### File operations
- Drag-and-drop upload (folder upload supported, chunked with resume).
- Rename, move, copy, batch operations.
- In-browser text and Markdown editing.
- Archive entry streaming (50 MB per entry cap).
- Soft delete to trash (30-day auto-purge).
- Missing-file detection and recovery when files reappear.

### System
- First-run wizard at `/setup`.
- Admin dashboard at `/admin` (per-drive metrics, system health, restart-pending banner).
- Settings GUI at `/admin/settings` for drives, passwords, and per-drive addon policy.
- WebSocket live updates (`/api/ws`) for added/missing/recovered/purged files.
- PWA manifest, dark/light/system theme, English and Japanese translations.

### Optional via addons
- **intelligence** — semantic search, Ask (RAG), summaries, transcripts, vision descriptions.
- **knowledge** — Vaults of Markdown notes, web clipping, frontmatter sync.
- **cloud-sync** — scheduled rclone backups to any supported remote.
- **media_import** — turn URLs into `.loft` reference files with embedded YouTube/Vimeo players.

## What Litloft is *not*

- **Not a public website.** No HTTPS termination, no rate-limited public auth, no DDoS hardening. Always front it with a reverse proxy and VPN if remote access is needed.
- **Not a multi-tenant SaaS.** There are no per-user accounts; identity is a cookie. Comments and watch history are per device unless you copy the cookie.
- **Not cross-drive.** Drives are deliberate silos. Searches, favourites, and tags do not cross drive boundaries.
- **Not a Plex replacement.** No transcoding, no client apps, no metadata scraping from external databases. It is a browser-only, file-shaped library.

Continue with [drives and access control](drives-and-access.md) to understand how content is gated.
