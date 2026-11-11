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

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: An upload extracts EXIF immediately, and a re-upload over a reused row deletes the old row, even when the new file has no EXIF (upload.py:352-360).; A copy duplicates the source's EXIF row, GPS included, and also across drives, without reading the copied file (fileops.py:298-313). extracted_at is set fresh and is not exposed by ExifResponse.; TIFF files with EXIF tags now get file_exif rows (exif.py:69-72).; Formats with no _getexif, such as BMP and GIF, now return None without the warning they used to log, which is a log-only change.
- claude-deep: Upload now extracts EXIF at once and replaces any earlier row for a reused file id; the tests mark this UNSPEC and no spec covers it.
- claude-deep: Copy now duplicates the source's file_exif row, including GPS, and sets a new extracted_at on the copy.
- claude-deep: Formats whose plugin had no _getexif, such as TIFF, now go through extract_exif successfully and can gain rows. Only JPEG, HEIF and WebP are tested with EXIF.
- claude-deep: A photo with no EXIF that replaces one with EXIF on a reused row now loses the old row, so Photo Info disappears.
- claude-read: An upload extracts EXIF immediately, and a re-upload over a reused row deletes the old row, even when the new file has no EXIF (upload.py:352-360).
- claude-read: A copy duplicates the source's EXIF row, GPS included, and also across drives, without reading the copied file (fileops.py:298-313). extracted_at is set fresh and is not exposed by ExifResponse.
- claude-read: TIFF files with EXIF tags now get file_exif rows (exif.py:69-72).
- claude-read: Formats with no _getexif, such as BMP and GIF, now return None without the warning they used to log, which is a log-only change.
- claude-verify: TIFF files now yield file_exif rows (CR-2).
- claude-verify: Image formats with no _getexif and no EXIF, such as GIF and BMP, previously hit AttributeError and logged an 'EXIF extraction failed' warning; by reading Image.getexif they now return None with no warning. Not executed.

### unspecified_behavior

Note: TIFF files now yield file_exif rows (CR-2).; Image formats with no _getexif and no EXIF, such as GIF and BMP, previously hit AttributeError and logged an 'EXIF extraction failed' warning; by reading Image.getexif they now return None with no warning. Not executed.
- claude-deep: Upload now extracts EXIF at once and replaces any earlier row for a reused file id; the tests mark this UNSPEC and no spec covers it.
- claude-deep: Copy now duplicates the source's file_exif row, including GPS, and sets a new extracted_at on the copy.
- claude-deep: Formats whose plugin had no _getexif, such as TIFF, now go through extract_exif successfully and can gain rows. Only JPEG, HEIF and WebP are tested with EXIF.
- claude-deep: A photo with no EXIF that replaces one with EXIF on a reused row now loses the old row, so Photo Info disappears.
- claude-read: An upload extracts EXIF immediately, and a re-upload over a reused row deletes the old row, even when the new file has no EXIF (upload.py:352-360).
- claude-read: A copy duplicates the source's EXIF row, GPS included, and also across drives, without reading the copied file (fileops.py:298-313). extracted_at is set fresh and is not exposed by ExifResponse.
- claude-read: TIFF files with EXIF tags now get file_exif rows (exif.py:69-72).
- claude-read: Formats with no _getexif, such as BMP and GIF, now return None without the warning they used to log, which is a log-only change.
- claude-verify: TIFF files now yield file_exif rows (CR-2).
- claude-verify: Image formats with no _getexif and no EXIF, such as GIF and BMP, previously hit AttributeError and logged an 'EXIF extraction failed' warning; by reading Image.getexif they now return None with no warning. Not executed.

### unspecified_behavior

