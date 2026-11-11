# A thumbnail slot belongs to one file

SPEC-ID: SPEC-CORE-022
SPEC-ID: SPEC-CORE-023
SPEC-ID: SPEC-CORE-024
SPEC-ID: SPEC-ADDON-040

Approval: sha256:9fcfcc2fd70ea2565226ed64e3d02217fe9fbc1550e8860ffa3a7e0b91195879 Yuichi Senga 2026-10-31

## Summary

Thumbnails are stored at a path derived from the file's folder and stem, so two files can
claim one slot and every rename or move has to carry the picture along. This change stores
each thumbnail at a path derived from the file's id, `.by-id/<file id>.jpg` under
`data/thumbnails/`. `book.pdf` and `book.epub` stop taking each other's picture, a rename or
move no longer touches the cache and so cannot fail because of it, every file type keeps its
picture across a move, and a Missing record cannot share a slot with the file that took its
path. Existing thumbnails move to the new slots once, at startup, before the app serves
anything. It is for the one person running the library: these are all cases where a card
silently shows the wrong picture or a rename fails for a cache's sake.

- SPEC-CORE-022: each file owns its thumbnail slot, keyed by its id.
- SPEC-CORE-023: rename, move and folder operations leave the thumbnail cache alone, including a move a scan detects.
- SPEC-CORE-024: a startup step moves existing rows to the new slots.
- SPEC-ADDON-040: Media Import stores a `.loft` thumbnail in the same slot.

## Required items

### 1. Normal flow

`thumbnail_slot_rel(file_id)` in `backend/app/services/thumbnail.py` returns
`.by-id/<file id>.jpg`. It is the only place that form is written.

New file:

- Scan and `register_single_file`: the id is generated before the row is built, the generator
  writes the slot, and the row stores the value.
- Upload: the row is looked up first. The slot uses the reused row's id, or a newly generated
  id, and the generator then writes it atomically.
- Copy: the file and the row commit first. The source slot's bytes are then copied to the
  copy's slot, and `thumbnail_path` is set in a separate commit, so a picture failure cannot
  undo the copy. A source with no slot file leaves the copy with no pointer, and the next scan
  generates one where a generator exists. Markdown projections stay as they are.
- Media Import: a downloaded `.loft` picture goes to the slot.

Rename, batch rename, move, folder rename and folder move: only the file and the row's path
columns change. A move a scan detects does the same: it leaves `thumbnail_path` as it is for
every type, including `.loft`.

Purge: the file the row's pointer names, in whichever form, is removed with the row, in the
order and with the failure behaviour `physical_delete` has today.

A trashed ghost deleted by `resolve_db_path_conflict` or by an upload: the file its pointer
names is removed after the caller's commit, so a rollback leaves the trashed row its picture.
`resolve_db_path_conflict` returns that path for the caller to remove. A removal failure logs a
warning and changes nothing else.

In this spec a row's picture means the file its pointer names. Copy reads the source's picture
through the pointer, in either form. An upload or Media Import save over a reused row removes
the old picture when the pointer changes to another path.

Scan, for a row with a generator whose file is on disk:

- Empty pointer, or a `.by-id` pointer whose file is absent: the generator writes the slot and
  the row points at it. A failure leaves the pointer empty.
- Path-form pointer (its startup migration failed): the row's thumbnail branch is skipped,
  including the transparent and letterbox rewrites, until a startup migrates it.
- A `.loft` row is never in this branch. A pointer naming an absent file stays as it is, with
  no log line, and the placeholder is served.

Startup migration (SPEC-CORE-024), in the lifespan before the scan and before any request.
It selects every row in any state and on any drive whose `thumbnail_path` is not empty, does
not start with `.by-id/`, and has no `.markdown` as its second path component, whichever drive
that component follows. Rows are grouped by the file they reach: `(st_dev, st_ino)` when the file
exists, because the cache's mount can fold case and Unicode normalisation so that two different
strings name one file, and the string when it does not.

- Named by one row, file exists: `os.replace` to the row's slot and set the pointer. Same bytes,
  same mtime. Pointers commit every 200 rows.
- Named by one row, file absent: if the row's slot exists, set the pointer to it; otherwise
  empty the pointer.
- Named by several rows: every one has its pointer emptied, that is committed, and then the old
  file is removed. The file could be any of theirs, so none keeps it. The next scan generates a
  picture for each row whose file is on disk and that has a generator, a Missing row at its
  recovery, and a `.loft` through Refresh metadata.

Empty directories left under `<drive>/` are pruned as each file leaves. The run logs one line
before it starts with the row count, and one line per 1,000 rows.

The sharing check covers all drives, because a cross-drive move used to leave a non-video's
pointer on the old drive's path. This is deliberately not drive-scoped: the column names a
place in one cache that all drives share. After the first run the selection is empty apart
from rows whose rename failed and paths an older Media Import wrote.

