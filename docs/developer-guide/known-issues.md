# Known issues

Defects and doubts that are known and deliberately open. A review finding that
is neither fixed nor listed here has been discarded.

**What goes here** — bucket B and C findings from `.claude/rules/review-workflow.md`
R-4: something that breaks no declared invariant but reads wrong, and any
pre-existing defect a change surfaced but did not introduce.

**What does not** — anything that breaks a declared invariant. Those are fixed
before the change merges.

**One line each, plus how it is reached.** A reader must be able to decide
whether they have hit it. No investigation notes: those belong to a spec under
`docs/superpowers/specs/` or to the commit that eventually fixes it.

Remove the row when it is fixed.

---

## Files

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

**A paste that copies a thumbnail is not held by any test.** Deleting the line
that points the new row at the JPEG just written for it leaves the whole suite
green, at `develop` as well: the ordinary outcome of the feature — paste a
video, see its picture — has no observer. The two tests that touch the
assignment do so incidentally, through Missing records.

**Copying onto a Trashed record is untested end to end.** The `db.flush()` that
separates the ghost's DELETE from the copy's INSERT is load-bearing — remove it
and a real paste fails with a UNIQUE violation — and no test seeds a trashed
record at a copy, move or rename destination.

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

**Below 1200 px, the drive picker is two steps from a drive's Home.** The
sidebar is `aria-hidden` when closed and the header has no link to `/`, so
getting back means opening the menu first. Accepted.

**The sidebar and Home disagree on two icons, and one of them means two
things.** Recently Viewed and Recently Added are `Clock` / `FilePlus` in the
sidebar and `History` / `Clock` on Home — so a clock face is "viewed" in one
place and "added" in the other.

**A failed inline rename keeps its message for three seconds across a drive
switch.** `useInlineRename` clears the message on a timer rather than on
navigation, so it can be read against the new drive's contents.
