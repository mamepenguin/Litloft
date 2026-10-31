# Known issues

Defects that are known, deliberately open, and reachable by a user or an
addon.

What goes here: bucket B and C findings (`docs/process/review.md`, Buckets and
scope) that somebody can actually hit: something that breaks no declared invariant
but is wrong on screen or in the data, and any pre-existing defect a change
surfaced but did not introduce.

What does not go here: anything that breaks a declared invariant, which is fixed
before the change merges; and anything nobody can reach, such as a gap in test
coverage over correct behaviour. Those stay in the review records under
`docs/process/reviews/<topic>/` (earlier ones in
`docs/developer-guide/reviews/<pr>/`), which are the record. A ledger that
collects every closed finding stops being read.

One line each, plus how it is reached. A reader must be able to decide
whether they have hit it. No investigation notes: those belong to a spec under
`docs/specs/` or to the commit that eventually fixes it.

Remove the row when it is fixed, or when it is decided not to fix it; the commit
says why.

---

## Setup

**An install can be returned to "everyone is admin" with no way back.**
Creating a password that carries `__admin__` needs one already, but deleting
the last such entry does not, and neither does clearing the drives' access
groups. A viewer who is admin by holding every declared group can do both, and
afterwards nobody, including the owner, can create another, because creating
one needs the entry that was just deleted. Recovery is editing `passwords.json`
on the host. Reached from `/admin/settings` on an install that has both an
admin password and group-protected drives.

**Choosing Public while a drive still carries an access group locks everyone
out.** The wizard saves the drive rows unchanged in both modes and Public writes
no password, so the drive is 404, `GET /api/admin/config/drives` is 403 and
`PUT` is 403, so nobody can unlock and nobody can write. Recovery is editing
`drives.json` on the host. Reached by typing an access group in the drive step
and then leaving the access mode at its Public default, and by re-running the
wizard on an install that already has protected drives.

**`readonly` in `drives.json` does nothing.** `drives.json.example` shows the key
and nothing reads it, so a drive declared read-only still accepts a paste, a move
or an edit.

## Files

**A page foliate moves by itself is not saved.** Extending a text selection
past the edge of the page, or focus landing on something off the page, turns it
without going through the reader's own turn, so that place is not recorded.

**Paging back to the first page and leaving keeps the later place.** The first
page is never written, so the book reopens where it was last saved.

**A source file's card shows no excerpt.** A card draws the first lines of a
file in place of a thumbnail only when the file is a Document, so the source
files that are now Other lost it: `.c`, `.h`, `.py`, `.pl`, `.css`, `.js` and
`.bat` had one and no longer do. The file still opens as text; only the card is
blank. The gate is `file_type === "document"` in `FileCard`, `FileListRow` and
`JustifiedFileCell`, and it is a bucket test where a name test would serve.

**Some extensions are filed as something they are not.** `.ass` is a subtitle
format and is filed as audio; `.3gp`, `.3g2`, `.3gpp` and `.3gpp2` are video
containers and are filed as audio; `.mpa` is MPEG audio and is filed as video.
Each was inherited from the host mime table and is now written down as a
decision this project made, which it never did. Reached by putting one on a
drive: the wrong player, the wrong bucket in the type filter, and for `.ass` a
subtitle listed as a media file of its own.

**A file moved between drives before the tag fix keeps its old tag links until it is moved again.**
Such a file still links to the `Tag` rows of the drive it came from, so its tag
counts on that drive and is missing from the tag list of the drive it sits on.
Filtering by that name on its current drive still lists it, so that drive's count
and listing can disagree. There is no data migration. Reached only on a database that had such moves; the next move of
the file between drives sweeps the old rows.

**Adding a tag to a note whose frontmatter tags were never projected replaces them.**
The tag chips are built from `File.tags`. A note registered before its frontmatter
tags were projected, or changed on disk, keeps no chips until the knowledge scanner has
run or the note has been saved; adding a tag then writes only that tag. Seen with the
knowledge addon not running.

**Editing a chip removes a frontmatter tag the tag rules reject.**
A tag such as `machine learning` (it has a space) is not projected, so it shows no
chip. The chip list is what the web UI saves, so the next chip edit on that note drops
the tag from the file: `tags: [machine learning, ok]` plus a chip `more` leaves
`[ok, more]`.


