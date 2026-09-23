# Known issues

Defects that are known, deliberately open, and **reachable by a user or an
addon**.

**What goes here** — bucket B and C findings from `.claude/rules/review-workflow.md`
R-4 that somebody can actually hit: something that breaks no declared invariant
but is wrong on screen or in the data, and any pre-existing defect a change
surfaced but did not introduce.

**What does not** — anything that breaks a declared invariant, which is fixed
before the change merges; and anything nobody can reach, such as a gap in test
coverage over correct behaviour. Those stay in the findings files under
`docs/developer-guide/reviews/<pr>/`, which are the record. A ledger that
collects every closed finding stops being read.

**One line each, plus how it is reached.** A reader must be able to decide
whether they have hit it. No investigation notes: those belong to a spec under
`docs/superpowers/specs/` or to the commit that eventually fixes it.

Remove the row when it is fixed.

---

## Setup

**An install can be returned to "everyone is admin" with no way back.**
Creating a password that carries `__admin__` needs one already, but deleting
the last such entry does not, and neither does clearing the drives' access
groups. A viewer who is admin by holding every declared group can do both, and
afterwards nobody — including the owner — can create another, because creating
one needs the entry that was just deleted. Recovery is editing `passwords.json`
on the host. Reached from `/admin/settings` on an install that has both an
admin password and group-protected drives.

**A drive renamed in the wizard is empty until the backend restarts.** The
scanner enumerates drives once, from the startup lifespan, and `PUT /drives`
rewrites `drives.json` without touching the database, so every row still names
the drive as the backend seeded it. Reached on the first run that renames a
drive, which is what the drive step is for. The *Requires restart* banner says
so; the restart, or the folder toolbar's Scan, fixes it.

**Choosing Public while a drive still carries an access group locks everyone
out.** The wizard saves the drive rows unchanged in both modes and Public writes
no password, so the drive is 404, `GET /api/admin/config/drives` is 403 and
`PUT` is 403 — nobody can unlock and nobody can write. Recovery is editing
`drives.json` on the host. Reached by typing an access group in the drive step
and then leaving the access mode at its Public default, and by re-running the
wizard on an install that already has protected drives.

**Re-running `configure.py` over a hand-edited override rewrites it.** Answering
yes to "docker-compose.override.yml already exists. Overwrite?" regenerates the
file from the recovered host paths and slugs: a drive mount's `:ro` is dropped,
and intelligence's `DRIVE_MOUNTS` is rewritten as `slug=/drives/slug`, so where a
drive's name differs from its slug intelligence can no longer find that drive's
files. Answering yes to the `drives.json` and `passwords.json` prompts resets
them to `[]`, losing the names, passwords and addon policy set in the browser,
and yes to the `search-config.yml` prompt restores the `.example` contents. Every
prompt defaults to no.

## Files

**A file moved to another drive keeps the tags of the drive it came from.**
`move_file` reassigns `File.drive` and leaves `file_tags` pointing at the source
drive's `Tag` rows, so the source drive's tag list counts a file that is no
longer in it, and the destination drive's list does not show the tag at all.
Purging the file afterwards sweeps the destination drive, so the source row is
left attached to nothing. This crosses the drive boundary rather than only
reading wrong. Reached by moving a tagged file between drives.

**Which bucket a source file lands in depends on the host's mime table.**
`classify` asks `mimetypes`, which reads a table the image may or may not carry,
so the answer is an accident of packaging rather than a decision: in the
container `.c`, `.h`, `.py` and `.pl` are **Document** while `.ts`, `.cpp`,
`.rs`, `.go`, `.java`, `.sh`, `.json` and `.yml` are **Other**. Measured across
the 1003 extensions of a full mime table, 193 change bucket depending on whether
it is present. What a source file should count as has never been decided; the
current split is not that decision.

**`.webp`, `.mts` and `.m2ts` are filed under Other.** The container carries no
mime table and Python's built-in one names none of them, so `classify` answers
`application/octet-stream`: a drive of `.webp` pictures gets no image bucket, no
image thumbnail and no page-turner, and AVCHD camcorder footage gets no player,
no thumbnail and no duration. `_EXTRA_MIMES` already covers `.mkv`, `.webm` and
`.m4a` the same way and is where these belong. Reached by putting any of the
three on a drive.

**A file reclassified out of video keeps the frame it had.** The scanner rewrites
`file_type` and `mime_type` on an existing row but clears neither
`thumbnail_path` nor `duration`, and nothing generates a document thumbnail to
overwrite the old one, so the card draws the stale video frame. Reached by a row
first written on a host whose mime table called the file video — a `.ts` scanned
on macOS, then scanned again in the container.

