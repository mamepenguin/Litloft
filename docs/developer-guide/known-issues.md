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

**Re-running `configure.py` over a hand-edited override rewrites it.** Answering
yes to "docker-compose.override.yml already exists. Overwrite?" regenerates the
file from the recovered host paths and slugs: a drive mount's `:ro` is dropped,
and intelligence's `DRIVE_MOUNTS` is rewritten as `slug=/drives/slug`, so where a
drive's name differs from its slug intelligence can no longer find that drive's
files. Answering yes to the `drives.json` and `passwords.json` prompts resets
them to `[]`, losing the names, passwords and addon policy set in the browser,
and yes to the `search-config.yml` prompt restores the `.example` contents. Every
prompt defaults to no.

**Choosing Protected in `/setup` saves no password.** The wizard adds `__admin__`
to the password's groups and the settings API rejects `__admin__` as an unknown
group; the wizard ignores the rejection and finishes, so every drive stays public
and `/admin` stays open. Reached on every first run that picks Protected.

**`/setup` finishes when saving drives or passwords fails.** Only the addon
policy save is checked, so a rejected drives save shows up as an unknown drive
error from the policy save, or not at all.

## Files

**Most existing links show under Related files rather than Links from / Links to.** Relations recorded before relation origins existed have no direction owner; each moves to the link sections when its note is next saved.

**The Related tab does not follow a save made in place.** After editing a note's links on its own page, the tab keeps the previous lists until the page is opened again.

**A relation recorded before relation origins existed disappears when its target note is saved first.** A backlink from note Y to note X that predates the upgrade is removed by X's first save and reappears on Y's next save. Rows written after the upgrade are not affected.

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

**`?view=library&tag=<tag>` leaves the whole column unlit.** The listing is
filtered but no row says so and no row clears it. No link in the app produces
this URL; it is reachable only by typing it.

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

**One Escape can close two popups on a folder screen.** With the toolbar's `…`
or `Add` menu open, moving by keyboard into another popup or field that handles
Escape itself — the tree pane's type filter, the selection bar's tag input, a
sidebar collection name — and pressing Escape closes that and the menu together.
Reached only by keyboard.

## iOS shell

**External links do nothing.** Every non-`loft://` markdown link renders with
`target="_blank"`. `WKWebView` discards such a navigation unless the UI delegate
implements `webView(_:createWebViewWith:for:windowFeatures:)`, and the shell does
not. A tap produces no navigation, no error and no feedback, and the link target
cannot be reached from inside the app. Whether these should open in Safari or in
an in-app browser is undecided.

**Video stops when the app leaves the screen; audio does not.** Only audio is
played by the shell so far, so a video is still the web view's and WebKit
suspends it. Confirmed on device. Video moves to the native player in a later
phase.

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