### 2. Failure cases

- Generation fails for a new file: the row has no thumbnail, as today.
- Upload over a reused row, generation fails or the new file has no generator: the pointer is
  emptied and the old picture removed, because it pictures the previous file.
- Upload with a new id, the commit fails: the slot just written is removed.
- A scan raises before its commit: slots written for new files in that attempt stay stranded,
  and a retry writes new ones under new ids. Accepted: it costs only disk, and a scan that raises
  is not ordinary use.
- `os.replace` fails in migration (`OSError`): the row keeps its pointer, one warning names it,
  the run continues, and the next startup tries again.
- A commit raises, or anything else unexpected happens: the run stops, it is logged, and startup
  continues. The next startup repoints the renamed rows, because their old file is absent and
  their slot exists.
- The process stops between a rename and its commit: the same.
- Removing a shared file fails after its pointers are emptied: one warning, counted as failed. No
  row names it any more, so it stays as a stranded cache file.
- The cache is unavailable during a rename or move: nothing happens, because the operation no
  longer reads or writes it. A Markdown projection already absorbs `OSError`.
- Copying the picture fails during a copy: the copy keeps no pointer, one warning is logged,
  and no partial file stays in the slot.
- Removing the picture on purge fails: unchanged, the `OSError` propagates and the row stays.
- `register_single_file` raises after writing a slot: it removes that slot itself. If the
  caller's commit fails afterwards, the Markdown image import caller, which then holds the id,
  removes the slot.

### 3. States

A row's `thumbnail_path` is one of: empty; `.by-id/<own id>.jpg`; the path form
`<drive>/<folder>/<stem>.jpg`, left over; or `<drive>/.markdown/<note id>-<source id>.jpg`.

| From | To | When | Old file |
|---|---|---|---|
| empty | `.by-id` | Generation, or a picture saved | none |
| path form | `.by-id` | Migration, sole owner | moved |
| path form | empty | Migration, shared or absent | removed once |
| `.by-id` | empty | Upload over a reused row with no picture for the new file | removed |
| `.by-id` | empty | Never by a scan: a failed generation over an absent slot file leaves it empty | none |
| path form or `.markdown` | `.by-id` | Upload or Media Import save over a reused row | removed |
| path form or `.markdown` | empty | Upload over a reused row with no picture for the new file | removed |
| any | `.markdown` | Markdown projection, as today | removed, as today |
| `.markdown` | empty | Projection cleared, as today | removed, as today |
| `.by-id` | another row's `.by-id` | Never | |
| any | path form | Never, except a Media Import older than this change, until the next startup | |

After a migration that completed without a failure, no two rows name one file, so removing a
row's slot needs no check of who else names it. A row whose rename failed names its own file
alone, because shared paths are emptied rather than renamed.

### 4. Data read and written

- `files.thumbnail_path`: read and written. No schema change.
- `data/thumbnails/.by-id/`: written and removed.
- `data/thumbnails/<drive>/...`: renamed out of and removed from, during migration only.
- `indexed_files.thumbnail_path` in the Intelligence DB: no code change. Its reconcile copies
  the value from core.
- Drives: a generator reads its source. Nothing writes to a drive.

### 5. External services

Media Import's existing thumbnail download only. Its failure handling is unchanged.

### 6. Authorization

Unchanged. `GET /api/files/{id}/thumbnail` looks the file up by id and checks drive access.
The slot's path has no drive in it, and nothing reaches it except that lookup.

### 7. Effect on existing features

- `markdown_images` reads `source.thumbnail_path` and copies from it. A projection re-copies
  only when the source's mtime is newer, and migration keeps the mtime, so there is no re-copy.
- Intelligence's CLIP worker resolves `thumbnail_path` under `/data/thumbnails`. Until its next
  reconcile the projected value can name a moved file, so an embedding waiting in that window
  fails and is retried, as after a move today. The startup scan's `scan.complete` starts that
  reconcile. Existing embeddings are not recomputed, so a picture regenerated from a shared
  slot leaves its old CLIP embedding until the file is reindexed.
- `_is_flattened_transparent_picture` keeps its check of other rows, which becomes redundant
  and stays out of this change. SPEC-CORE-006 I11 stands.
- `copy_file` loses its `samefile` guard. `_rename_thumbnail_owner` loses its retired-record
  part.
- `resolve_db_path_conflict` still retires a Missing row's path but returns nothing, because a
  retired row keeps its own slot.
- Scan counters: migration runs outside the scan and counts nothing. A regeneration in a later
  scan counts as `updated`, as today.

### 8. Error behavior

