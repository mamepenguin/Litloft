# Browsing files

The drive home page (`/drive/<name>`) is the main browsing surface. Folders are walked from the drive root; subfolders open at `/drive/<name>/<path>`. The breadcrumb row carries the tree toggle on the left and the **Add** button on the right; below it you find a folder grid, several *content rows* (Continue watching, Recently played, Recently added, Favourites, Liked), and the drive root's own file listing last. Every surface reads the same backend, and a change you make on one of them refreshes the others (see [real-time updates](#real-time-updates) for what does and does not propagate between separate tabs).

## Drive home layout

![Annotated drive home page showing the breadcrumb, folder grid, file grid, and content rows](../images/user-guide/drive-home-overview.png)

The numbered areas in the screenshot map to the main browsing surfaces: breadcrumb navigation, folder cards, file cards, and the activity rows that surface recent or in-progress items. The screenshot predates the current header: **Add** now sits at the right-hand end of the breadcrumb row rather than above the file listing, and the content rows wrap instead of scrolling sideways.

## Folder grid

- Folders show a thumbnail (borrowed from the first video or image anywhere beneath them) and a file count. The count is **recursive** — it includes every active file in the folder *and* its subfolders.
- Clicking opens that folder.
- Right-click (or long-press on touch) opens the **folder menu**: Open, New file here, New folder here, Pin / Unpin, Rename, Move, Delete. Which entries appear depends on the surface — the tree pane offers the create actions, the folder grid does not.
- Addon actions appear in this menu too, below a separator under the app's own rows — *intelligence* offers its batch AI actions there, for the files the listing is showing.
- The folder list is derived from the paths of the files in the drive, so a folder holding no files at all would otherwise vanish. Those are recorded in the `empty_folders` table and merged back into the listing with a count of 0.

## File grid and list modes

A toolbar above the grid lets you:

- Choose **grid** or **list** from the **View** menu. The button reads the layout that is on. In a real folder the choice is remembered per folder (localStorage, under `folderPrefs:{drive}`); on the drive root, in the flat views, and in search it falls back to a single global preference. Before you have ever chosen, the mode is guessed from what the folder mostly holds — Markdown folders open as a list, video/image/audio folders as a grid.
- Put the listing in order from the **Sort** menu: **newest / oldest** (indexed date), **title A-Z / Z-A**, **largest / smallest**, or **random** — seven orders. Sorting by when you liked something is not among them; that order belongs to the Liked view, which chooses it for you, because inside an ordinary folder most rows have no like date at all. The button reads the order that is on. Search results add a **relevance** option, which is their default. Sort is remembered per folder in the same place as the view mode. While the order is random, the same menu offers **Reshuffle** below the orders.
- Narrow the listing from the **Filter** menu, which holds both axes. **File type** (All / Video / Image / Audio / Document / Markdown / PDF / Archive / Other) — Markdown and PDF sit *under* Document, so choosing Document returns them too and choosing one of them narrows further. **Verification** (All / Verified only / Unjudged only) sits beside it, except in search results, where a ranked and truncated result set cannot be narrowed after the fact without quietly losing hits. The button carries the word *Filter* until something is on, then the names of what is on.

  The server applies both and narrows the query itself, so they are right about files you have not scrolled to yet, and the count beside the folder name is the server's. Three things sit outside that: the drive root's own file listing has no Filter menu at all; *recently played* fetches the last fifty and sifts verification over those rows in the browser, so its count is how many of the fifty are left; and a search count is the server's filename total plus the semantic hits the browser found on top of it.
- Turn on **Select mode** from the overflow (`…`) menu, then click cards to select them. `Cmd/Ctrl+click` turns selection on and toggles a card in one gesture, and `Shift+click` extends the selection to a range. A selection bar appears at the bottom with tag, rename, add-to-collection, copy, cut, move, and move-to-trash. On a narrow screen it keeps **Tag** and **Move** and puts the other five behind `…`, with their names — it does not scroll sideways, so nothing is off the edge.
- **Rescan** the drive, also from the overflow menu.
- **Pin this folder** to the sidebar, also from the overflow menu — the same pin the folder's own right-click menu offers, for the folder you are standing in. It is not offered on the drive root, which has no folder to pin.
- **Add** anything to the folder, from the one **Add** button: upload files, upload a folder, create a folder, create a note. It is the only filled button on the bar. An addon can contribute further rows, which appear below a separator at the bottom of the menu.

  On the drive root this button is in the breadcrumb row instead, at the top of the page — the file listing there is the last of up to seven sections, so a button above it would be a screenful of scrolling from the page it acts on. It offers uploading and **New Folder** only; creating a note and the addon rows are folder-toolbar features. **New Folder** opens its name field directly under the breadcrumb row.
- **Play** everything playable in the folder, on folders that hold something playable.

**Folders follow the mode too.** In grid mode they are cards above the file
cards; in list mode they are rows above the file rows, the same height and
reading the same way. A grid of cards sitting above a column of
rows would be two answers to "what am I looking at" on one screen. A folder row
does everything a folder card does — it takes a drop, renames in place, and
right-clicks to the same folder menu, and carries the same `⋮` button as a file row for reaching those actions from the keyboard.

On a wide screen a row's **contents** stop at 960px, so the name and the size
stay near enough each other to read as one row rather than as two things at
opposite ends of the window. The row itself still spans the full width, so the
whole strip stays clickable and lights up on hover.

Below 768px the bar carries **Play**, **Filter** and `…`. **View** and
**Sort** move inside `…` as sections of it — the same rows, in the same
order — and **Add** moves into its own row just above the bar, with any
addon buttons beside it.

