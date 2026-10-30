# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- artifact of claude-verify is missing

## Needs a human

### unspecified_behavior

Note: A file carrying two case variants of one tag in the source drive (`Alpha` and `alpha`, which uq_tags_drive_name allows) silently ends up with a single tag at the destination, and the spelling kept depends on iteration order when the destination has no row.; retarget_file_tags sweeps every unattached Tag row in the source drive, not only those this file left, so unrelated orphans are deleted in the same move transaction.; If the destination holds both `Alpha` and `alpha`, .first() has no ORDER BY, so which row is reused is not defined.; A destination row's spelling wins over the moved file's. For a Markdown file the frontmatter keeps its own spelling while File.tags shows the destination's, until something re-projects it.
- claude-deep: Moving a file merges case variants of a tag on that file into one tag on the destination (`tagops.py:50-51`), which is a visible change only if a file holds both spellings.
- claude-deep: A `.md` file moved onto a destination row with a different spelling keeps the row's spelling in `File.tags` while its frontmatter keeps its own. A later `replace_file_tags` from the frontmatter renames the destination row for every file on that drive (`backend/app/routers/files.py:169-172`), so the row's spelling is only preserved until then.
- claude-deep: Each cross-drive move also sweeps every other orphan tag row on the source drive, not only rows this file left (`tagops.py:59`).
- claude-deep: A non-ASCII tag differing only in case between drives, such as `Übung` and `übung`, does not match and produces two rows on the destination, because of the same folding mismatch as F1.
- claude-read: A file carrying two case variants of one tag in the source drive (`Alpha` and `alpha`, which uq_tags_drive_name allows) silently ends up with a single tag at the destination, and the spelling kept depends on iteration order when the destination has no row.
- claude-read: retarget_file_tags sweeps every unattached Tag row in the source drive, not only those this file left, so unrelated orphans are deleted in the same move transaction.
- claude-read: If the destination holds both `Alpha` and `alpha`, .first() has no ORDER BY, so which row is reused is not defined.
- claude-read: A destination row's spelling wins over the moved file's. For a Markdown file the frontmatter keeps its own spelling while File.tags shows the destination's, until something re-projects it.

### unspecified_behavior

Note: Moving a file merges case variants of a tag on that file into one tag on the destination (`tagops.py:50-51`), which is a visible change only if a file holds both spellings.; A `.md` file moved onto a destination row with a different spelling keeps the row's spelling in `File.tags` while its frontmatter keeps its own. A later `replace_file_tags` from the frontmatter renames the destination row for every file on that drive (`backend/app/routers/files.py:169-172`), so the row's spelling is only preserved until then.; Each cross-drive move also sweeps every other orphan tag row on the source drive, not only rows this file left (`tagops.py:59`).; A non-ASCII tag differing only in case between drives, such as `Übung` and `übung`, does not match and produces two rows on the destination, because of the same folding mismatch as F1.
- claude-deep: Moving a file merges case variants of a tag on that file into one tag on the destination (`tagops.py:50-51`), which is a visible change only if a file holds both spellings.
- claude-deep: A `.md` file moved onto a destination row with a different spelling keeps the row's spelling in `File.tags` while its frontmatter keeps its own. A later `replace_file_tags` from the frontmatter renames the destination row for every file on that drive (`backend/app/routers/files.py:169-172`), so the row's spelling is only preserved until then.
- claude-deep: Each cross-drive move also sweeps every other orphan tag row on the source drive, not only rows this file left (`tagops.py:59`).
- claude-deep: A non-ASCII tag differing only in case between drives, such as `Übung` and `übung`, does not match and produces two rows on the destination, because of the same folding mismatch as F1.
- claude-read: A file carrying two case variants of one tag in the source drive (`Alpha` and `alpha`, which uq_tags_drive_name allows) silently ends up with a single tag at the destination, and the spelling kept depends on iteration order when the destination has no row.
- claude-read: retarget_file_tags sweeps every unattached Tag row in the source drive, not only those this file left, so unrelated orphans are deleted in the same move transaction.
- claude-read: If the destination holds both `Alpha` and `alpha`, .first() has no ORDER BY, so which row is reused is not defined.
- claude-read: A destination row's spelling wins over the moved file's. For a Markdown file the frontmatter keeps its own spelling while File.tags shows the destination's, until something re-projects it.