A user sees no new error. A rename, move or batch rename that used to answer 500 because of
the cache now answers 200. A card with no thumbnail shows the placeholder, as today. Each
failed migration row logs one warning per startup naming the row and the path. The run logs
one info line with the counts moved, emptied and failed.

### 9. User-visible behavior

- `book.pdf` and `book.epub` in one folder each show their own cover after the first scan
  following the upgrade. Until that scan finishes, each shows the placeholder.
- A file keeps its picture across a move or rename straight away, with no rescan, for images,
  PDFs, EPUBs and `.loft` files as well as videos.
- A picture owned by one row is byte-identical after the upgrade, so it does not flicker.
- A `.loft` beside a same-stem file shows the placeholder after the upgrade, until Refresh
  metadata downloads its picture again.
- No text, ordering or default changes.

### 10. Non-functional

- Migration: one `stat`, one `os.replace` per row with a thumbnail and one commit per 200 rows,
  once, at the first startup. Later startups run one query over `files`.
- Requests wait for migration, so no reader sees a pointer naming a moved file. The healthcheck
  gives the backend about 100 seconds before it reports unhealthy. If a large library takes
  longer, `docker compose up` reports a dependency failure while the migration carries on; a
  second `up` succeeds once it has finished. The implementation measures the per-row cost on a
  Docker Desktop bind mount and records it in the PR.
- All slots sit in one directory, which the app never lists.

## Touch points

- `backend/app/services/thumbnail.py`: `thumbnail_slot_rel`, the migration step.
- `backend/app/main.py`: calls the migration in the lifespan before the scan.
- `backend/app/services/fileops.py` (HIGH zone): `_move_thumbnail` and `path_thumbnail_rel`
  removed; `resolve_db_path_conflict`, `_rename_thumbnail_owner`, `copy_file`, `rename_file`,
  `move_file`, `_update_folder_paths` (folder rename and `move_folder`),
  `_update_file_after_rename`.
- `backend/app/services/scanner.py` (HIGH zone): `_expected_thumbnail_path`,
  `_relocate_thumbnail`, `register_single_file`, the scan loop's thumbnail branch, move
  detection, new-file registration.
- `backend/app/services/upload.py`: `complete_upload`.
- `backend/app/services/markdown_image_import.py`: failure cleanup.
- `files.thumbnail_path` values, including what `GET /api/internal/files/{id}` returns. The
  field stays an opaque relative path.
- `addons/media_import/backend/service.py` `_save_loft_thumbnail`, and its tests
  `test_loft_thumbnail.py` and `test_subscription_manager.py`, which pin the old paths. The
  latter's duplicate-title test keeps asserting that two imports get different pointers.
- Delivery: (1) the core PR merges to `develop` with the old addon pin, because the addon's CI
  checks out core `develop` and imports `thumbnail_slot_rel`. In between, an old addon's
  path-form write migrates at the next startup. (2) The addon PR merges. (3) A core PR bumps the
  pointer. SPEC-ADDON-040 becomes `implemented` with the bump.
- `backend/tests/`:
  - Deleted, because the state they guard can no longer exist: `test_copy.py`
    `test_copying_a_moved_file_back_where_its_thumbnail_stayed`,
    `test_a_database_failure_leaves_the_slot_as_it_found_it`,
    `test_two_names_for_one_thumbnail_do_not_fail_the_copy`,
    `test_a_copy_that_writes_no_thumbnail_leaves_the_ghost_its_own`,
    `test_a_copy_leaves_a_retired_record_pointing_elsewhere_alone`; `test_fileops.py`
    `test_a_move_that_writes_no_thumbnail_leaves_the_ghost_its_own`.
  - Rewritten to the new behaviour: `test_scanner_move_detection.py`
    `test_thumbnail_relocated_on_move`, which then asserts the pointer is unchanged.
  - Any other test that pins or seeds a path-form value changes that value only, so that a test
    of the scan's thumbnail branch still enters it. Any further deletion stops and goes to the
    human.
- `docs/specs/INDEX.md`: four rows.
- `docs/developer-guide/known-issues.md`: four rows removed.
- `docs/admin-guide/monitoring.md`, "Thumbnails not showing": the one-time migration at the first
  startup, placeholders until the first scan finishes and a `.loft` needing Refresh metadata, and
  the repair for a picture already wrong. The user guide needs nothing, because all of it is once
  per upgrade.
- `.claude/rules/backend-conventions.md` needs no edit; `.jpg` naming stands.
- No protected path is edited.

## Invariants

