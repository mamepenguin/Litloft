# Browsing files

The drive home page (`/drive/<name>`) is the main browsing surface. Folders are walked from the drive root; subfolders open at `/drive/<name>/<path>`. Below the breadcrumb you find a folder grid, a file grid, and several *carousels* (Recently added, Continue watching, Favourites, Popular). Each surface is wired into the same backend so changes you make anywhere appear in real time over WebSocket.

## Folder grid

- Folders show a thumbnail (from a child file) and a count of contained files.
- Clicking opens that folder.
- Right-click (or long-press on touch) opens **folder actions** — addons inject extras here (for example, *intelligence* offers batch refine/regenerate).
- Empty folders are tracked in the DB so the count is accurate even when navigating offline-cached data.

## File grid and list modes

A toolbar above the grid lets you:

- Toggle **grid** / **list** view (preference is per-folder, persisted in localStorage).
- Sort by **name**, **created**, **modified**, **size**, **duration**.
- Filter by **type**: video, audio, image, document, archive, other.
- Multi-select files with click+shift, then run batch operations (move, copy, delete, tag).

Each file card shows:

- Thumbnail (320x180 JPEG; lazy-generated on first access).
- Filename.
- Type/size badges.
- A small *progress bar* for partially-watched media.
- A favourite star (filled if `is_favorite`).

## Carousels

The drive home page surfaces several content rows:

- **Continue watching** — files with playback progress between 1% and 90%, sorted by `last_played_at`. The 90% gate filters out finished items; the 1% gate filters out view-only opens (text/Markdown/image), so you only see media you actually paused mid-way.
- **Recently added** — files indexed in the last few days.
- **Favourites** — `is_favorite = true`.
- **Popular** — files with the most cumulative watch time / opens.
- **Pinned folders** — folders the viewer has explicitly pinned via the folder action menu.

## Pinned folders

Pin a folder to keep it on the drive home page even when nothing has happened in it recently.

- Right-click a folder → **Pin**.
- Pins are per-drive and shared across viewers (they live in the drive DB, not the cookie). If you want viewer-private pins, that is a feature request.

## Smart folders (saved searches)

When you find yourself running the same search often, save it as a Smart Folder.

- From the search page, run the query and click **Save**.
- Smart Folders appear on the drive home page below the Pinned folders.
- They are drive-scoped, shared across viewers, editable from the same menu.

## Real-time updates

The browser holds a WebSocket to `/api/ws`. Whenever the backend emits one of:

- `files.added` — new file scanned.
- `files.removed` — soft-deleted (trash).
- `files.recovered` — was missing, now back on disk.
- `files.missing` — was on disk, now gone.
- `files.purged` — explicit hard delete.
- `scan.complete` — a drive rescan finished.

…the UI updates without a refresh. If the WebSocket disconnects (e.g., laptop sleep), it reconnects automatically.

## Drag-and-drop

Drop one or more files (or a whole folder, in browsers that support it) onto the file grid. See [upload and file operations](upload-and-fileops.md) for chunking, resume, and limits.

## What is *not* shown

- **Trashed and missing files** are hidden from default queries via `active_file_filter()`. Trashed items show in the *Trash* view; missing files show in the *Missing* view. See [trash and missing files](trash-and-missing.md).
- **Files in locked drives** are hidden entirely; the drives themselves do not appear in the home grid.

> **Image needed:** annotated screenshot of a drive home page (folder grid, file grid, carousels, breadcrumb).