## Findings

A: 0
B: 6
C: 0

### claude-deep:F1-non-ascii-capital-tag-fails-move — bucket B, MEDIUM, open

Claim: A cross-drive move fails with a 500 when the file carries a tag with a non-ASCII capital and the destination drive already has a row of that exact name.
Impact: A user with a tag such as `Übung` or a full-width capital name on both drives cannot move that file: the single move returns 500 and a batch move or paste reports it as not moved, with no way forward except renaming the tag. For a video with a thumbnail the failure also leaves the JPEG in the destination slot while the row keeps the source path, so the file that stayed on the source drive loses its thumbnail.
Evidence: `backend/app/services/tagops.py:49` builds the key with Python `str.lower()`, which folds non-ASCII capitals. `tagops.py:54` compares it with SQL `lower(Tag.name)`, which folds ASCII only: no custom `lower` or ICU is registered in `backend/app`, and `docs/developer-guide/known-issues.md:182` records the same ASCII-only behaviour. The lookup therefore misses the existing row, `tagops.py:57` builds a second `Tag` with the same (drive, name), and `uq_tags_drive_name` (`backend/app/models.py:47`) rejects it at the flush in `cleanup_orphan_tags`. `backend/app/services/fileops.py:508-517` catches the error, rolls back and reverses the media file only. The thumbnail was already renamed at `fileops.py:491`, and that rename is not reversed. Before this change a move never queried tags, so this failure path is new.
Repro: not_reproduced (no command execution available; derived by reading). Steps: tag a file on drive A `Übung`, move it to drive B, which creates the row on B. Tag another file on A `Übung` and move it to B. Expected from the code: 500 from `PUT /api/files/{id}/move`, or an entry in `errors` from `PUT /api/files/batch/move`. No test in `backend/tests/test_move_tags_follow_drive.py` uses a non-ASCII capital, and its failed-move test seeds no thumbnail.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Compare in SQL on both sides, `func.lower(Tag.name) == func.lower(tag.name)`, so an identical name always matches, and add a test with a non-ASCII capital on both drives.

</details>

### claude-deep:F2-tag-lost-via-pending-delete-row — bucket B, MEDIUM, open

Claim: When the move's destination path is held by a trashed row whose file is gone from disk and that row was the only user of a tag, the moved file silently loses that tag.
Impact: The move answers 200 and the file arrives, but the tag is gone from both drives. For a non-`.md` file `File.tags` is the canonical store, so the tag cannot be recovered. The trigger is narrow: the trashed file must have been removed from the drive outside the app, because a file still on disk gives a 409 first at `fileops.py:474`.
Evidence: `backend/app/services/fileops.py:191-194`: `resolve_db_path_conflict` deletes the ghost and calls `cleanup_orphan_tags(db, drive)`, which only marks the now-orphan destination `Tag` with `db.delete` (`tagops.py:30-31`) and does not flush. The session uses `autoflush=False` (`backend/app/database.py:38`), so the query at `tagops.py:52-56` still returns that row and `retarget_file_tags` attaches it at `tagops.py:58`. The object remains in the identity map, so the save-update cascade does not take it out of the pending delete set. The flush at `tagops.py:59` then inserts the `file_tags` row and deletes the tag, and `ondelete=CASCADE` with `PRAGMA foreign_keys=ON` (`models.py:28`, `database.py:35`) removes the new association. The source row is swept in the same call.
Repro: not_reproduced (no command execution available; the SQLAlchemy flush order is reasoned from its unit-of-work behaviour, not observed). Steps: on drive B, tag `b/a.mp4` with `alpha` as the only user of that tag, trash it, and delete the file from the drive by hand. On drive A, tag `a.mp4` with `alpha` and move it to B's root. Expected from the code: 200, and no `alpha` on the file, on A or on B. No test covers a ghost at the destination, and a grep of the move, conflict and ghost named test files for `resolve_db_path_conflict` and `deleted_at` found nothing.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `db.flush()` after `cleanup_orphan_tags(db, drive)` in the trashed branch of `resolve_db_path_conflict`, so the lookup can no longer see the row, and add a test for this case.

</details>

### claude-deep:F3-existing-cross-drive-links-not-repaired — bucket B, MEDIUM, open

