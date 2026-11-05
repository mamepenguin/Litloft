# Open stored paths whose on-disk name is NFD

SPEC-ID: SPEC-CORE-042
SPEC-ID: SPEC-ADDON-062

Approval:

<!--
Leave the Approval line empty. After a human approves this spec, the approval step
writes `Approval: <hash> <name> <date>` here and moves the ledger rows in
docs/specs/INDEX.md to approved.
-->

## Summary

The scanner stores every drive-relative path in Unicode NFC, but a file copied straight
onto a Linux drive from iOS keeps its decomposed (NFD) name on disk. Linux compares names
byte for byte, so every place that builds `drive_path / file.file_path` and opens it gets
ENOENT: the player returns 404, thumbnails, previews, transcription and frame extraction
fail. Measured on production (2026-11-05): 112 files, all with a dakuten or handakuten in
the name, have 13,099 failed `transcription` job records ("Cannot stat audio file"), and
the same files do not play in the browser.

This spec adds one resolver that turns a stored NFC path into the path that exists on
disk, and routes every site that opens a stored path through it. The DB, the scanner's
NFC storage and the files on disk are left as they are. Core ships first
(SPEC-CORE-042: `backend/app`), then the addons (SPEC-ADDON-062: intelligence,
media_import, cloud-sync), each in its own repository and pull request.

## Required items

### 1. Normal flow

1. A caller holds a drive root and a stored relative path (`File.file_path`,
   `folder_path`, or the same path inside an addon's own table).
2. `resolve_on_disk(root, rel)` returns `root/rel` unchanged when that exact path exists.
3. Otherwise it walks the components from the root. For each component it uses the exact
   child when present, else the directory entry whose NFC form equals the NFC form of
   the component. Components after the first one that matches nothing are appended as
   given (so a path that does not exist stays the same non-existent path as today). A
   component that is empty, `..` or `.`, or an absolute `rel`, is treated as matching
   nothing: the resolver never lists a parent or leaves the root, and callers validate
   `rel` first as they do today. A matching entry that is a symlink is returned as is;
   rejecting symlinks stays the caller's check.
4. The caller then runs its existing containment, traversal and symlink checks on the
   resolved path, and opens, stats, reads, renames, moves, copies or deletes it exactly
   as it did before.
5. A write whose destination does not exist yet (create, upload, copy-to, move-to,
   rename-to, new text file) calls `resolve_parent(root, rel)`, which resolves the
   parent folder with the same walk and returns it with the leaf name untouched. The leaf
   is the name the user typed (NFC) and is created under the resolved parent, so no
   folder that differs from an existing one only by normalization is created.
6. A destination that already exists in either spelling counts as existing: the
   duplicate check (the DB and the disk, as today, with the disk side going through the
   resolver) and the overwrite/409 decision treat an NFD file exactly as they treat the
   same NFC name, and no second copy is written. Where today's behavior is to replace the
   existing file, the replacement is written to the file that exists, keeping its
   on-disk name, and the DB row keeps its NFC path. Restore applies the same rule to its
   parent folder and its leaf.
7. A site that renames, moves, deletes, purges or restores asks for a strict resolve. If
   more than one entry in a directory matches a component and none equals it byte for
   byte, the strict resolve raises `AmbiguousPath`, the operation is not performed, and
   core answers 409 `Ambiguous file name on disk`. Reads are not strict and use the
   first match by sorted UTF-8 bytes.

Read paths (stream, thumbnails, previews, workers) keep resolutions in a bounded
in-process cache keyed by `(root, rel)`; a hit is used only after the cached path is
confirmed to exist, otherwise it is recomputed. Sites that rename, move, copy, delete,
create or restore never use the cache.

### 2. Failure cases

- Directory cannot be listed (permission, I/O error): the component is treated as not
  found and the result is the unresolved NFC path, so the caller fails as it does today.
- Two entries in one directory normalize to the same NFC form and neither equals the
  stored component byte for byte: a read uses the first by sorted UTF-8 bytes; a
  mutating site refuses (step 7). Litloft does not create such pairs and the scanner
  folds both to one NFC row, so the pair itself is not repaired here (see Checked, no
  action).
- A cached entry whose file was renamed or deleted is dropped on the failed existence
  check (a `stat` of the resolved leaf) and recomputed. The cache is guarded by a lock
  because handlers run in a threadpool.
- The resolver never raises for a missing path or an unreadable directory; "not found"
  stays the caller's decision (404, 410, `missing_since`, or a failed job).

### 3. States

None. The resolver is a pure lookup over the filesystem; the file states (Active /
Missing / Trash in `design-decisions.md`) and their transitions are untouched. The
scanner's missing/recovered decisions (`files.missing`, `files.recovered`, the
`drive_path.exists()` early return) are not edited; the scanner already walks real names.