Note: Upload now extracts EXIF at once and replaces any earlier row for a reused file id; the tests mark this UNSPEC and no spec covers it.; Copy now duplicates the source's file_exif row, including GPS, and sets a new extracted_at on the copy.; Formats whose plugin had no _getexif, such as TIFF, now go through extract_exif successfully and can gain rows. Only JPEG, HEIF and WebP are tested with EXIF.; A photo with no EXIF that replaces one with EXIF on a reused row now loses the old row, so Photo Info disappears.
- claude-deep: Upload now extracts EXIF at once and replaces any earlier row for a reused file id; the tests mark this UNSPEC and no spec covers it.
- claude-deep: Copy now duplicates the source's file_exif row, including GPS, and sets a new extracted_at on the copy.
- claude-deep: Formats whose plugin had no _getexif, such as TIFF, now go through extract_exif successfully and can gain rows. Only JPEG, HEIF and WebP are tested with EXIF.
- claude-deep: A photo with no EXIF that replaces one with EXIF on a reused row now loses the old row, so Photo Info disappears.
- claude-read: An upload extracts EXIF immediately, and a re-upload over a reused row deletes the old row, even when the new file has no EXIF (upload.py:352-360).
- claude-read: A copy duplicates the source's EXIF row, GPS included, and also across drives, without reading the copied file (fileops.py:298-313). extracted_at is set fresh and is not exposed by ExifResponse.
- claude-read: TIFF files with EXIF tags now get file_exif rows (exif.py:69-72).
- claude-read: Formats with no _getexif, such as BMP and GIF, now return None without the warning they used to log, which is a log-only change.
- claude-verify: TIFF files now yield file_exif rows (CR-2).
- claude-verify: Image formats with no _getexif and no EXIF, such as GIF and BMP, previously hit AttributeError and logged an 'EXIF extraction failed' warning; by reading Image.getexif they now return None with no warning. Not executed.

## Findings

A: 0
B: 8
C: 0

### claude-read:CR-1 — bucket B, MEDIUM, open

Claim: The change alters what the three scanner call sites of extract_exif store, including the backfill that is the only way photos already in a library get their EXIF, and no test exercises any of those call sites.
Impact: HEIC photos already in a library get their capture time and location only through a rescan. If that path broke, these photos would silently show no Photo Info and no test would fail. The recorded app run does not cover it either: it used uploads and copies, and its final rescan changed no file_exif row.
Evidence: backend/app/services/scanner.py:549-552 (backfill), :387 (register_single_file) and :754 (new file in a scan) all call extract_exif, and none is in the diff. A grep of backend/tests for FileExif, file_exif and extract_exif finds EXIF use only in test_exif.py and in the migration and rebuild tests. In test_exif.py, a grep for 'scan' finds nothing; its tests call extract_exif directly, go through upload and copy, or insert rows by hand. decisions.md item (8) records file_exif as identical before and after the rescan.
Repro: not_reproduced. Predicted mutation, not run: delete scanner.py:549-552, then run backend/tests/test_exif.py; every test should still pass.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that places a HEIC with EXIF on disk under a row with no file_exif row, runs a scan, and asserts /exif returns the capture time and GPS. Add the same check for a file first found by a scan.

</details>

### claude-deep:DEEP-1 — bucket B, LOW, open

Claim: The exif.py change alters the behaviour of scanner.py call sites and of the note-image import path that calls register_single_file, without editing them, and test_exif.py does not exercise any of them.
Impact: The first scan after deployment writes new file_exif rows, including GPS, for existing HEIC photos and for TIFF, GIF, BMP or other images whose plugin had no _getexif. If this backfill breaks, a library's existing HEIC photos silently stay without Photo Info and no test in test_exif.py fails. It is the only route to EXIF for photos already in a library, because the new upload and copy code only handles new arrivals.
Evidence: backend/app/services/scanner.py:387 (register_single_file), :549-552 (backfill for existing rows) and :754 (pass 2 new rows) all call extract_exif. backend/app/services/markdown_image_import.py:416 calls register_single_file. backend/tests/test_exif.py has no test that runs a scan: TestExtractExif and test_exif_is_read_from_every_container call extract_exif directly, and TestEveryWayIn uses upload and copy. A grep for FileExif and extract_exif under backend/tests finds only test_exif.py and the migration tests. docs/process/reviews/fix-heic-exif/decisions.md item (8) records a rescan whose file_exif was identical before and after, so it does not record a backfill of a pre-fix HEIC.
Repro: not_reproduced. Mutation by reading only: delete scanner.py:549-552 and no test in test_exif.py reaches that code, so none of them would fail. The full suite was not run.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that creates a File row with no FileExif row over a HEIC on disk, runs a scan and asserts the /exif response.

</details>

### claude-deep:DEEP-2 — bucket B, LOW, open

