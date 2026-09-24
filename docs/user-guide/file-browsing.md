# Browsing files

A drive has two starting points in the sidebar:

- **Home** — what is worth coming back to: rows of files you were watching, opened recently, added recently, favourited or liked. A drive opens here.
- **Library** — the drive's own folders and files, starting at the drive root.

## The sidebar

The sidebar is the same on every screen of a drive.

- **Top** — Home, Library, and five views of the whole drive: **Favorites**, **Liked**, **Recently Viewed**, **Recently Added** and **All Files** (every file in the drive, with no folders). Addons can add pages here, such as *Ask* or *Notes*.
- **Middle** — what you build yourself: **Collections**, **Pins**, **Smart Folders** and **Tags**. You can collapse these sections and drag them into the order you like.
- **Bottom** — **Trash**, **Missing Files** (only when the drive has some), and **Dashboard** for an administrator.

## The breadcrumb trail

The row above a listing shows where you are. Every part of it is a link back to that folder. On a deep path the middle folders fold into **…**; press it to go to the deepest hidden folder.

## Folders

- A folder card shows how many files it holds, counting its subfolders too, and the main kinds: *138 items · Video 135 · Document 3*.
- Click a folder to open it.
- Right-click it, or long-press it on a touch screen, for **Open**, **Pin / Unpin**, **Rename**, **Move** and **Delete**. In the folder tree the same menu also offers **New file here** and **New folder here**.
- Empty folders are listed too, with a count of 0.

## File grid and list modes

The toolbar above a listing has:

- **Add** — upload files, upload a folder, or create a folder. Addons add entries here, such as **New note** and **Clip web page** (knowledge) or **Import from URL** (media_import).
- **Filter** — narrow the listing by **file type** and **verification**. The file types are Video, Image, Audio, Document, Text, PDF, Archive and Other. Document includes Text and PDF. Source code and configuration files count as Other.
- **View** — grid or list.
- **Sort** — newest / oldest, title A-Z / Z-A, largest / smallest, or random. While the order is random, **Reshuffle** deals a new one.
- **Play** — play everything playable in the folder.
- `…` — **Select mode**, **Rescan**, **Pin this folder**, and any addon actions for the listed files.

On a phone, **Play**, **View** and **Sort** move into `…`.

Each folder remembers its own view and sort. Until you choose, a folder of mostly videos, images, PDFs or documents opens as a grid, and a folder of mostly Markdown, audio or other files opens as a list.

When you open a file and come back, you return to where you had scrolled.

### What a file card shows

- A thumbnail. A video shows its length on the thumbnail. Other files show their extension, unless every file in the folder has the same one.
- The title. It comes from the filename, so it can differ from the name on disk.
- One fact, then the date the file was added and up to two tags. The fact depends on the kind of file:

  | Kind | Fact shown |
  |---|---|
  | Video, Audio | none (the length is on the thumbnail) |
  | Image | its dimensions, e.g. *1920 × 1080* |
  | Everything else | its size |

  The file page, Trash, Missing Files and the duplicates list describe files the same way.
- A progress bar on media you stopped partway through.
- A star when the file is a favourite. Hover a card to add one.

### Photo folders

A folder that is almost all images lays out each picture at its own shape, in rows that fill the width, instead of in equal cards. There is no switch for this. The filename appears when you hover over a picture, and it is always shown on a touch screen.

### Selecting several files

Turn on **Select mode** from `…`, or `Cmd/Ctrl+click` a card. `Shift+click` selects a range. The bar at the bottom offers tag, rename, add to collection, copy, cut, move, and move to trash. Dragging any selected file moves the whole selection.

## Creating a new file

Press **`Cmd/Ctrl+N`**, or right-click a folder in the tree and choose **New file here**. An empty Markdown file named `untitled-<date-time>.md` is created in the current folder and opens for editing. Rename it once it is open.

You cannot create a file in a view that is not a folder, such as Favorites, search results, or a tag filter at the drive root.

## Renaming in place

Press **`F2`** on a folder, or on a file in the folder tree, or choose **Rename** from its right-click menu. The name becomes editable with the extension left out of the selection. **`Enter`** saves and **`Esc`** cancels. Clicking elsewhere also saves.

File cards in the grid and list rename through a dialog instead, because a card shows the title, not the filename.

## Moving by drag and drop

- **From your computer** — drop files or a folder onto a listing to upload them into it. A drop on Home uploads to the drive root. See [upload and file operations](upload-and-fileops.md).
- **Inside the drive** — drag a file or folder onto a folder card, a folder in the tree, a folder in the breadcrumb trail, or the band at the top of the tree that stands for the drive root. Hold a drag over a closed folder in the tree to open it.

## Filtering

There are three ways to narrow what you see:

- **Filter in this folder…**, below the toolbar, matches filenames in the current folder only, without looking into subfolders. It clears when you leave the folder.
- **Tags** — click a tag in the sidebar while inside a folder to show the matching files in that folder *and all its subfolders*. Click the tag again to clear it. **Search the whole drive** widens the search to the entire drive. See [tags and relations](tags-and-relations.md).
- **The folder tree's filter** searches folder names across the whole drive.

For drive-wide search, see [Search](search.md).

## The folder tree

The tree button at the top left opens a folder tree beside the listing. It lists folders only; turn on **Show files too** at the bottom of the tree to include files. That setting is remembered per drive.

While the tree is open, the sidebar steps aside. Close the tree and the sidebar returns.

## Trusted sources and the review queue

Each file is either **Verified** or **Unverified**. The shield button on the file page switches between them. Files already in your drive start as verified.

This matters only for [Ask](../addons/intelligence.md): Ask answers only from verified files. Unverified files still appear in every search. Changing this setting never changes the file itself.

Files added by an addon, such as web clips, arrive unverified. With the intelligence addon installed, opening one asks **Do you trust this source?**, with **Trust as a source** and **Leave it unverified**. To work through the files nobody has decided on yet, set the **Verification** filter to **Unjudged only**.

## Home

Home shows these rows, in order:

- **Continue Watching** — media you stopped before 90%.
- Rows added by addons, if any.
- **Recently Viewed**
- **Recently Added**
- **Favorites**
- **Liked**

Continue Watching and Recently Viewed need a [profile](profile-preferences.md). Each row shows as many cards as fit, and **See all** opens the rest. Empty rows are hidden.

## Pinned folders

Right-click a folder and choose **Pin**, or use `…` → **Pin this folder** inside it. Pins appear in the sidebar and are shared by everyone who uses the drive.

## Smart folders (saved searches)

Run a search and click **Save** to keep it as a Smart Folder in the sidebar. Smart folders are shared by everyone who uses the drive.

## Real-time updates

Uploads, moves, renames and deletions made in another tab, on another device, or by a rescan appear without reloading. When you come back to a tab, it refreshes itself. For the event payloads, see [WebSocket events](../reference/websocket-events.md).

## What is not shown

- Files in the trash or missing from disk are listed only under **Trash** and **Missing Files**. See [trash and missing files](trash-and-missing.md).
- A locked drive and everything in it stay hidden until you unlock it. See [drives and access control](drives-and-access.md).