Nothing loses its label. The Filter button naming both of its axes, and the
"Search the whole drive" link on a folder reached through a tag, are the two
whose labels can outgrow the space; both are shortened with an ellipsis
rather than dropped, and the full text stays in the control's accessible
name. Every control the app itself draws on the bar is at least 44px for
touch — a button contributed by an addon is that addon's to size.

The bar is a single row at every width, with one exception: between 768px
and about 785px, with an addon button on the bar, both filter axes narrowed
at once, and the listing sorted by title or by size, it takes a second row.
Any one of those four conditions missing and it does not.

The **New Folder** name field takes a line of its own while it is open,
under the bar's controls at 768px and up and above them on a narrow
screen, so it never displaces anything.

On a listing with nothing in it at all — no files and no subfolders —
the toolbar drops the controls for arranging things: View, Sort and the
Filter menu. They go from the overflow too, so they are put away rather
than merely moved. What stays is everything that puts
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

### Photo folders pack instead

A folder that is almost entirely images lays its thumbnails out at the
pictures' own proportions rather than in equal cards: variable widths,
a fixed height per row, and each row filled to the edge. A tall
photograph is drawn tall and a panorama is drawn wide, so the black
bars that a 16:9 card puts around them are gone.

There is no switch for this. The grid packs when at least nine of every
ten files in view are images whose dimensions are known, which is what
a photo folder looks like and what a video folder does not — video
thumbnails really are 16:9, and their cards keep the meta line, which
in a folder of videos is the part that tells one row from another. A
packed cell shows nothing but the picture; its filename appears when
you hover or tab to it, and is always shown on a touch screen. Search
results are never packed, because the match line under each result is
saying something.

Very wide and very tall pictures are cropped to fit between 3:1 and
1:2. A picture whose dimensions were never recorded is drawn square.

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

### What the tree lists

The tree shows **folders only**. It is a map of the drive's shape, and the pane
beside it already lists the files in the folder you are standing in — drawing
them in both places spends the tree's height saying the same thing twice, and
on a drive of any size the folders get pushed off the bottom by the files under
the first one.

**Show files too**, at the foot of the pane, brings them back. The setting is
remembered per drive, so a drive of notes — where the file *is* the destination
— can keep them on while a video drive keeps them off. Turning it on also gives
a caret to folders that hold only files: with files hidden those are leaves,
because expanding them would show nothing. A folder's file count is shown
either way; that is the folder's size, not a count of what the tree draws.

### The tree and the sidebar take turns

Opening the folder tree **puts the sidebar away**. Both of them tell you where
you are, and one surface answering that at a time is enough — with both open on
a 1512px screen they take 520px between them before any of your files appear.

The sidebar is put away, not shut: the hamburger still opens it over the top
whenever you want it, and closing the tree brings it back exactly as you had
it. If you keep the sidebar open, it is open again the moment the tree goes;
if you keep it closed, it stays closed. Nothing about your setting is changed
by the tree borrowing the space. Below 1200px the sidebar already opens over
the content rather than beside it, so there is nothing to lend and nothing
changes.

Both buttons show which one is holding the job: the tree toggle in the toolbar
and the hamburger each look pressed while their surface is the one on.

The path above the file list is always there, whichever of the two is showing.

**On a narrow window the tree stays closed** even if you left it open on a
bigger screen — below 768px it would fill the viewport and leave no room for
the folder you came to look at. Your setting is untouched, so widening the
window brings the tree straight back. You can still open it deliberately down
there; it fills the screen and the ✕ in its header closes it again.

### Tree pane filter

When the folder tree pane is open, it has its own filter row at the top — text plus a kind dropdown offering the same nine choices as the toolbar — but different in scope:

- Matches against **folder names** across the whole tree of the current drive — and against **file names** as well when *Show files too* is on. The filter searches what the tree lists, so its reach follows that setting rather than diverging from it, and the "nothing found" line names the same thing the field asked for.
- The **kind** dropdown beside it filters files, so with *Show files too* off it changes only the counts shown against each folder, not which rows appear. Turn *Show files too* on to narrow the rows by kind.
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

## Content rows

The drive home page surfaces several content rows:

- **Continue watching** — files whose playback position is below 90% of their duration, newest first. Finished items fall out at that gate, and so do view-only opens of text, Markdown, and images (they carry no duration), so you only see media you actually paused mid-way.
- **Recently played** — the same history without the 90% gate.
- **Recently added** — files most recently indexed.
- **Favourites** — `is_favorite = true`.
- **Liked** — files you marked as good, most recently liked first.

Continue watching and Recently played need a profile; without one, no history is recorded and the two rows do not appear. See [profile and preferences](profile-preferences.md).

A row shows as many cards as fit its width and no more — it does not
scroll sideways, so nothing is hidden off the right-hand edge. The width
that counts is the row's own, not the window's: a row about 790px wide
or narrower — any phone, and any window with the tree pane open beside
it — shows two columns over two rows, and a wider one shows a single row
of as many columns as fit.

Every row therefore has a **See all**, because that link is the only way
to the cards the row did not draw. Where the count is known it is on the
link: *See all (619)*. Continue watching and Recently played carry no
count, because the watch-history API returns the page rather than the
total, and both send you to the same place — Recently played is the
whole history, so it holds everything Continue watching was showing you
and more.

Below the content rows the drive home lists the files that sit at the drive root, using the same grid as any other folder.

## Pinned folders

Pin a folder to keep it one click away from anywhere in the drive.

- Right-click a folder → **Pin**, or, for the folder you are already inside, the toolbar's `…` → **Pin this folder**. Pinned folders appear in the **Pins** section of the sidebar, not on the drive home page.
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