Claim: complete_upload calls extract_exif after db.flush(), so reading EXIF happens while the transaction holds the SQLite write lock, and for a PNG with no EXIF before its image data that read decodes the whole image.
Impact: While a large PNG is decoded after upload, every other writer waits: other uploads in a batch, comments, progress saves and scans. SQLite's busy wait here is the driver default of 5 seconds, so a very large PNG on slow storage could make a concurrent write fail with 'database is locked'. JPEG and HEIC are not affected, because getexif does not decode their pixels.
Evidence: backend/app/services/upload.py:351 flushes and :358 calls extract_exif, with the commit at :371. read_image_dimensions is deliberately called before the flush at :305-307, and the comment at :290-292 keeps the thumbnail generator outside the write lock. backend/app/services/exif.py:70 calls img.getexif(). PngImageFile.getexif calls self.load() when 'exif' is not in info (PIL/PngImagePlugin.py:1097-1101, read in another project's virtualenv, not the pinned Pillow 11.2.1). backend/app/database.py:17 sets only check_same_thread, leaving the driver's default timeout. decisions.md item (6) timed JPEG and HEIC uploads only, not PNG.
Repro: not_reproduced. Suggested check: upload a PNG of about 100 MP with no EXIF while another request writes, and time the POST to /complete and the concurrent write, against a build with the extract_exif call moved above the first flush.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Call extract_exif next to read_image_dimensions at upload.py:305-307, before any flush on the normal path, and only write the row after the flush.

</details>

### claude-read:CR-2 — bucket B, LOW, open

Claim: Replacing _getexif() with getexif() also changes results for image formats other than HEIC: TIFF files with EXIF tags now produce file_exif rows, where before they always failed with AttributeError and produced none.
Impact: After a rescan or upload, a TIFF with camera tags gains a file_exif row and a Photo Info section, a change no test checks. The move of get_ifd inside the `with` block matters only for TIFF, which reads lazily from the open file, and no test would catch that being undone.
Evidence: backend/app/services/exif.py:69-72. In Pillow 12.1.1 source, the pinned 11.2.1 not being available, `def _getexif` exists only in the JPEG, PNG and WebP plugins. backend/app/services/filetype.py:68-69 classifies .tif and .tiff as image. test_exif_is_read_from_every_container (backend/tests/test_exif.py) covers only JPEG, HEIF and WEBP.
Repro: not_reproduced. Predicted: save a TIFF with Make and an Exif sub-IFD, call extract_exif before and after the change; before gives None with a warning, after gives a dict. Moving get_ifd outside the `with` should leave all tests green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a TIFF case to test_exif_is_read_from_every_container.

</details>

### claude-read:CR-3 — bucket B, LOW, open

Claim: complete_upload runs extract_exif after db.flush(), so uploading a PNG without an eXIf chunk decodes the whole image a second time while the transaction holds the SQLite write lock.
Impact: While a large PNG decodes, other writers wait on the lock, and the app sets no longer SQLite timeout, so a very long decode could surface as 'database is locked' elsewhere. The upload itself also gets slower. The recorded timing run covered only JPEG and HEIC, so it does not show this cost.
Evidence: backend/app/services/upload.py:351 flushes and :358 calls extract_exif; commit is at :371. upload.py:291-292 shows the code already avoids holding the write lock during heavy work. PngImagePlugin.py:1094-1098 (Pillow 12.1.1) calls self.load() in getexif when 'exif' is not in info. read_image_dimensions at upload.py:306 already does that decode once, before the first flush on most paths. backend/app/database.py:17 sets only check_same_thread. decisions.md item (6) lists only JPEG and HEIC.
Repro: not_reproduced. Commands cannot be run in this review, and the decode was read in Pillow 12.1.1, not the pinned 11.2.1.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Compute exif next to `dimensions` at upload.py:305-307, before the row writes and flush, and only add the row after the flush.

</details>

### claude-read:CR-4 — bucket B, LOW, open

Claim: Replacing a photo's bytes on disk at the same path keeps its old file_exif row, because the upload path now replaces the row but the scanner still only fills rows that are absent.
Impact: If a photo is overwritten outside the app, for example re-exported from an editor, and the drive is rescanned, the page keeps showing the old capture time, camera and location with no sign they are stale.
Evidence: backend/app/services/scanner.py:549 enters extraction only when db.get(FileExif, id) is None, and a grep shows no scanner code deleting or updating a FileExif row. backend/app/services/upload.py:352-357 handles the same staleness for uploads only.
Repro: not_reproduced. Predicted: scan a JPEG with EXIF, overwrite it with a JPEG with a different DateTimeOriginal, rescan, and /exif still returns the old date.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

### claude-deep:DEEP-3 — bucket B, INFO, open

Claim: The diff reaches complete_upload in backend/app/services/upload.py as a new writer and deleter of file_exif rows, and no declared touch-point list names it.
Impact: Every image upload now writes file_exif in the upload transaction, and an upload over a reused row deletes that row's old EXIF. The tests and code read correct: the row is replaced in the same transaction and rolls back with it.
Evidence: backend/app/services/upload.py:354-360. The reused-row branch keeps the id at :274 and :310-333; a trashed ghost gets a new id at :288-297, and its old row goes through the ON DELETE CASCADE with PRAGMA foreign_keys=ON at backend/app/database.py:35. backend/tests/test_exif.py:206-228 covers replacement and removal on a reused row.
Repro: not_reproduced. Reported because no touch-point list exists, not because of a defect.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:DEEP-4 — bucket B, INFO, open

Claim: The diff reaches copy_file in backend/app/services/fileops.py and through it both the single-copy endpoint and batch_copy, as a new writer of file_exif rows, and no declared touch-point list names it.
Impact: Each copy, including a copy to another drive, now gets a row copied from the source row rather than read from the copied file. If the source row is stale because the photo was replaced on disk outside the app, the copy inherits the stale values, and the scanner backfill will not correct them because the copy now has a row.
Evidence: backend/app/services/fileops.py:298-313, called from backend/app/routers/files.py:505 (batch_copy) and copy_file_endpoint at :1403. Backfill runs only when no row exists: backend/app/services/scanner.py:549. The session has autoflush=False (backend/app/database.py:38), and I found no ordering problem between the File and FileExif inserts by reading. backend/tests/test_exif.py:230-247 tests only a copy in the same folder on the same drive.
Repro: not_reproduced. By reading: overwrite a photo on disk outside the app, copy it through the API, then rescan. The copy would show the old photo's EXIF. Before this change it had no row, so a scan would read the bytes actually on disk.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: No test, mutation or command was run; this reviewer has read-only tools, so every repro is by reading.
- claude-deep: The Pillow behaviour in DEEP-2 was read from a virtualenv of another project on this machine, not the pinned Pillow 11.2.1, and pillow-heif 0.22.0 source was not read.
- claude-deep: Actual decode time and lock wait for a large PNG were not measured.
- claude-deep: Whether tests outside test_exif.py reach scanner EXIF through the /exif URL was not searched; only FileExif and extract_exif references were.
- claude-deep: The commit's contents were not checked with git; the review used the supplied diff and the working tree.
- claude-deep: addons/knowledge showed no files in the listing, so it was not checked for EXIF use.
- claude-deep: How .avif files open under the pinned libraries, and real phone HEIC files, were not checked.
- claude-read: No tests or code were run; every mutation and repro result is a prediction from reading.
- claude-read: The pinned Pillow 11.2.1 and pillow-heif 0.22.0 sources were not available; Pillow behavior was read in a Homebrew install of 12.1.1, and get_ifd and pillow-heif behavior comes from memory.
- claude-read: Real phone HEIC files were not checked.
- claude-read: The frontend Photo Info component was not read.
- claude-read: The actual decode time and lock wait for large PNGs were not measured.
- claude-read: Addon paths other than those found by grep for File( and register_single_file were not traced in full.
- claude-read: docs/process/review.md, spec-and-design.md and workflow.md were not read in full; touch-point handling was inferred from earlier triage records.
- claude-verify: Nothing was executed: tests, the app and Pillow calls were all checked by reading only.
- claude-verify: The pinned Pillow 11.2.1 and pillow-heif 0.22.0 sources were unavailable; Pillow behaviour was read from 12.3.0 in another project's venv, and pillow-heif's getexif path was not read.
- claude-verify: The pre-change exif.py was read from sibling worktrees, not from origin/develop itself, because git commands are unavailable.
- claude-verify: SQLAlchemy unit-of-work source was not available, so insert ordering for fileops.py:297-313 is not established from source.
- claude-verify: The time a PNG decode holds the SQLite write lock was not measured, nor whether it can exceed the driver's busy timeout.
- claude-verify: Whether every test in test_markdown_image_import.py reaches the real register_single_file was not traced.

TOTAL: 8 findings