Claim: Tag links written by earlier cross-drive moves are not repaired, and moving such a file again leaves its old tag row behind on the drive it first came from.
Impact: On an existing database, files moved before this fix still count in the old drive's tag list and stay absent from the current drive's list until they are moved again or their tags are edited. Moving such a file A to B (old code) and then B to C (new code) gives the correct links on C but leaves a row on A that lists with count 0, because the list query outer-joins. Moving it back to the tag's own drive repairs it, so the result depends on the route taken.
Evidence: `backend/app/services/fileops.py:494-496` passes `file.drive` as the source, and `tagops.py:59` sweeps only that drive, not the drive of the rows the file actually held. `tagops.py:45-46` also returns early on a same-drive move, leaving the mismatch. A grep of `backend/app/database.py` finds no migration that touches tag rows by drive, and the diff adds none. `backend/app/routers/drives.py:813-821` lists tags with no files. The `known-issues.md` row deleted by this change describes the state these rows are still in.
Repro: not_reproduced (no command execution available). Set up an old-code state by inserting a `file_tags` link from a file on B to a `Tag` on A, then move the file to C through `PUT /api/files/{id}/move`. Expected from the code: C has the tag, and A still lists a row with count 0. All tests in `backend/tests/test_move_tags_follow_drive.py` seed tags on the file's own drive.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a one-time startup repair that retargets every file whose tag row names another drive, and make `retarget_file_tags` sweep the drives of the rows the file actually held.

</details>

### claude-read:non-ascii-capital-tag-breaks-move — bucket B, MEDIUM, open

Claim: retarget_file_tags compares Python's Unicode-aware str.lower() against SQLite's ASCII-only lower(), so a destination tag with a non-ASCII capital is never found and a second row is created for it.
Impact: Moving a file tagged `Übung` to a drive that already has `Übung` now fails with a 500, where the same move succeeded before this change. For a video, the failed move also leaves its thumbnail unreachable. If the source spelling is `übung` and the destination has `Übung`, the move succeeds but the destination silently gets a second tag row differing only in case. The same applies to any cased non-ASCII script the tag validator accepts (accented Latin, Cyrillic, Greek, full-width Latin).
Evidence: backend/app/services/tagops.py:49 sets key = tag.name.lower() ('übung'). backend/app/services/tagops.py:54 filters func.lower(Tag.name) == key. No lower() override is registered (no create_function in backend/app; backend/app/database.py:33-35 only sets PRAGMAs), and docs/developer-guide/known-issues.md:182 records SQLite's lower() as ASCII-only. The lookup misses, tagops.py:57 builds Tag(name='Übung', drive=dst), and the flush at tagops.py:59 (via cleanup_orphan_tags) violates uq_tags_drive_name (backend/app/models.py:47). fileops.py:508-517 then rolls back and returns 500. Only the file is moved back: the thumbnail renamed by fileops.py:491 stays at the new path while the rolled-back thumbnail_path names the old one. All tests in backend/tests/test_move_tags_follow_drive.py use ASCII tags.
Repro: not_reproduced (read-only review). Steps: tag a video `Übung` on drive A and another file `Übung` on drive B, then PUT /api/files/{id}/move to drive B. Expected from the code: 500 'Move failed (DB error, filesystem reversed)', file back on A, thumbnail JPEG under B's path. Batch move reports the same failure as a per-file error.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Compare in one place, not across Python and SQL: load the destination drive's tags once, build a dict keyed by Python lower() or casefold(), and look up there. Add a test with a non-ASCII capital present on both drives.

</details>

### claude-read:pending-delete-tag-reused-in-ghost-purge — bucket B, MEDIUM, open