### 4. Data read and written

- Read: directory listings on the drive (only when the exact path does not exist).
- Written: nothing by the resolver. `File.file_path`, `folder_path`, tags, comments,
  watch history, transcripts and every other DB column keep their NFC values. No
  migration. Callers write to disk exactly where they did, but under the resolved parent.
- Intelligence: `indexed_files.file_path` holds an absolute path built by
  `config.resolve_file_path`. That value becomes the resolved on-disk path. Existing rows
  that hold the NFC path for an NFD file are detected by the reconcile pass that already
  compares the stored path with the expected one and repaired by `handle_files_moved`,
  which refreshes `drive`, `file_path`, `filename`, `title` and the FTS row, keeps the
  `*_indexed` flags and the embeddings, and queues no job. `reconcile` resolves in a
  worker thread (`asyncio.to_thread`), and it counts a path difference as drift only when
  the resolved path exists on disk, so a mount that is briefly unreadable never flips a
  row between spellings. `config.resolve_file_path` stays a pure join; the on-disk
  resolution is a separate function that the indexer calls where it stores a path.
- Cache: in process memory only, at most 4096 entries (LRU).

### 5. External services

None called by the change. Deepgram and the other transcription providers are reached
only after the audio file opens, so the change makes them reachable for these files.
`job_records` is an audit log, not retry state; `_resume_incomplete` re-queues active
files whose `*_indexed` flags are unset, which is why each of the 112 files failed about
117 times. After the fix those files open, so they are transcribed. Cloud providers are
gated by the per-drive `transcription_cloud` policy (fail closed, falling back to
`whisper_local`); the failed records name `deepgram`, so the policy of their drives
allows it, and these files will be sent to Deepgram automatically once the fix is
deployed. The change adds no retry and does not alter the circuit breaker.

### 6. Authorization

Unchanged. The checks that decide whether a viewer may reach a file (drive access in
`files.py`, `_validate_path` containment, the Internal API secret) run as before. The
resolver runs first and the containment check (`realpath` under the drive root,
`_validate_path` in `files.py`) then runs on the resolved path, so an NFD ancestor is
checked by what it really is. Sites that go through `resolve_safe_path` keep its
rejections for names and traversal, then resolve its result and re-run containment and
the symlink check on the resolved path by calling `safepath._contains_symlink` (imported
as it is; `safepath.py` is not edited). Addon call sites run the containment check they
run today (`validate_file_path` in intelligence, `_resolve_drive_file_path` in
media_import, `_folder_inside_drive` in cloud-sync) on the resolved path. The resolver
adds no authorization decision of its own. Under the project's threat model (one user, no
adversary) symlink and traversal handling is kept equal to today's, not hardened.

### 7. Effect on existing features

Every site that opens a stored path: streaming and download, text and Markdown preview,
archive listing and entry read, subtitle detection and serving, Markdown content PUT,
Markdown relations and image import, Markdown thumbnails, rename, move, copy, folder
create/rename/move/delete, trash purge and restore, empty-folder cleanup, upload target
folder, text-file create, the Internal API content read, the intelligence workers
(transcription providers, frame extraction, CLIP, vision, metadata and document
extractors, refine), media_import loft and caption handling, and cloud-sync source
folders. Drives whose names are already NFC take the exact-path branch and behave
identically.

### 8. Error behavior

Unchanged on a path that exists in neither form: 404 or 410 from core, `missing_since`
from the scanner, a failed job in intelligence. The resolver logs nothing on the normal
path. A listing failure is logged at warning level with the directory and the error, once per
`(directory, error)` (a set of at most 1024 keys), and the caller then reports the file
as not found. The scanner is unaffected: it walks real names and never calls the
resolver to decide missing.

### 9. User-visible behavior

Files with a decomposed name play, show thumbnails and previews, can be downloaded,
renamed, moved and trashed like any other, and are transcribed and indexed. A file
renamed in Litloft gets the NFC name the user typed. Nothing new is shown in the UI, and `docs/user-guide/` gets no entry (a viewer does
nothing differently).
`docs/admin-guide/` gains a sentence saying that files copied to a drive from outside
keep their on-disk names and that Litloft finds them regardless of Unicode form (shipped
with the core PR, and worded for playback, previews and file operations; the addon PR
adds the transcription and indexing part to `docs/addons/intelligence.md`).
`docs/ADDON-DEVELOPMENT.md` notes that the Internal API content read resolves the stored
path.

### 10. Non-functional

- A drive whose paths already exist byte for byte costs one extra existence check per
  resolve. A miss costs one `scandir` per unresolved component; the cache removes the
  repeat for HTTP Range requests on the same file.