**A `.ts` file is handed to the video player, but only where a mime table is
installed.** That extension names both an MPEG transport stream and a TypeScript
source, and a table that has it answers `video/mp2t`, so the listing counts the
file as a video and the file page gives it a `<video>` that cannot load it. The
text viewer's allowlist names `ts`, but the player branch is reached first. The
shipped container has no such table, so there it is Other and opens as text;
this is reached by running the backend outside Docker, on macOS. The extension
alone cannot settle it.

**A file of long unbroken runs freezes the page for about twenty seconds
while it is coloured.** Several highlight.js grammars are quadratic in an
unbroken alphanumeric run. The viewer caps a line at 5000 characters and the
file at 512K, which together bring the worst case down from twelve minutes to
about twenty seconds, but do not bound it: measured at 104 lines of 4999
characters each, `csharp` took 20.5s, `c` 18.3s and `ini` 13.7s, all on the
main thread. Reached by a file whose name says `.cs`, `.c`, `.conf` or `.toml`
and whose content is separator-free blocks — a base64 dump saved under the
wrong extension. One separator anywhere in a line makes that line linear, so
ordinary files of any size are unaffected.

**A dotfile named after a language opens without colour.** `.gemfile` and
`.rakefile` are admitted by the whole-filename list through a dotfile's leading
segment, but the language lookup consults that list only for the name itself,
so they are shown as plain text. Reached inside an archive, where a dotfile is
listed at all.

**One Escape closes both the overlay sidebar and the file sheet under it.** On a phone, with the file sheet raised and the sidebar opened over it, Escape lowers the sheet as well as closing the sidebar.

**A dialog opened with a keyboard shortcut while a phone player fills the screen opens under the player.** Reached on an iPhone with a hardware keyboard (for example the search shortcut): the dialog takes focus and Escape but is hidden until the player leaves full screen.

**Some addon dialogs opened from the raised file sheet appear below the screen.** Saving a detailed summary to Knowledge and the Knowledge file-link picker draw in place inside the sheet instead of over the page.

**A focused field on a file page lifts the raised sheet above the keyboard.** On a phone, typing into the page (a note, the title) while the file sheet is raised moves the sheet up with the keyboard instead of leaving it where it was.

**Most existing links show under Related files rather than Links from / Links to.** Relations recorded before relation origins existed have no direction owner; each moves to the link sections when its note is next saved.

**The Related tab does not follow a save made in place.** After editing a note's links on its own page, the tab keeps the previous lists until the page is opened again.

**A relation recorded before relation origins existed disappears when its target note is saved first.** A backlink from note Y to note X that predates the upgrade is removed by X's first save and reappears on Y's next save. Rows written after the upgrade are not affected.

**A file whose thumbnail bytes were removed shows a grey card where its picture belongs.** `has_thumbnail` reports the database column, so the thumbnail route answers with its placeholder image: over a YouTube player while it loads, and inside the embed-restricted card. For a `.loft` nothing regenerates the file, so it stays until the thumbnail is rebuilt by hand. Reached by deleting from `data/thumbnails` out of band.

**A trashed or missing file opened again shows as a live file for a moment.** If the file was listed earlier in the session, reopening it (Back, a bookmark, collection or folder play) draws it with its player until its own request answers, then shows File not found; in collection mode the player can start.

**A note's title renamed in the page row within the first moment after opening is dropped.** The rename field accepts input before the note's own data has arrived, and a rename submitted then is ignored without an error.

**The file's inspector controls do not respond for the first moment after opening.** Download, open and cast, and links in the description, stay inert with the edit controls until the file's own data arrives.

**A top-level folder named `search`, `addons` or `collections` hides its files' pages.** A file in such a folder gets a URL that collides with the drive's own routes: one in `search` opens full screen with no tree, and the others land on the addon or collection page instead of the file.

**A file link built before a folder rename points at the old folder.** Listings carry each file's folder, so a card pressed between a rename elsewhere and the listing's refresh opens the file in a folder that no longer exists; the file itself still opens.

**The folder toolbar's view, sort and filter controls disappear while a listing reloads.** Changing the sort, typing in the filter, or a scan finishing empties the listing for a moment, and an unanswered listing looks empty to the toolbar, so the controls leave and come back. Three attempts to hold them are measured in `reviews/listing-loading-dropped/`.