Claim: When the destination path is held by a trashed ghost row that was the last user of a same-named tag, retarget_file_tags reuses a Tag row already scheduled for deletion, so the moved file can lose that tag.
Impact: The move reports success, but the file arrives without a tag it had, and the tag is gone from both drives. The source row is swept as well, so nothing is left to recover from. For non-Markdown files File.tags is canonical, so the tag is lost for good. This needs a trashed row whose file was removed from disk out of band, so it is rare, but the loss is silent.
Evidence: backend/app/services/fileops.py:479 calls resolve_db_path_conflict before the retarget. For a trashed row, fileops.py:192-194 deletes it and calls cleanup_orphan_tags(db, drive), and tagops.py:30-31 calls db.delete(orphan) with no flush afterwards. Production uses autoflush=False (backend/app/database.py:38), so the query at tagops.py:52-56 still returns that row. tagops.py:58 attaches it to file.tags, and the flush at tagops.py:59 deletes it. By my reading of SQLAlchemy's unit of work, the row stays in the session's deleted set because it is still in the identity map, so the association row is removed with the tag (file_tags.tag_id is ON DELETE CASCADE, backend/app/models.py:28). A trashed file that still exists on disk does not reach this path, because fileops.py:474 returns 409 first.
Repro: not_reproduced (read-only review; the SQLAlchemy outcome is inferred, and an IntegrityError or 500 instead of silent loss is possible). Steps: on drive B, trash a file x.mp4 tagged `alpha` (its only user) and delete x.mp4 from disk by hand. On drive A, tag x.mp4 `alpha` and move it to B. Then check the file's tags and both drives' tag lists.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Call db.flush() at the start of the retarget, before the destination lookup, or at the end of the trashed branch of resolve_db_path_conflict, so a pending delete is written before the lookup runs. Add a test that moves a file onto a ghost row holding the same sole tag.

</details>

### claude-read:rows-from-earlier-moves-are-not-repaired — bucket B, MEDIUM, open

Claim: The change removes the known-issues entry but does not repair files moved before the fix, which still link to the old drive's Tag rows, and moving such a file onward leaves the old row unattached.
Impact: On an existing database, a file moved earlier still counts in the old drive's tag list, and its tag does not appear in its current drive's list, with nothing recording that this remains. Moving it to a third drive strands the old drive's row: that drive's tag list keeps showing the tag with count 0. Rows linked from a file on another drive also continue to cross the drive boundary that design-decisions.md calls a security boundary.
Evidence: The move passes old_drive = file.drive as src_drive (backend/app/services/fileops.py:494-496), so tagops.py:59 sweeps only the file's current drive, not the drive the legacy row belongs to. backend/app/routers/drives.py:817-820 keeps rows with file_id NULL in the listing, so a stranded row is listed with count 0. The diff has no data repair, and backend/app/database.py has no migration touching tag drives. The R-5 'no file linked to another drive's tag row' result in docs/process/reviews/fix-move-tags-follow-drive/decisions.md is from a fresh scratch database.
Repro: not_reproduced (read-only review). Steps: create a file on drive B linked to drive A's Tag row, as the old code left it. List tags on A and B, then move the file to drive C and list tags on A again. Expected from the code: A still lists the tag, now with count 0.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a one-off idempotent startup repair that retargets every file_tags link whose Tag.drive differs from File.drive and then deletes the rows left unattached. Alternatively, keep a known-issues entry describing the remaining legacy rows.

</details>

## Not verified

- claude-deep: Nothing was executed: F1, F2 and F3 come from reading the code, and the SQLAlchemy flush order in F2 was not observed in a run.
- claude-deep: Whether SQLite in the backend image was built with ICU; the claim rests on no registration in `backend/app` and on the known-issues note.
- claude-deep: Whether the knowledge addon's scanner re-posts tags often enough to rewrite a destination row's spelling after a `.md` move.
- claude-deep: How addon code other than `tag_knn.py` and `auto_tags.py` reads core tag rows; the addon grep output was truncated at 20 lines. The diff changes no submodule pointer.
- claude-deep: The frontend's handling of tag lists after a move; I did not read that code.
- claude-read: No test or code was run (read-only tools); all three findings are from reading the code.
- claude-read: The exact SQLAlchemy flush outcome for a Tag in the pending-delete set that is attached to a collection is inferred, not observed.
- claude-read: SQLite's lower() being ASCII-only rests on the known-issues record and the absence of a create_function override; the SQLite build in the container was not inspected for ICU.
- claude-read: Addon-side stores that may cache tag names or drive, and the knowledge addon's handling of files.moved, were not fully read.
- claude-read: The frontend's refresh of the tag list after a move was not traced beyond the decisions.md record.
- claude-read: The tag validator in backend/app/schemas.py was not read directly; the accepted character set is taken from the regex in backend/app/services/frontmatter.py:20, whose comment says it mirrors that validator.

TOTAL: 6 findings