I1. After the upgrade's first scan, two files in one folder with the same stem and a generator have different `thumbnail_path` values, and `GET /api/files/{id}/thumbnail` serves each file's own picture, whichever order they are visited in.
I2. A file registered by a scan, by `register_single_file` or by upload, whose generation succeeds, has `thumbnail_path` equal to `.by-id/<its id>.jpg`, and that file exists.
I3. A rename, batch rename, same-drive move, cross-drive move, folder rename, folder move or scan-detected move of a non-Markdown file leaves its `thumbnail_path` and the bytes served by its thumbnail endpoint unchanged, whatever its file type, including `.loft`.
I4. With `data/thumbnails/` unwritable, a rename, batch rename, move, folder rename or folder move of a non-Markdown file still answers 200, and the file and its row hold the new path.
I5. Purging a file removes the file its pointer names and no other file's picture.
I6. Moving a video onto the path of a Missing record leaves both rows with different `thumbnail_path` values or an empty one on the retired row, and purging the Missing record leaves the moved video's picture served.
I7. Migration moves a path-form file named by only one row, in any state and whichever drive that row is on, to `.by-id/<id>.jpg` with the same bytes and the same mtime, runs no generator, and answers the thumbnail endpoint with the same ETag.
I8. Migration empties the pointer of every row reaching a path-form file that more than one row reaches, counting rows on all drives and treating two strings that reach one file on disk as one, and removes that file.
I9. A row whose `os.replace` fails keeps its `thumbnail_path`, the run continues with the other rows, startup completes, and the next startup moves it.
I10. A row whose path-form file is absent and whose slot exists is repointed at the slot by migration, with no generator run; with neither, its pointer is emptied.
I11. A Markdown projection under any drive's `.markdown/` directory is not selected by migration, and a projection whose source has migrated still serves the source's picture with no re-copy.
I12. Copying a file gives the copy its own slot holding the source's bytes, purging the copy leaves the source's picture served, and a source with no picture file, or a failure copying it, leaves the copy's row and file in place with no pointer and no partial slot file.
I13. Uploading over a trashed ghost, or a rename, move or copy that deletes one in `resolve_db_path_conflict`, removes the file the ghost's pointer names once the caller has committed; if the operation fails before its commit, the ghost and its picture remain.
I14. Uploading over a Missing row, or an Active row whose file vanished, keeps that row's id and leaves it on `.by-id/<its id>.jpg` showing the new file; if generation fails or the new file has no generator, the pointer is empty and the old picture is gone.
I15. A `.loft` picture saved by Media Import lands at `.by-id/<file id>.jpg`, and migration moves a `.loft` row named alone on a path-form file with its picture intact.
I16. A scan leaves a path-form row's pointer and old file unchanged and runs no generator or rewrite for it; for an empty pointer or a `.by-id` pointer with an absent file it generates the slot; for a `.loft` row it changes nothing.
I17. A failed `register_single_file`, or a failed commit after it in Markdown image import, leaves no row and no slot file for the asset.
I18. `GET /api/internal/files/{id}` answers the same fields, with `thumbnail_path` holding the stored value.
I19. Through the real lifespan, migration finishes before the startup scan starts and before the app answers a request.
I20. A migration that raises does not stop startup, and a row renamed before its commit is repointed by the next startup with its bytes intact.
I21. A second migration run over a migrated library moves and empties nothing.

## Revises

SPEC-CORE-006 I9. Thumbnail cache slots keep a `.jpg` name; their path form is the one SPEC-CORE-022 states.

## Checked, no action

- Adding the extension to the path key (`book.pdf.jpg`). It solves same-stem collisions only; a
  rename would still have to move the picture and could still roll back, so 245, 251 and 258
  remain.
- Migrating during scans. A row cannot tell whether it is the last of a shared slot or a sole
  owner once siblings have moved on, and a scan commits once at the end, so readers would see
  gone paths for the length of the first scan. A step before serving has neither problem.
- A new table mapping files to thumbnails. The id is already unique per file.
- Fanning `.by-id` out into subdirectories. Nothing lists the directory.
- A drive literally named `.by-id`: not ordinary use.
- Ids differing only in case on a case-insensitive cache volume. The Markdown projection's key
  has the same exposure, and 12-character ids make a collision implausible.
- A picture already wrong while named by one row, because a sibling overwrote it earlier and
  the sibling's pointer has since gone. It looks like any other and stays until its slot file is
  deleted by hand from `data/thumbnails/.by-id/`, after which the next scan regenerates it.
- Recomputing CLIP embeddings for regenerated pictures: stays with an ordinary reindex.
- A thumbnail stranded by a crash at a path no row names: a cache entry that costs only disk.
- A retired `__missing_` row on a shared slot never recovers, so it keeps the placeholder. A
  `.loft` on a shared slot whose remote picture has gone keeps it too. The file could have been
  another row's picture in either case.
- A scan-detected move to a type with no generator keeps its old picture; such a hash match is
  not ordinary use.
- Running migration after the app starts serving, to stay inside the healthcheck window. It would
  race purges and show placeholders while it runs, for a problem only a very large library has.
- A row removed from the database by hand: not ordinary use.