- The cache holds at most 4096 entries (LRU) and never serves a path that fails the
  existence check. Core handlers that resolve are synchronous (`def`, run in the
  threadpool) or call it through `asyncio.to_thread`; no `scandir` runs on the event loop.
- Read-only mounts (intelligence mounts the drives `:ro`) work, because nothing is
  renamed or created to resolve.

## Touch points

Protected paths marked (HIGH). The inventory test below is the source of truth for which
sites exist; this list names the known ones and a site the test reports is in scope even
if absent here (the approver accepts that scope rule with this spec). Untouched:
`safepath.py`, `auth.py`, `routers/auth.py`, `addon_proxy.py`, `config.py`'s drive-root
reader, `playlists.py`, `progress.py`, `comments.py`, which do not open stored paths.

New: `backend/app/services/diskpath.py` (resolver and cache).

Core, `backend/app`:

- `routers/files.py` (sits on the access-control path through `_validate_path`; the
  checks themselves are not edited): `stream_file` (including the HEIC conversion input), the
  download/render/preview-text/archive/archive-entry/subtitle/content-PUT/markdown
  resolution handlers, `_detect_file_subtitles`, `_write_md_tags`.
- `routers/internal.py` (HIGH): `_resolve_text_content_path` and the content read.
- `routers/drives.py`: `create_text_file` and the by-path, create and file-listing
  handlers that build a drive root and read `File.file_path` (the `resolve_safe_path`
  callers).
- `services/fileops.py` (HIGH): `_ensure_empty_folder_tracked`, `copy_file`,
  `rename_file`, `move_file`, `move_folder`, `rename_folder`, `create_folder`,
  `delete_folder`, `physical_delete`, `restore_file`, `_validate_no_duplicates`,
  `batch_rename` and its rollback, `_carry_sidecars`, `_carry_batch_sidecars`.
- `services/scanner.py` (HIGH): the Markdown thumbnail refresh read only. The walk, the
  NFC storage and the missing/recovered transitions are not changed.
- `services/subtitle.py`, `services/markdown_images.py`, `services/markdown_relations.py`,
  `services/markdown_image_import.py`, `services/upload.py`, `services/heic.py`
  (cache-key input), `services/chapters.py` callers, `services/thumbnail.py`, `services/preview.py` and `services/hash.py`
  (their `exists`/open calls on a path they are handed are routed at their callers),
  `main.py` (`_cleanup_empty_folders_after_purge` and the trash purge job; a deletion,
  so treated as HIGH).
- `docs/admin-guide/` (one sentence), `docs/developer-guide/known-issues.md` (only if
  something stays open).
- Mutating-site tests for ambiguity (409) and the strict resolve.
- An inventory test that enumerates, by AST, every join of a drive path with a stored
  path in `backend/app`: the `/` operator, `os.path.join`, `joinpath`, `Path(...)` and
  f-strings whose parts include `file_path` or `folder_path`, following a variable one
  assignment deep. It fails on a site that is neither routed through the resolver nor
  listed as listing-derived with a reason. A seeded unrouted site must make it fail.
- A parity table (a JSON fixture of inputs and expected results) copied into each tree
  that holds a resolver; each repository's own CI runs it against its own copy, and the
  copies are compared in review, like the duplicated parsers.

Addons (separate repositories, pointer bump in core):

- `addons/intelligence/app/config.py` `resolve_file_path` and `docs/addons/intelligence.md`, the three callers in
  `indexer.py` and the reconcile drift check, `_loft_needs_reset`, the thumbnail-leg
  existence check, `routers/files.py` frame endpoint, `routers/document_text.py`,
  `frame_cache.py`, the transcription providers and `splitter.py`, `workers/whisper.py`,
  `clip.py`, `video_visual.py`, `vision.py`, `metadata.py`, extractors, `refine.py`,
  `aligner.py`; a copy of the resolver with the same contract (addons cannot import
  core code; the copies are kept in sync by review, like `sidecar_match.py`).
- `addons/media_import/backend/service.py` (`_resolve_drive_file_path`, the caption and
  STT-temp handling, loft creation), `router.py` folder check,
  `subscription/manager.py`.
- `addons/cloud-sync/backend/service.py` (`_source_usable`, `_folder_inside_drive`).
- Inventory tests of the same shape in each addon tree.

## Invariants

SPEC-CORE-042 covers I1 to I13; SPEC-ADDON-062 covers I14 to I16. A core test cites only
SPEC-CORE-042.