**Such a relation, when its note still links it, can move to the top of Related files on the first save.** A pre-origin `(source, note)` row the note cites is replaced by the note's own row, with a new creation time.

**An addon deleting its own relation hides a link the note still has.** If `DELETE /api/internal/file_relations/{id}` removes an `internal` (N, T) row while N links T, the link is not listed until N is saved again; posting (N, T) after the link exists returns 409.

**Copying a file onto a name whose thumbnail slot is owned by a different file
swaps that file's picture.** Slots are keyed by stem, so pasting `a.mp4` next to
an existing `a.png` makes `a.png` show the video's frame, and purging the copy
leaves `a.png` blank. The right fix is a lookup, not a `stat`. Written up in
`docs/superpowers/specs/2026-09-14-thumbnail-slot-ownership.md`.

**A thumbnail failure rolls back the file operation it belongs to.** In
`rename_file`, `move_file` and batch rename, the thumbnail rename sits inside
the transaction, so an `OSError` there undoes a completed rename or move — and
for batch rename, the whole batch. A thumbnail is a cache and should not be able
to do this. Same spec.

**A non-video file keeps its thumbnail at the old path after a move or rename.**
`_move_thumbnail` is gated on `file_type == "video"`. The picture is left behind
rather than following the file. Same spec.

**Row lookup compares bytes, so a folding mount can miss a row that exists.**
Same spec.

**Moving a video onto a Missing record's path leaves two rows naming one
thumbnail.** `_move_thumbnail` renames the mover's JPEG onto the destination
slot, which the retired record still points at, so purging that record deletes
the picture the live file is showing. Reachable with no error: a file goes
missing, and another of the same name is moved into its folder. Copying does not
do this — `copy_file` takes the name away from the retired record once the JPEG
is written.

**On a phone, an archive's "More" and view menus are partly hidden by the
resting strip.** Below 640px they open as bottom sheets from inside the player
box, which is a sticky stacking context there, so their `z-40` ranks below the
file page's resting strip and its bottom ~40px is covered. Reached by opening a
ZIP file at phone width and pressing "…" or the view toggle in its toolbar.

## Navigation

**`Paste here` and `Add` are both accent-filled at once.** With a non-empty
clipboard, a folder screen carries two resting accent fills, against the one-per-
screen rule in `DESIGN.md`. Present since the clipboard feature landed. Pinned
in `frontend/src/__tests__/accent-budget.test.tsx` as the current state, not as
the wanted one — fixing it turns that test red on purpose.

**Dropping a file onto the folder it already lives in does nothing, silently.**
The drive chip in the trail and the root band in the tree both offer themselves
as destinations while dragging. The backend answers 409 and the handler swallows
it: the target lights up, the drop lands, nothing happens and nothing is said.

**Inside a drive, nothing links to the drive picker `/`.** The sidebar's logo
carried the only link and was removed to leave its row to the menu and tree
buttons. Other drives stay reachable through the sidebar's drive switcher; the
picker, and its card leading to `/unlock`, only by typing the URL. Accepted.

**A failed Library listing reads `<drive> · 0 items`.** The listing hook sets
the total to 0 on a failed request, so the scope line cannot tell a failure
from an empty drive. Reached when the listing request fails.

**A collection that is still loading, or not found, shows the tree toggle with
no tree under it.** The toggle is decided by the URL, and the collection page
mounts its pane only once the collection has loaded. Pressing it flips the
drive's tree setting and nothing else.

**The archive's download control is a 22px target.** A 14px glyph in `p-1`,
under `DESIGN.md`'s 32px floor for an icon-only button and well under the 44px
coarse-pointer floor. Present since the archive toolbar landed; pinned at its
current size in `frontend/e2e-components/header-row-crowding.spec.ts`, so
widening it is a deliberate edit to that line.

**A deep path's remaining trail segments hold about two characters on a
phone.** Once the trail folds, the drive and the parent narrow to a 48px box —
enough to press, not enough to read — before the folder you are in gives any
width. Reached with a deep path on a phone; the fold is what keeps the current
folder readable at all. Seen and accepted 2026-09-21.

**One Escape can close two popups on a folder screen.** With the toolbar's `…`
or `Add` menu open, moving by keyboard into another popup or field that handles
Escape itself — the tree pane's type filter, the selection bar's tag input, a
sidebar collection name — and pressing Escape closes that and the menu together.
Reached only by keyboard.

## iOS shell

