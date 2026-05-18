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
- Multi-select files with click+shift, then run batch operations (move, copy, delete, tag).
- **New folder** — create a folder inside the current one.
- **New file** — create an empty `untitled-{timestamp}.md` in the current folder and jump straight into the editor (see below).

## Creating a new file

From any folder view you can create a blank Markdown file in one click:

- Click **新規ファイル / New File** in the toolbar, or
- Press **`Cmd+N`** (macOS) / **`Ctrl+N`** (Windows / Linux) anywhere on the page.

Behaviour:

- The file is created at `untitled-{YYYYMMDD-HHMMSS}.md` inside the **current folder** (the drive root if you are at `/drive/<name>` with no path). No name dialog is shown — the timestamp guarantees uniqueness, and if it ever does collide the backend automatically suffixes the name (`untitled-… (1).md`, `(2)`, …).
- After creation you are navigated straight to the file in edit mode. Start typing.
- To use a different extension or rename the file, use the rename action on the file once it is open.
- The button and the shortcut are **disabled in special views** that do not have a folder context: favourites (`?view=favorites`), search results, tag views, and the global search popup. In those views, navigate into a regular folder first.
- For drives marked `readonly: true` in `drives.json`, creation fails with an error toast (server returns 403). Use a writable drive for notes.

## In-folder filter

Below the toolbar there is an always-visible **filter row** with two inputs combined as AND:

- A free-text field (placeholder *Filter in this folder…*) that does case-insensitive substring match against the filename, including the extension.
- A type dropdown (All / Markdown / Video / Image / PDF).

Scope and behaviour:

- Filters only the **direct files of the current folder**. Subfolder contents are not searched. Folder entries themselves are always shown — the filter does not hide folders.
- **No persistence.** Navigating to another folder, reloading, or re-opening the pane clears the filter (this is intentional — to avoid "I am secretly being filtered" surprises).
- When zero files match, an empty-state with a **Clear filters** button appears.
- The text input is debounced ~300 ms and combines with the existing virtual scroller, so it stays responsive on folders with thousands of files.

This is the lightest of three search layers. For drive-wide search use the global search popup; for natural-language questions use intelligence Ask. See [Search](search.md).

### Tree pane filter

When the folder tree pane is open, it has its own filter row at the top, identical in shape (text + type dropdown) but different in scope:

- Matches against **file and folder names** across the whole tree of the current drive.
- Tree structure is preserved: matched items are highlighted, ancestors are shown in a dimmed style as path context, non-matching siblings are hidden.
- The **type filter** is persisted per drive in localStorage (so a photo drive can default to *Image*); the **text filter** is not — it clears when the tree pane is closed or the page is reloaded.
- Switching the tree filter on triggers a one-shot full-tree fetch (the tree is normally lazy-expanded), so the first keystroke on a very large drive may take a moment.

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

- `files.created` — a new file row was created.
- `files.deleted` — soft-deleted (trash).
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
