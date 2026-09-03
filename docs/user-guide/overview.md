# Overview of features

Litloft is two things at once:

1. **A personal media server** — stream video and audio with resume, browse images and Markdown, view PDFs, drop in ZIP archives and explore them in place.
2. **A file manager for trusted home networks** — upload via drag-and-drop or chunked HTTP, rename in place, move, copy, tag, comment, organise into collections, capture a Markdown note from any screen, and recover from a 30-day soft-delete trash.

Optional addons add AI search, summaries and Q&A over your library, the Markdown editor with live preview, scheduled cloud backups, and lightweight URL-based imports for online videos.

## Mental model

A Litloft installation has:

- One or more **drives** — top-level content areas, each mapped to a host directory and optionally protected by a password group. A drive is a security boundary; cross-drive features (search, favourites, tags) are intentionally absent.
- A **viewer identity** — a self-chosen nickname stored in a cookie, hashed to a 16-char ID. Used for comments and watch-history attribution. There are no accounts; identity is local to each device.
- A **JWT** — issued when a viewer unlocks a password group. Drives become visible only when the viewer holds their `access_group`.

## What you can do

### Browse and view
- Folder browser with grid and list modes, lazy-loaded thumbnails.
- Video and audio players with byte-range streaming, resume from last position, subtitles, sprite scrubbing previews.
- Chapters on media files, plus a companion region (chapters, transcript, related material) that sits beside the player on wide screens or below it on narrow ones — see [viewers and players](viewers-and-players.md).
- Image viewer with swipe, double-page spread, slideshow, EXIF panel.
- Markdown renderer with Mermaid, syntax highlighting, frontmatter chips, internal `loft://` links.
- PDF viewer, ZIP/TAR/RAR archive browsing. Office files (DOCX/XLSX/PPTX) have no
  viewer; Litloft extracts a short text excerpt so they stay searchable.

### Organise
- Tags (separate per drive). For Markdown files the YAML frontmatter is the canonical store.
- Collections with arbitrary ordering.
- Favourites (`is_favorite` flag) and likes (`liked_at` stamp), pinned folders.
- Per-file comments (rate-limited).
- File relations (`kind`-typed graph; for Markdown derived from `loft://` links).

### Search and discovery
- Drive-wide file switcher on `Cmd/Ctrl+K` from any page — jump straight to a recently opened file, or type to search (see [search](search.md)).
- Keyword search over filename, title, description.
- Tag and type filters.
- Saved searches as Smart Folders.
- Duplicate detection by content hash.
- Continue-watching, recently added, favourites, and liked carousels per drive.

### File operations
- Drag-and-drop upload (folder upload supported, chunked with resume).
- Rename in place — `F2` on a focused row in the folder tree or a folder card edits the name inline, no dialog (see [browsing files](file-browsing.md)).
- Move, copy, batch operations.
- Quick Note — press `N`, or use the header action, to write a Markdown note from any screen and file it without leaving the page (see [Quick Note](quick-note.md)).
- Version history for text and Markdown files: the core snapshots every content write and serves the version list, past bodies, and diffs. The browse-and-restore panel is part of the [knowledge addon](../addons/knowledge.md).
- Archive entry streaming (50 MB per entry cap).
- Soft delete to trash (30-day auto-purge).
- Missing-file detection and recovery when files reappear.

### System
- First-run wizard at `/setup`.
- Admin dashboard at `/admin` (per-drive metrics, system health, restart-pending banner).
- Settings GUI at `/admin/settings` for drives, passwords, and per-drive addon policy.
- WebSocket live updates (`/api/ws`) — scan progress and completion, upload completion, and file moves, so open folder views refresh themselves. Addons push their own events through the same channel. See [WebSocket events](../reference/websocket-events.md).
- Installable as a PWA — "Add to Home Screen" / the browser's install action launches Litloft in a standalone window (custom icon, themed title bar, iOS safe-area handling). It is **not** offline-capable: there is no service worker, so the server must be reachable.
- Dark / light / system theme, cookie-driven language preference with no URL prefix.

### Optional via addons
- **intelligence** — semantic search, Ask (RAG), summaries, transcripts, vision descriptions.
- **knowledge** — Vaults of Markdown notes, web clipping, frontmatter sync, the capture basket, and the in-browser Markdown editor: live preview, view-mode cycling, and the version history panel. The core renders Markdown and owns the editor chrome, but the editing surface itself arrives with this addon.
- **cloud-sync** — scheduled rclone backups to any supported remote.
- **media_import** — turn URLs into `.loft` reference files with embedded YouTube/Vimeo players.

## What Litloft is *not*

- **Not a public website.** No HTTPS termination, no rate-limited public auth, no DDoS hardening. Always front it with a reverse proxy and VPN if remote access is needed.
- **Not a multi-tenant SaaS.** There are no per-user accounts; identity is a cookie. Comments and watch history are per device unless you copy the cookie.
- **Not cross-drive.** Drives are deliberate silos. Searches, favourites, and tags do not cross drive boundaries.
- **Not a Plex replacement.** No transcoding, no client apps, no metadata scraping from external databases. It is a browser-only, file-shaped library.
- **Not an offline app.** The PWA installs as a standalone window but has no service worker or local cache; with no connection to the server it shows nothing.

Continue with [drives and access control](drives-and-access.md) to understand how content is gated.