I1. A file whose stored path is NFC and whose on-disk name is NFD (in the file name, in
any ancestor folder, or both) streams with the same status, headers and bytes as the
same file stored under an NFC name, including `Range` requests.
I2. For such a file, each of download, text preview, Markdown preview, archive listing,
archive entry read, subtitle detection, subtitle serving, content read, content PUT and
the Internal API content read succeeds where it returned 404 before.
I3. Resolving a path that exists byte for byte returns that path, even when an NFD
spelling of the same name also exists in the directory.
I4. Resolving a path that matches nothing returns the stored NFC path unchanged; a path
whose ancestors match and whose leaf does not returns the real ancestors with the stored
leaf; an unreadable directory counts as matching nothing. None of these raises.
I5. Creating, copying, moving or uploading a file or folder under a folder whose on-disk
name is NFD, and restoring a file whose former parent is NFD, places it inside that
folder, and no folder that differs from it only by normalization is created.
I6. Renaming, moving, copying, trashing-then-purging or restoring a file whose on-disk
name is NFD acts on that file: afterwards the old on-disk entry is gone (rename, move,
purge) or still present (copy), and no second copy appears.
I7. A destination that exists on disk only in the other spelling gets the answer (409,
suffix or in-place replacement) that the same name in the same spelling gets today.
I8. A file renamed through Litloft has exactly the NFC name that was typed, and its
sidecars (subtitles and captions beside an NFD video) follow it to the new name in a
single rename or move, and a failed batch rename puts every file back under its
original on-disk name.
I9. After a read operation, or a create or upload, a scan reports no added, missing or
moved file for the NFD files involved, `File.file_path` and `folder_path` stay NFC, and
the resolver changes no file's Active, Missing or Trash state.
I10. The resolved path stays inside the drive root, and the containment and symlink
rejections that exist today reject the same inputs, including a symlink below an
NFD-named ancestor.
I11. After a file is renamed, deleted or replaced, a read of its old path reports not
found and a read of its new path finds it, whether or not the old path was read before.
I12. Resolving never writes, renames or creates anything on disk, so it works on a
read-only mount; and when more than one entry matches a component and none equals it
byte for byte, rename, move, delete, purge and restore refuse with 409 and change
nothing.
I13. A site in `backend/app` that joins a drive path with a stored path, in any form the
inventory test enumerates, and is neither routed through the resolver nor marked
listing-derived, makes that test fail.
I14. Intelligence completes transcription, frame extraction, CLIP and text extraction
for a file whose on-disk name is NFD, and `indexed_files.file_path` for it is the
resolved on-disk path; an existing row holding the NFC path is corrected by reconcile
without clearing its `*_indexed` flags or embeddings and without queueing a job, and a
drive that becomes unreadable for one pass does not change the stored path.
I15. media_import loft and caption files and a cloud-sync source folder whose on-disk
name is NFD are found and used.
I16. Every resolver copy returns, for each input of the parity table, that table's
expected result.

## Revises

None. The sidecar contract in `sidecar_match.py` (NFC-literal stem match over a
directory listing) is unchanged; it still needs the directory to exist, which the
resolver now guarantees.

## Checked, no action

- Renaming NFD files to NFC on disk (scanner or a one-off tool): rejected by the user in
  favor of absorbing the difference where files are opened. Direct writes to the drive
  are normal use and would bring NFD back after any rename.
- A DB migration or storing the on-disk spelling: the DB is keyed and indexed by NFC
  (`UniqueConstraint("drive", "file_path")`, tags, comments, watch history); changing it
  risks the data that cannot be regenerated.
- Editing `safepath.py` (HIGH, access control): the resolver runs after it. Its NFC
  forcing for newly created names is kept, since a name the user types is NFC.
- Re-queueing the failed `transcription` records by hand: not needed, because the
  indexer resumes files whose flags are unset (Item 5); confirmed again during
  implementation.
- HEIC conversion cache entries are keyed by a hash of the path string; the key for an
  NFD file changes once and the JPEG is regenerated. Not worth a migration.
- The scanner's walk and `register_single_file`: they take names from directory
  listings and already store NFC.
- Names that are legal on APFS but not Linux (length over 255 bytes) and folding of case
  on Docker Desktop mounts: separate defects recorded in hako.
- Both spellings of one name present in a directory: Litloft does not create the pair
  and the scanner already folds both to one NFC row (a pre-existing collision); the
  resolver's choice is only deterministic (I3 and the sorted rule), not a repair.
- The retry loop that wrote about 117 failed `transcription` records per file for a
  `FatalError`: a separate defect, recorded in hako, not changed here. Fixing the path
  makes the loop succeed for these files.
- The cache is not invalidated by mutations because mutating sites do not use it (I11);
  a read that still finds the old spelling serves a file that still exists.
- Knowledge addon and `mcp-server`: they reach files only through HTTP and the Internal
  API, which this change covers.