**Bulk tagging skips a Markdown file it cannot rewrite without saying so.**
For `.md` the tags live in the frontmatter, so a note whose frontmatter uses CRLF
line endings, does not parse, or has a `tags:` that is not a list is refused and
listed in the response's `errors[]`, which the selection bar does not show.
Reached by selecting such a note with others and adding a tag: the others get
it, that note does not.

**Removing a note's last tag in the tag chips can turn the top of its body into frontmatter.**
When `tags:` is the only frontmatter key, the web editor writes the body back
without a frontmatter block, so a body that opens with a `---` line is read as a
new block: its text disappears from the preview and any `tags:` in it become the
note's tags. Reached by clearing all tags on such a note in the web UI.

**Some addon dialogs opened from the raised file sheet appear below the screen.** Saving a detailed summary to Knowledge and the Knowledge file-link picker draw in place inside the sheet instead of over the page.

**A focused field on a file page lifts the raised sheet above the keyboard.** On a phone, typing into the page (a note, the title) while the file sheet is raised moves the sheet up with the keyboard instead of leaving it where it was.

**The Related tab does not follow a save made in place.** After editing a note's links on its own page, the tab keeps the previous lists until the page is opened again.

**A top-level folder named `search`, `addons` or `collections` hides its files' pages.** A file in such a folder gets a URL that collides with the drive's own routes: one in `search` opens full screen with no tree, and the others land on the addon or collection page instead of the file.

**A mutual link recorded before relation origins existed loses one direction until both notes are saved.** Saving X with a link back to Y replaces the old (Y, X) row with X's own, so Y's link to X is not listed until Y is next saved.

**An addon deleting its own relation hides a link the note still has.** If `DELETE /api/internal/file_relations/{id}` removes an `internal` (N, T) row while N links T, the link is not listed until N is saved again; posting (N, T) after the link exists returns 409.

**Copying a file onto a name whose thumbnail slot is owned by a different file
swaps that file's picture.** Slots are keyed by stem, so pasting `a.mp4` next to
an existing `a.png` makes `a.png` show the video's frame, and purging the copy
leaves `a.png` blank. Two such files need no copy to collide: a scan of a folder
holding `book.pdf` and `book.epub` gives both rows `book.jpg`, so one shows the
other's cover. The right fix is a lookup, not a `stat`. Written up in
`docs/superpowers/specs/2026-09-14-thumbnail-slot-ownership.md`.

**A thumbnail failure rolls back the file operation it belongs to.** In
`rename_file`, `move_file` and batch rename, the thumbnail rename sits inside
the transaction, so an `OSError` there undoes a completed rename or move (for
batch rename, the whole batch). A thumbnail is a cache and should not be able
to do this. Same spec.

**A non-video file keeps its thumbnail at the old path after a move or rename.**
`_move_thumbnail` is gated on `file_type == "video"`. The picture is left behind
rather than following the file. Same spec.

**Moving a video onto a Missing record's path leaves two rows naming one
thumbnail.** `_move_thumbnail` renames the mover's JPEG onto the destination
slot, which the retired record still points at, so purging that record deletes
the picture the live file is showing. Reachable with no error: a file goes
missing, and another of the same name is moved into its folder. Copying does not
do this: `copy_file` takes the name away from the retired record once the JPEG
is written.

**A zoomed picture in the image or archive viewer is not re-fitted when the
window changes size or the picture finishes loading.** Rotating a phone while
zoomed can leave empty space beside the picture until the next drag or pinch,
which puts it back against its edges. Reached by zooming, then rotating or
resizing.

## Navigation

**`Paste here` and `Add` are both accent-filled at once.** With a non-empty
clipboard, a folder screen carries two resting accent fills, against the one-per-
screen rule in `DESIGN.md`. Present since the clipboard feature landed. Pinned
in `frontend/src/__tests__/accent-budget.test.tsx` as the current state, not as
the wanted one, so fixing it turns that test red on purpose.

**Dropping a file onto the folder it already lives in does nothing, silently.**
The drive chip in the trail and the root band in the tree both offer themselves
as destinations while dragging. The backend answers 409 and the handler swallows
it: the target lights up, the drop lands, nothing happens and nothing is said.

