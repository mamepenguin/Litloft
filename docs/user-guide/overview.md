# Overview of features

Litloft is a media server and file manager for your home network. You open it in a browser, stream video and audio, read images, PDFs and Markdown, and upload, move, tag and delete files.

## How it is organised

- **Drives** — each drive is a separate library, such as *Movies* or *Photos*. Nothing crosses between drives: search, favourites and tags each belong to one drive. Some drives need a password. See [drives and access control](drives-and-access.md).
- **Your profile** — a nickname you choose in **Settings**. It keeps your watch history and lets you post comments. There are no accounts or passwords for it. See [comments and watch history](comments-history.md).

## Closing a menu

Press anywhere outside a menu, filter panel or folder picker to close it. That first press only closes the menu; it does not also open the card or folder under your finger. Press again to reach it.

**Esc** also closes these menus.

Two exceptions:

- Right-clicking another row while a right-click menu is open moves the menu to that row.
- While you rename something in place, clicking elsewhere saves the new name, and the click also does its usual job.

## What you can do

### Browse and view

- The start page, **Litloft**, lists the drives you can open, with their file counts. If some drives are locked, the last card, **Enter password**, leads to the unlock page.
- Folders in grid or list mode. See [browsing files](file-browsing.md).
- Video and audio with resume, subtitles, chapters and scrubbing previews. Images with swipe, two-page spread and slideshow. Markdown, PDFs and ZIP archives open in place. See [viewers and players](viewers-and-players.md).
- Office files (DOCX, XLSX, PPTX) have no viewer. The file page shows a short text excerpt.

### Organise

- Tags, collections, favourites, likes and pinned folders. See [tags and relations](tags-and-relations.md).
- Comments on any file.

### Find

- **`Cmd/Ctrl+K`** opens a quick switcher on any page: jump to a recent file, or type to search the drive. See [search](search.md).
- Search matches file titles and folder paths. Searching inside documents needs the intelligence addon.
- Save a search as a Smart Folder.
- Home shows **Continue Watching**, **Recently Viewed**, **Recently Added**, **Favorites** and **Liked**.

### Work with files

- Drag and drop files or whole folders to upload them. See [upload and file operations](upload-and-fileops.md).
- Rename, move and copy, one file or a selection.
- **Quick note** — press **`N`** on any screen to write a Markdown note and file it. See [Quick Note](quick-note.md).
- Deleted files go to **Trash** for 30 days. See [trash and missing files](trash-and-missing.md).

### Install on a phone or computer

Use "Add to Home Screen" or the browser's install action to open Litloft in its own window. It does not work offline: the server must be reachable. On an iPhone or iPad, add it from an `https://` address, or Safari runs it much slower (see [Serving over HTTPS](../getting-started/installation.md#serving-over-https-for-iphone-and-ipad)).

### Addons

Some features need an addon installed by whoever runs Litloft:

- **intelligence** — semantic search, Ask, summaries, transcripts, image descriptions.
- **knowledge** — the Markdown editor with live preview, version history, Notes, web clipping.
- **cloud-sync** — scheduled backups to cloud storage.
- **media_import** — add YouTube or Vimeo videos by URL.

See the [addon overview](../addons/overview.md).

## What Litloft is not

- **Not for the public internet.** Use it on your home network, or through a VPN.
- **Not a multi-user service.** Your identity is your nickname in this browser. Use the same nickname on each device to share history.
- **Not cross-drive.** Search, favourites and tags stay inside one drive.
- **Not a Plex replacement.** No transcoding, no client apps, no metadata from online databases.
- **Not offline.** Without a connection to the server it shows nothing.

Continue with [drives and access control](drives-and-access.md).
