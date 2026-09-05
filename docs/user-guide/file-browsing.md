# Browsing files

The drive home page (`/drive/<name>`) is the main browsing surface. Folders are walked from the drive root; subfolders open at `/drive/<name>/<path>`. Below the breadcrumb you find a folder grid, a file grid, and several *carousels* (Recently added, Continue watching, Favourites, Liked). Every surface reads the same backend, and a change you make on one of them refreshes the others (see [real-time updates](#real-time-updates) for what does and does not propagate between separate tabs).

## Drive home layout

![Annotated drive home page showing the breadcrumb, folder grid, file grid, and content carousels](../images/user-guide/drive-home-overview.png)

The numbered areas in the screenshot map to the main browsing surfaces: breadcrumb navigation, folder cards, file cards, and the activity carousels that surface recent or in-progress items.

## Folder grid

- Folders show a thumbnail (borrowed from the first video or image anywhere beneath them) and a file count. The count is **recursive** — it includes every active file in the folder *and* its subfolders.
- Clicking opens that folder.
- Right-click (or long-press on touch) opens the **folder menu**: Open, New file here, New folder here, Pin / Unpin, Rename, Move, Delete. Which entries appear depends on the surface — the tree pane offers the create actions, the folder grid does not.
- Addon actions are not in this menu. They live in the `folder-actions` slot in the toolbar above the grid, which receives the current folder and the ids of the files listed in it (for example, *intelligence* offers batch refine/regenerate there).
- The folder list is derived from the paths of the files in the drive, so a folder holding no files at all would otherwise vanish. Those are recorded in the `empty_folders` table and merged back into the listing with a count of 0.

## File grid and list modes

A toolbar above the grid lets you:

- Toggle **grid** / **list** view. In a real folder the choice is remembered per folder (localStorage, under `folderPrefs:{drive}`); on the drive root, in the flat views, and in search it falls back to a single global preference. Before you have ever chosen, the mode is guessed from what the folder mostly holds — Markdown folders open as a list, video/image/audio folders as a grid.
- Sort by **newest / oldest** (indexed date), **title A-Z / Z-A**, **largest / smallest**, **most / least liked**, or **random**. Search results add a **relevance** option, which is their default. Sort is remembered per folder in the same place as the view mode. Random sort gets a reshuffle button next to the sort control.
- Narrow the listing from the **Filter** menu, which holds both axes. **File type** (All / Video / Image / Audio / Document / Markdown / PDF / Archive / Other) — Markdown and PDF sit *under* Document, so choosing Document returns them too and choosing one of them narrows further. The server applies this one and narrows the query itself, so it is right about files you have not scrolled to yet. **Verification** (All / Verified only / Unjudged only) is offered everywhere except in search results, where a ranked, truncated result set cannot be narrowed after the fact without quietly losing hits. Verification is applied to the rows already fetched rather than by the server, so in the flat views (*recently played*, for instance) it narrows what is on screen without changing the count. The button carries the word *Filter* until something is on, then the names of what is on.
- Turn on **Select mode** from the overflow (`…`) menu, then click cards to select them. `Cmd/Ctrl+click` turns selection on and toggles a card in one gesture, and `Shift+click` extends the selection to a range. A selection bar appears at the bottom with tag, rename, add-to-collection, copy, cut, move, and move-to-trash. On a narrow screen it keeps **Tag** and **Move** and puts the other five behind `…`, with their names — it does not scroll sideways, so nothing is off the edge.
- **Rescan** the drive, also from the overflow menu.
- **Add** anything to the folder, from the one **Add** button: upload files, upload a folder, create a folder, create a note. It is the only filled button on the bar. An addon can contribute further rows, which appear below a separator at the bottom of the menu.
- **Play** everything playable in the folder, at the right-hand end of the bar, on folders that hold something playable.

On a listing with nothing in it at all — no files and no subfolders —
the toolbar drops the controls for arranging things: the view toggle,
the sort, and the type filter. What stays is everything that puts
something in the folder (the Add menu and Rescan) and the count. A
listing emptied by a filter keeps them all, because the filter that
produced the empty result is also the way back out of it. The same
applies to the drive root's own file listing and to an empty trash.

The file list is paged: 30 files per request, fetched as you scroll. When you open a file and come back, the list is restored from a snapshot in `sessionStorage` — the pages you had already loaded and your scroll position both come back, so a deep scroll survives the round trip. The snapshot is skipped for random sort and for search results, and it expires after two hours.

Each file card shows:

- Thumbnail (320x180 JPEG; lazy-generated on first access).
- The file's **title**, not its filename. The title is derived from the filename and is cosmetic — this is why renaming in place is not offered on the cards (see below).
- Size and the date the file was indexed, plus up to two tags.
- A duration badge for video and audio. Everything else gets an extension badge, but only where it distinguishes something: in a folder whose files all share one extension the badge is dropped, and the list view drops its type label the same way when every row is the same kind. Both come back the moment the listing is mixed — including when a later page brings in a different kind.
- A thin *progress bar* along the bottom for partially-watched media.
- A favourite star, shown on hover and always shown once the file is a favourite.

For the keys these actions are bound to, see [keyboard shortcuts](keyboard-shortcuts.md).

## Creating a new file

From any folder view you can create a blank Markdown file in one click:

- Choose **新規ノート / New Note** from the toolbar's **Add** menu, or
- Press **`Cmd+N`** (macOS) / **`Ctrl+N`** (Windows / Linux) anywhere on the page.

Behaviour:

- The file is created at `untitled-{YYYYMMDD-HHMMSS}.md` (local time) inside the **current folder**. No name dialog is shown — the timestamp guarantees uniqueness, and if it ever does collide the backend automatically suffixes the name (`untitled-… (1).md`, `(2)`, …).
- After creation you are navigated straight to the file in edit mode. Start typing.
- To use a different extension or rename the file, use the rename action on the file once it is open.
- The button and the shortcut are **disabled where there is no folder to write into**: the drive root, favourites (`?view=favorites`), the other flat views, search results, and the global search popup. A tag filter applied *inside* a folder does have a folder, and creates into it.
- If creation fails the browser shows an alert with the reason. Locked drives are not a special case here — they are invisible until you unlock them.

## Renaming in place

Renaming happens inline, in the row or card you are looking at — there is no dialog:

- Press **`F2`** while a **tree row** or a **folder card** has focus, or pick **Rename** from that item's right-click menu.
- The name becomes an editable field with the base name preselected, so the first keystroke replaces the name and leaves the extension intact.
- **`Enter`** (or `Tab`) commits, **`Esc`** cancels. Clicking elsewhere also commits; if that commit is refused the edit is let go and the reason is shown briefly at the top of the pane.
- Names are checked before the request goes out, with the same rules the server applies: not empty, no `< > : " / \ | ? *`, no leading dot, at most 255 characters. A rejected name keeps the field open with the reason underneath it.
- After a successful rename focus returns to the row under its new name, so you can keep working from the keyboard.

Where this applies:

- **Folders** — in the tree pane and on folder cards, everywhere folder cards are shown (drive home and inside folders).
- **Files** — in the **tree pane only**. The tree shows real filenames, so what you edit is exactly the string on screen.
- **File cards in the grid and list** still rename through the old dialog, because a card shows the title rather than the filename and editing there would show one string and save another.

While a name is being edited, that row stops being a drag source.

## Spring-loaded folders during a drag

Holding a drag still over a collapsed folder row in the tree **opens it after 600 ms**, so you can carry on down and drop into a folder you never opened by hand.

- Only folders that actually have children and are not already open spring open. Sweeping a drag across the tree opens nothing, because the dwell timer restarts every time the hovered row changes.
- Branches opened this way **close again when the drag ends** — passing over a folder is not an instruction to reshape the tree. The exception is the folder you actually dropped into and its ancestors, which stay open so you can see where the items landed.
- Branches **you** had already opened are never touched.
- Spring-loading is off while a tree filter is active, since the filtered tree is built from matches rather than from the expansion state.

## In-folder filter

Below the toolbar there is an always-visible **filter row**: a free-text
field (placeholder *Filter in this folder…*) that does a case-insensitive
substring match against the filename, including the extension.

Text only. It used to carry a kind dropdown as well, but that one sifted
the rows already loaded while the toolbar's asks the server — so on a
folder past its first page of thirty, the same choice gave two different
answers. The toolbar's is the one that can be right, and it is the one
that remains.

Scope and behaviour:

- Filters only the **direct entries of the current folder**. Subfolder contents are not searched.
- Applies to folder cards as well as files, so typing narrows both lists.
- **No persistence.** Navigating to another folder, reloading, or re-opening the pane clears the filter (this is intentional — to avoid "I am secretly being filtered" surprises).
- When nothing matches, an empty-state with a **Clear filters** button appears.
- The text input is debounced ~300 ms, so it stays responsive on folders with thousands of files.

This is the lightest of three search layers. For drive-wide search use the global search popup; for natural-language questions use intelligence Ask. See [Search](search.md).

### Tree pane filter

When the folder tree pane is open, it has its own filter row at the top — text plus a kind dropdown offering the same nine choices as the toolbar — but different in scope:

- Matches against **file and folder names** across the whole tree of the current drive.
- Tree structure is preserved: matched items are highlighted, ancestors are shown in a dimmed style as path context, non-matching siblings are hidden.
- The **type filter** is persisted per drive in localStorage (so a photo drive can default to *Image*); the **text filter** is not — it clears when the tree pane is closed, when the drive changes, or when the page is reloaded.
- Switching the tree filter on triggers a one-shot full-tree fetch (the tree is normally lazy-expanded), so the first keystroke on a very large drive may take a moment.
- While a filter is active, rows cannot be dragged out of the tree — the list mixes matches with ancestor context, so the intent would be ambiguous. Rows can still receive drops.

## Trusted sources and the review queue

Every file carries a **trust tier**: either it can be used as evidence, or it
cannot. It is shown on the file page next to the favourite star, as a single
button that toggles it.

Almost everything is trusted — files the scanner finds are trusted from the
moment they appear, and so was everything that existed before this feature.
The button names the state either way: **Verified** or **Unverified**, beside a
shield. Hover it to see what pressing it does — it toggles, so the label is
the state, not the action.

One word throughout: the state is **verified**, and *trust* is only ever the
verb on the action. The toolbar's filter reads the same way — *Verified only*,
or **Unjudged only**, which is not a third state but a different question:
nobody has ruled on those, and the files migrated in when the feature landed
are verified and unjudged at once.

Why it exists: an answer from Ask is only as good as what it was built from.
A book you bought and a page you clipped at 2 a.m. after reading the headline
are not the same kind of evidence, but once the text is indexed they look
identical. The tier keeps that difference.

What the tier changes:

- **Unverified files still appear in search.** Filename search, tag filters,
  and semantic search all return them exactly as before. Nothing is hidden
  and nothing is deleted.
- **Unverified files do not ground Ask answers.** They are excluded from the
  set Ask draws citations from, so they cannot be quoted back at you as
  evidence.

Put plainly: clips are for *finding things again*; trusted sources are for
*answering questions*.

**Withdrawing trust is safe and reversible.** It changes nothing on disk, and
it does not touch notes you wrote from that file — a note holds your own
words and keeps its own standing whatever happens to the page that prompted
it. There is no confirmation dialog because there is nothing to lose.

When you open a file nobody has ruled on, the page asks the question
directly, with **Trust as a source** and **Not now** buttons. The panel is
just the question. Material for answering it sits below in *Similar
files*, which runs on every file and stays there after you have decided.

The toolbar has a matching filter chip:

| Choice | Shows |
|---|---|
| All | everything (default) |
| Verified only | just the sources you have vouched for |
| Not reviewed only | files nobody has ruled on yet — the review queue |

*Not reviewed* is not the opposite of *verified* — it is a separate axis, and
it lives only in this filter. Files that existed before this feature were all
marked verified so that nothing you relied on stopped working, but nobody has
actually judged them, and neither has anyone judged the files the scanner
picks up. This filter is how you work through that backlog at your own pace
if you ever want to. Files added by an addon — Web Clips especially — arrive
unverified *and* unreviewed, so they appear here too.

The per-file button deliberately ignores this axis. Marking every untouched
file as "not reviewed" on its own page would put a warning on your whole
library and tell you nothing.

The filter is not persisted: it clears when you navigate away, for the same
reason the in-folder filter does. It is also **not offered while searching** —
search blends filename matches with semantic hits, and the semantic side ranks
and trims its results before the page sees them, so a filter applied afterwards
could quietly hide matches that do qualify. Rather than show a control that
under-reports, it is withheld there.

## Filtering a folder by tag

Clicking a tag in the sidebar while you are inside a folder filters *that folder* by the tag (clicking the same tag again clears it). Two things about the file list change:

- The listing switches from the folder's **direct children** to its **whole subtree**. Plain browsing is a directory listing; a tag filter is a search, and a search that stopped at the first level would miss most of what you meant. Finder behaves the same way.
- Folder cards disappear while the filter is on — the result is a flat list of matching files. A **Search the whole drive** link appears in the toolbar, and again in the empty state when nothing in this folder matches, to widen the same tag to the whole drive.

Tags themselves — how they are stored, edited, and searched — are covered in [tags and relations](tags-and-relations.md).

## Carousels

The drive home page surfaces several content rows:

- **Continue watching** — files whose playback position is below 90% of their duration, newest first. Finished items fall out at that gate, and so do view-only opens of text, Markdown, and images (they carry no duration), so you only see media you actually paused mid-way.
- **Recently played** — the same history without the 90% gate.
- **Recently added** — files most recently indexed.
- **Favourites** — `is_favorite = true`.
- **Liked** — files you marked as good, most recently liked first.

Continue watching and Recently played need a profile; without one, no history is recorded and the two rows do not appear. See [profile and preferences](profile-preferences.md).

Below the carousels the drive home lists the files that sit at the drive root, using the same grid as any other folder.

## Pinned folders

Pin a folder to keep it one click away from anywhere in the drive.

- Right-click a folder → **Pin**. Pinned folders appear in the **Pins** section of the sidebar, not on the drive home page.
- Pins are per-drive and shared across viewers (they live in the drive DB, not the cookie). If you want viewer-private pins, that is a feature request.

## Smart folders (saved searches)

When you find yourself running the same search often, save it as a Smart Folder.

- From the search page, run the query and click **Save**.
- Smart Folders appear in their own sidebar section, which you can collapse and reorder alongside Pins, Collections, and Tags.
- They are drive-scoped, shared across viewers, editable from the same menu.

## Real-time updates

The browser holds a WebSocket to `/api/ws`, and reconnects on its own if the connection drops (e.g., laptop sleep). **A change made anywhere shows up everywhere it should** — another tab, another device, the scanner, or an addon — without a reload.

What travels over it is coarse on purpose. The core sends two signals:

- `drive.structure_changed` — the set of files or folders in a drive changed: something was created, deleted, moved, renamed, restored, purged, went missing, or a rescan finished. The file list, the folder tree, and the drive home page all refetch.
- `drive.file_updated` — a file's contents were written. The file list refetches, because a write can change a title or a thumbnail. The folder tree ignores it, so editing a note does not make the tree flicker while you type.

Neither carries the ids of what changed. Subscribers refetch the listing they are showing rather than patching it, so the event only has to say *which drive*, and a screen showing a different drive stays still.

Two older signals remain for the rescan progress UI: `scan:progress` and `scan:complete`, which the sidebar and the admin dashboard use for their counts.

Access control applies here as it does everywhere: a notification about a locked drive is never sent to a browser that has not unlocked it.

**A hidden tab stops listening.** To save a connection, the browser closes the WebSocket when you switch away and opens it again when you come back. Nothing is replayed, so anything that happened while the tab was in the background was never delivered to it. Litloft handles this by refetching once on reconnect: when you return to a tab, what you see is fetched fresh rather than reconstructed from events it missed.

Addons can also push their own events through the core's relay, which is how, for example, an intelligence job reports progress into the page.

The payload of each event is in [WebSocket events](../reference/websocket-events.md).

## Drag-and-drop

Two different things travel by drag:

- **Files from your computer.** Drop one or more files (or a whole folder, in browsers that support it) onto the file grid to upload them. See [upload and file operations](upload-and-fileops.md) for chunking and limits.
- **Files and folders already in the drive.** Dragging a card or a tree row and dropping it on a folder **moves** it. Valid drop targets are folder cards, folder rows in the tree, the breadcrumb, and the drop band at the top of the tree that stands for the drive root. Drops onto a folder itself, or into its own descendants, are refused. Drags work across panes — pick a card up in the file list and drop it on a tree row.

If several files are selected, dragging any one of them moves the whole selection.

## What is *not* shown

- **Trashed and missing files** are hidden from default queries via `active_file_filter()`. Trashed items show in the *Trash* view; missing files show in the *Missing* view. See [trash and missing files](trash-and-missing.md).
- **Files in locked drives** are hidden entirely; the drives themselves do not appear in the home grid.