**A `.loft` embed in the app has no mini player on an iPad.** The mini player is
off everywhere inside the app, because the video the app itself plays offers
picture in picture instead. A `.loft` file is played by the page's iframe, so it
reaches picture in picture only through **Open in the iOS player** in the
settings sheet, not by leaving the app from the page.

**After a theme change, a back swipe shows the old colours until it finishes.**
The shell's swipe animation draws the page as it was when it was left, so
switching between light and dark and then swiping back shows the previous
colours for the length of the animation. It does not happen in the browser or
the PWA; why the shell differs has not been investigated.

**If iOS ends the page's process while audio plays in the background, playback
stops when the app comes back.** The shell keeps the audio going and puts the
page back only once the app is on screen again. That reload stops the player,
as every full navigation does. Nothing saves the listening position while the
page is gone, so the saved position is the last one from before the process
ended.

**With autoplay on, an audio file whose server never answers shows nothing.**
Autoplay waits for the shell to report the file ready before it sends play, so
a load that never finishes sends no play. The shell reports waiting only while
asked to play, so the page shows neither "Loading…" nor a failure.

**After Lock, a back swipe may bring back a file page whose player is gone.**
WebKit's back-forward cache restores the previous document with its script
state, and the shell stopped that page's playback when Lock navigated away.
The restored page still believes it holds the file, and its commands are
ignored. The restore was measured on `/`, not on a file page.

**A long press starts a text selection instead of reaching the card underneath.**
Blue highlight with selection handles, on some presses and not others — wherever
selectable text sits under the finger. Measured in the shell and in mobile
Safari: identical, so it is the web app's behaviour and not the shell's.
`body { -webkit-touch-callout: none }` in `globals.css` governs the link and
image callout, not text selection; `-webkit-user-select` does, and it is not set.
A fix belongs in core, on the chrome (cards, rows, toolbars) and not on prose,
which must stay selectable.

## Addons

**A note opened from a search result is never highlighted while the knowledge
editor is installed.** `Editor.tsx` renders `MarkdownPreview` without the
`highlight` prop, and a `.md` file always opens in that editor when the addon is
present, so `?highlight=` on a note does nothing — no mark, no scroll to the
passage. Reached by searching for a phrase inside a note and pressing the
result. Core's own `MarkdownPreview` path is wired; the addon drops it.

**A search scope passed as a new object on every render re-renders without end.** `useSearchScope` updates provider state, so a component that also reads the active scope and builds its scope inline loops. Keep the scope object stable (`useMemo`).

**A tag with a non-ASCII capital lists nothing when chosen.** The rail counts `Übung` but the list filter lowercases with SQLite's ASCII-only `lower()`, so choosing it shows no notes.

**While searching within All notes, the rail's counts ignore the search.** They count the folder's notes, not the matches.

**`configure.py` checks out every empty addon submodule without asking.**
`ensure_submodules_initialized` runs `git submodule update --init --recursive`
whenever an addon directory under `addons/` is empty, so leaving an in-process
addon's submodule uninitialised — the only way to remove it — is undone by the
next run.

**An addon whose container is down is still listed.** The catalogue checks only
that the addon's proxy target variable is set. `health_check` is declared in the
intelligence and knowledge manifests and documented, but nothing reads it, so
the sidebar link and slots stay while the service is down.

**Core still branches on bundled addon names.** "Core contains no conditional
behaviour keyed to an addon name" holds only for the sidebar navigation and Add
menu code. It does not hold for: the admin settings intelligence tab,
`usePolicy(drive, "knowledge", "editor")` in `FileDetailFullScreen` and
`FileDetailContainer`, `fileDetailShell`'s knowledge editor shell, the
intelligence subtitle URL in `VideoPlayer`, `MarkdownViewModeToggle` reading the
knowledge message namespace, `useActiveSummary`'s knowledge WebSocket event,
`dirtyRegistry`'s `"knowledge-editor"` source, the knowledge active-summary URL
in `lib/api.ts`, `semanticSearch` reading the intelligence catalogue entry and
search URL, and `featureFlags`' inline knowledge editor flag.

**Turning an addon off and on in `/admin/settings` forgets its feature switches.**
An addon whose saved policy holds feature settings (`transcription_cloud: false`,
say) is saved as a plain `true` or `false` when its own switch is pressed, so the
feature settings are gone when it is turned back on.

**Media Import's `url_import` feature switch only hides a menu row.** With
`url_import: false` the Add menu has no **Import from URL**, but the Media Import
page and `POST /api/addons/media_import/link` still import from URLs on that
drive.