**The sidebar's tag list goes stale after a paste, bulk tagging, an upload or a quick note.** It keeps its
old rows until a reload or a change of folder or drive; the listing itself is
current.


**A failed Library listing reads `<drive> · 0 items`.** The listing hook sets
the total to 0 on a failed request, so the scope line cannot tell a failure
from an empty drive. Reached when the listing request fails.

**The archive's download control is a 22px target.** A 14px glyph in `p-1`,
under `DESIGN.md`'s 32px floor for an icon-only button and well under the 44px
coarse-pointer floor. Present since the archive toolbar landed; pinned at its
current size in `frontend/e2e-components/header-row-crowding.spec.ts`, so
widening it is a deliberate edit to that line.

## iOS shell

**A long press starts a text selection instead of reaching the card underneath.**
Blue highlight with selection handles, on some presses and not others, wherever
selectable text sits under the finger. Measured in the shell and in mobile
Safari: identical, so it is the web app's behaviour and not the shell's.
`body { -webkit-touch-callout: none }` in `globals.css` governs the link and
image callout, not text selection; `-webkit-user-select` does, and it is not set.
A fix belongs in core, on the chrome (cards, rows, toolbars) and not on prose,
which must stay selectable.

## Addons

**A wide table in a detailed summary is clipped instead of scrolling.** The
intelligence addon's `DetailedSummarySection` builds its tables itself rather
than through `MarkdownPreview`, so they do not get the horizontal scroll
container core notes have. Reached on a phone with a detailed summary whose
table is wider than the screen.

**A note made from an Ask citation of a book links to the book, not the
chapter.** The capture basket keeps the chapter title as the citation's label
but has no place for the section number, so the note's link opens the book
where it was last read. Reached by adding an EPUB citation from Ask to the
capture basket and making a note from it.

**A Markdown note opened from a search result is never highlighted while the
knowledge editor is installed.** `Editor.tsx` renders `MarkdownPreview` without the
`highlight` prop, and a `.md` file always opens in that editor when the addon is
present, so `?highlight=` on a note does nothing: no mark and no scroll to the
passage. Reached by searching for a phrase inside a note and pressing the
result. Core's own `MarkdownPreview` path is wired; the addon drops it.

**The intelligence `/similar/{file_id}` route answers while the addon is off for
the drive.** It is gated by file access only, so it stays 200 under a policy of
`false`, where feature-gated routes answer 404.

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

**Open existing in the Notes page's duplicate notice goes nowhere.** It closes the
notice without opening the earlier clip. The Add menu's notice opens it.

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

**A file with only a detailed summary is reported as having a short summary.**
`GET /summary` and the batch run treat the row as present, so the batch skips
the file and the panel shows an empty short summary.

**Short summaries off with detailed summaries on still sends a short summary
request.** Generating a detailed summary also asks the LLM for the short one.

**Refreshing a video's captions can take another video's subtitle file.** Media
Import looks for the file yt-dlp wrote as `<title>.*.vtt`, which also matches
`<title>.<anything>.vtt` belonging to a different video, and may rename it to
`<title>.vtt` or delete it. Reached when one folder holds an import named
`Title` and another named `Title.<something>`.

**Renaming a file to a different case of its own name changes only the
listing.** Litloft shows the new name, but on a Docker Desktop bind mount of a
case-insensitive macOS volume the file on disk keeps its old case, because a
rename that differs only in case does nothing inside the container. The file
still opens. Reached with `Foo.txt → foo.txt`, single or batch rename.

**An Ask about files you watched can skip its summary narrowing.** Ask's coarse
retrieval keeps the drive's 20 best-matching file summaries before it intersects
them with your watch history, so when other files' summaries outrank every
watched file, the intersection is empty and Ask searches the whole history
instead. Reached with an Ask that uses personal history in a drive where many
unwatched files match the question better than the watched ones.

**An Ask over several long documents on a local LLM can stay on "Creating
answer…".** Recorded on 2026-10-21. The cause is not established: the code
sends the closing event when the LLM call fails, so a failed call alone does not
explain it.