**Clip web page from Add can miss its result toast.** Core's `WebSocketProvider`
keeps only the last event, so when another live update arrives at almost the same
moment the ready or failed toast is sometimes not shown. The clip is still created
and appears on the Notes page.

**A YouTube feed whose entries carry no recognised video id reports "no new
videos" rather than failing.** `_list_channel_via_rss` guards against a document
that is not an Atom feed, but inside a real `<feed>` it skips any `<entry>`
without a `{http://www.youtube.com/xml/schemas/2015}videoId`. If YouTube bumps
that schema namespace or moves the id, every channel returns an empty listing,
the fallback to yt-dlp is never reached because nothing failed, and each sync
advances `last_synced_at` and clears the backoff. Every subscription then reads
as healthy while importing nothing. Distinguishing it needs the listing to treat
"entries present, none readable" as no listing at all, which no code or test
does today.

**A Media Import subscription that has never synced successfully retries every
hour forever, ahead of every healthy one.** `_next_backoff_minutes` infers the
ladder rung from the gap between `cooldown_until` and `last_synced_at`, so a row
whose first sync has never succeeded — a deleted channel, or one whose listing
cannot be fetched from either source — stays on the first rung however many
times it has failed, while a previously-synced subscription escalates to 24
hours on its second failure. The cron sweep serves never-synced rows first, so
these sit permanently at the head of a capped queue. Harmless at the current
scale (demand well under the 180 enqueues per hour the cap allows), and the
state itself is usually unrecoverable rather than transient, so retrying is not
wrong. What is missing is telling the operator: the card shows the ordinary
*Backoff active*, with nothing to distinguish "waiting out a blip" from "this
channel has never worked and probably never will".

**Clip web page from Add is silent when closed before the duplicate lookup answers.**
Pressing Clip and closing the dialog before `GET /clips?url=` returns clips nothing
and reports nothing.

**A Web Clip picked up again after a restart sends no live update when it fails.**
A reclaimed job carries no drive, so no `knowledge.clip.failed` event is published;
reopening the Notes page shows it as failed.

**Open existing in the Notes page's duplicate notice goes nowhere.** It closes the
notice without opening the earlier clip. The Add menu's notice opens it.

**A clip whose article was written can still show as failed.** If writing to the
knowledge database fails right after the article body is written (a SQLite lock,
say), or the process stops there and the retry after restart cannot read the
body, the note holding the full article is shown as failed on the Notes page.

**Create note from a file's [...] menu can leave an empty menu that will not
close.** Opened while the drive's `editor` setting is still loading, on a drive
where `editor` turns out to be off, the dialog disappears and an empty menu
remains that neither an outside tap nor Escape closes. Pressing [...] again
closes it.

**Composer: pasting a channel or playlist URL and pressing Enter before its
classification finishes (about 400 ms) imports it as a single loft instead of
subscribing.** The Import from URL dialog classifies on submit and is not
affected.

**Right after a drive switch, the previous drive's addon slots can render with the
new drive's props.** `AddonSlotsProvider` keeps the old drive's `slots` until the
new drive's catalogue arrives, so an addon turned off on the new drive (Home's
Pickup, for example) can draw for a frame or more there, and may call its API
for that drive. The proxy's `pre_check` should answer those calls with 404; that
has not been measured. The sidebar's addon rows do not do this.

**Renaming a video detaches its sidecar subtitles.** `detect_subtitles` matches
subtitle files against the video's current basename, and `rename_file` renames
only the video, so `movie.ja.srt` stops being found the moment `movie.mp4`
becomes anything else. The detail page then offers the generated track, or no
track at all. Renaming the subtitle files to match by hand attaches them again.

**A second press of the player's subtitle switch inside one clock tick does
nothing.** The switch draws from what the player reports, which is polled every
250 ms while playing and every 1000 ms while paused, and it sends the opposite
of what it drew. Pressed twice quickly it therefore sends the same value twice
and the second press changes nothing. The scrub bar and the volume slider hold
the requested value until the poll confirms it (`pendingSeek`,
`pendingVolume`); captions have no equivalent.

**The player's subtitle switch is obeyed only while Litloft draws the
controls.** Turn captions off, hand the frame to the browser's own controls,
and a subtitle track arriving with the file's detail answer turns itself on.
Going back to Litloft's controls turns it off again. Where the browser-controls
choice is already stored when the file opens, the saved "off" is not applied at
all and the track set's own default stands. The browser's captions menu never
writes `captionsPreferred`, so nothing on that surface records the viewer's
choice, and asserting a stored one there would undo what they just chose.
