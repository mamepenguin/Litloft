# Triage: r2

## Warnings

- R-5 ran at be9a0fcb08490e675b3b91971389200db3236e32, and these files changed since: backend/app/services/upload.py; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: No. The design is not being patched. fba3915ca adds no branch, state or prediction to production code: it moves one existing line, the extract_exif call, from after the flush to beside read_image_dimensions, and removes nothing else. Its test additions are one parametrize row for TIFF and two test functions. 7a68cc9ac is described as adding review documents, and no code change from it appears in the record. There is no earlier fix round in this series to compare against, so nothing repeats. The move does leave the trashed-ghost branch's earlier flush ahead of the read (DEEP-R2-1); that is an incomplete move, not a new branch.
- claude-read: Two commits follow r1. fba3915ca moves one existing line, the extract_exif call, from after the flush to beside read_image_dimensions in upload.py, and adds tests: a TIFF parameter, a lock test and a scan test. 7a68cc9ac adds only review documents. Neither adds a branch, a state or a prediction in production code, so this round does not repeat what the round before it added and the design is not being patched. Neither removes one either: the delete-and-replace branch and the copy branch from before r1 remain as they were. The move leaves one path behind (CR-5), which comes from where the line was placed and not from a new condition.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: An upload extracts EXIF immediately, and an upload over a reused row deletes the old row even when the new file has no EXIF (upload.py:355-360).; A copy duplicates the source's EXIF row, GPS included and across drives, without reading the copied file (fileops.py:298-313).; TIFF files with EXIF tags now get file_exif rows, now pinned by a test but still with no approved spec (exif.py:69-72).; Image formats with no _getexif, such as BMP and GIF, now return None without the warning they used to log, a log-only change.; A SVG or other .image-classified file Pillow cannot open now logs an 'EXIF extraction failed' warning at upload as well as at scan, a log-only change, if such a file reaches upload.py:308; the classification was not traced.
- claude-deep: The tests' UNSPEC comment says a photo has its EXIF at once however it got into the library. No spec backs this. docs/specs has no entry for it according to the r1 record, which I did not recheck.
- claude-deep: TIFF files now gain file_exif rows and a Photo Info section, and the TIFF row in the test now pins this as intended behavior.
- claude-deep: Upload still replaces or deletes the file_exif row on a reused row, including removing it when the new photo has no EXIF.
- claude-deep: Copy still duplicates the source's file_exif row, GPS included, without reading the copied bytes.
- claude-read: An upload extracts EXIF immediately, and an upload over a reused row deletes the old row even when the new file has no EXIF (upload.py:355-360).
- claude-read: A copy duplicates the source's EXIF row, GPS included and across drives, without reading the copied file (fileops.py:298-313).
- claude-read: TIFF files with EXIF tags now get file_exif rows, now pinned by a test but still with no approved spec (exif.py:69-72).
- claude-read: Image formats with no _getexif, such as BMP and GIF, now return None without the warning they used to log, a log-only change.
- claude-read: A SVG or other .image-classified file Pillow cannot open now logs an 'EXIF extraction failed' warning at upload as well as at scan, a log-only change, if such a file reaches upload.py:308; the classification was not traced.

### unspecified_behavior

Note: The tests' UNSPEC comment says a photo has its EXIF at once however it got into the library. No spec backs this. docs/specs has no entry for it according to the r1 record, which I did not recheck.; TIFF files now gain file_exif rows and a Photo Info section, and the TIFF row in the test now pins this as intended behavior.; Upload still replaces or deletes the file_exif row on a reused row, including removing it when the new photo has no EXIF.; Copy still duplicates the source's file_exif row, GPS included, without reading the copied bytes.
- claude-deep: The tests' UNSPEC comment says a photo has its EXIF at once however it got into the library. No spec backs this. docs/specs has no entry for it according to the r1 record, which I did not recheck.
- claude-deep: TIFF files now gain file_exif rows and a Photo Info section, and the TIFF row in the test now pins this as intended behavior.
- claude-deep: Upload still replaces or deletes the file_exif row on a reused row, including removing it when the new photo has no EXIF.
- claude-deep: Copy still duplicates the source's file_exif row, GPS included, without reading the copied bytes.
- claude-read: An upload extracts EXIF immediately, and an upload over a reused row deletes the old row even when the new file has no EXIF (upload.py:355-360).
- claude-read: A copy duplicates the source's EXIF row, GPS included and across drives, without reading the copied file (fileops.py:298-313).
- claude-read: TIFF files with EXIF tags now get file_exif rows, now pinned by a test but still with no approved spec (exif.py:69-72).
- claude-read: Image formats with no _getexif, such as BMP and GIF, now return None without the warning they used to log, a log-only change.
- claude-read: A SVG or other .image-classified file Pillow cannot open now logs an 'EXIF extraction failed' warning at upload as well as at scan, a log-only change, if such a file reaches upload.py:308; the classification was not traced.

## Findings

A: 0
B: 5
C: 0

### claude-deep:DEEP-R2-1 — bucket B, LOW, open

Claim: Moving extract_exif above the flush at upload.py:352 does not cover the trashed-ghost path, where db.delete and db.flush at upload.py:294-295 take the write lock before extract_exif runs at upload.py:308.
Impact: When a photo in the trash has also lost its file on disk and the user uploads to that path, a large PNG with no eXIf chunk is decoded by extract_exif while the write lock is held, on top of the same decode in read_image_dimensions. Other writers wait, and past the driver's default 5-second busy wait they could fail with 'database is locked'. The path is rare: a soft delete keeps the file on disk (fileops.py:672-687) and init_upload returns 409 for an existing file (upload.py:136-137), so the trashed row must have lost its file outside the app.
Evidence: backend/app/services/upload.py:288-297 deletes and flushes, :305-308 reads dimensions and EXIF, and :371 commits. The first fix moved only the extract_exif line. backend/tests/test_exif.py test_reading_an_upload_holds_no_write_lock uploads only to a path with no row. No test in test_exif.py uses a trashed row. read_image_dimensions (image_dimensions.py:27-34) and extract_exif (exif.py:138-140) both catch Exception, so both could safely run before the try at upload.py:287.
Repro: not_reproduced. By reading: in test_reading_an_upload_holds_no_write_lock, first upload a.png, soft-delete it through the API, unlink it from disk, then upload a.png again. BEGIN IMMEDIATE from the other connection should fail, so writable should be [False]. The test as committed does not reach this branch.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Compute dimensions and exif above the try at upload.py:287, and add a trashed-row case to the lock test.

</details>

### claude-deep:DEEP-R2-2 — bucket B, LOW, open

Claim: The new scan test covers the extract_exif call sites at scanner.py:754 and :549-552 but not the one at scanner.py:387-389 in register_single_file, so removing that one fails no test.
Impact: If EXIF storage in register_single_file broke, an image registered through it would silently have no Photo Info until a later scan backfilled it. The exposure is small: callers are markdown_image_import.py:416 and the media_import addon (subscription/db.py:983, service.py:729), and the backfill would repair the row on the next scan.
Evidence: backend/tests/test_exif.py test_a_scan_reads_a_photo_it_finds_and_one_with_no_exif_row calls only _scan_and_register. test_scanner.py, test_image_dimensions.py and test_transparent_thumbnails.py call register_single_file, but a grep of backend/tests outside test_exif.py for exif finds no assertion on a file_exif row from it. test_image_dimensions.py:78-94 only uses EXIF as an orientation fixture. test_safe_image_fetch.py:538 asserts that a fetched image has no EXIF, which suggests that at least some note-image imports arrive without any.
Repro: not_reproduced. Mutation by reading, not run: delete scanner.py:387-389 and no test asserting file_exif reaches that line, so the suite should stay green.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a register_single_file case that asserts the /exif response for a photo with EXIF.

</details>

### claude-read:CR-5 — bucket B, LOW, open

Claim: The move of extract_exif above the row writes does not take it out of the write lock on the trashed-ghost path, because that path flushes a delete and runs cleanup_orphan_tags before the read, and the new lock test covers only a fresh upload.
Impact: When a trashed row's file has gone from disk and a large PNG without an eXIf chunk is uploaded to that path, other writers wait while the PNG decodes, and with the default 5 second busy timeout could fail with 'database is locked'. This is rare: a normal trash keeps the file on disk, so init_upload answers 409 and the path is not reached.
Evidence: backend/app/services/upload.py:288-296 runs db.delete(existing), db.flush() and cleanup_orphan_tags; extract_exif runs afterwards at :308; the commit is at :371. backend/app/services/fileops.py:671-687 shows the soft delete keeps the file on disk, and upload.py:136-137 rejects a live path, so the ghost needs the file removed outside the app while it is in the trash. backend/tests/test_exif.py test_reading_an_upload_holds_no_write_lock uploads only a new a.png. read_image_dimensions at :306 has the same placement and predates this change.
Repro: not_reproduced. Predicted: trash a.png through the API, unlink it from disk, then run the test's stubbed extract_exif during an upload to a.png. writable should be [False]. Commands cannot be run in this review.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Compute dimensions and exif before the `if existing is not None and existing.deleted_at is not None` block, and add the ghost case to the lock test.

</details>

### claude-read:CR-6 — bucket B, LOW, open

Claim: The EXIF call in register_single_file is still not asserted by any test, although the new scan test closes the other two scanner call sites.
Impact: A photo brought in through note image import reaches the library through this function. If its EXIF call broke, that photo would silently have no Photo Info until a later scan backfilled it, and no test would fail.
Evidence: backend/app/services/scanner.py:387-389 calls extract_exif and adds the row. backend/app/services/markdown_image_import.py:416 is its production caller. A grep of backend/tests for '/exif', 'file_exif' and 'extract_exif' matches only test_exif.py and two database migration or rebuild test files. A grep for register_single_file across backend/tests, limited to its first 30 matches, showed no hit in test_exif.py, and the test_exif.py diff imports only _scan_and_register. The callers listed in test_image_dimensions.py, test_scanner.py and others are outside the EXIF match set.
Repro: not_reproduced. Predicted mutation, not run: delete scanner.py:387-389. No test should fail, because no test asserts a file_exif result after register_single_file. Deleting :549-552 or :754-756 should now fail test_a_scan_reads_a_photo_it_finds_and_one_with_no_exif_row.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add to TestEveryWayIn a test that calls register_single_file on a HEIC with EXIF and asserts the /exif response.

</details>

### claude-deep:DEEP-R2-3 — bucket B, INFO, open

Claim: The write-lock test depends on the module attribute upload_service.extract_exif being called exactly once, so moving the call behind a helper in another module fails it with no behavior change.
Impact: A behavior-preserving refactor would turn this test red with writable == [] or an unpatched read, which docs/process/testing-and-comments.md:14 describes as a change check that was kept. It cannot let a user-visible defect through, because the mutation that matters (moving the read back below the flush) still fails it.
Evidence: backend/tests/test_exif.py test_reading_an_upload_holds_no_write_lock uses monkeypatch.setattr(upload_service, "extract_exif", ...) and asserts writable == [True]. The DB path comes from db.get_bind().url.database, a real file per tests/conftest.py:76-78, so the probe is not vacuous and does test a separate connection.
Repro: not_reproduced. By reading: re-exporting the read through another module's helper leaves the patch unused, so writable stays empty and the assertion fails.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: Nothing was executed: tests, mutations and repros are all predictions from reading, because this reviewer has read-only tools.
- claude-deep: The pinned Pillow 11.2.1 and pillow-heif 0.22.0 sources were not read. Claims about getexif, get_ifd and TIFF saving come from memory of Pillow and from r1's notes on newer versions.
- claude-deep: Whether the TIFF test row passes with exif= bytes that hold sub-IFDs was not run; I relied on memory of TiffImagePlugin._save.
- claude-deep: Lock wait and decode time for a large PNG were not measured.
- claude-deep: Real phone HEIC files were not checked.
- claude-deep: The commit contents were not checked with git; I used the supplied diff and the working tree, and 7a68cc9ac's own diff was not shown separately.
- claude-deep: docs/process/review.md and the other process documents were read only in part: testing-and-comments.md in full, review.md lines 40-54 and 200-217.
- claude-deep: addons/knowledge was not checked, and the media_import register_single_file callers were not traced to see whether they ever pass an image.
- claude-deep: The scan and upload race in regression_risks was traced by reading only, and the scan's maintenance lock (`_scan_lock`) was not traced against complete_upload beyond a grep of scanner.py.
- claude-read: No test, mutation or command was run; every mutation result and repro is a prediction from reading.
- claude-read: The pinned Pillow 11.2.1 and pillow-heif 0.22.0 sources were not read; Pillow behavior here comes from memory and the earlier review record.
- claude-read: Real phone HEIC files were not checked.
- claude-read: Decode time and lock wait for a large PNG were not measured.
- claude-read: The commit's contents were not checked with git; the review used the supplied diff and the working tree.
- claude-read: The grep for register_single_file in backend/tests was cut off at 30 matches, so its remaining callers were not listed; the absence of an EXIF assertion rests on the separate grep for '/exif', 'file_exif' and 'extract_exif'. That grep did not match 'FileExif', and r1's search for it found only test_exif.py and migration tests.
- claude-read: docs/process/review.md, testing-and-comments.md, backend-conventions.md and docs/specs were not read; only .claude/rules/process.md was.
- claude-read: The classification of SVG files at upload and addon code paths were not traced.
- claude-verify: No test or mutant was run, because this role has no way to execute commands; all confirmations come from reading the code.
- claude-verify: Lock behavior at runtime was not observed. How long extract_exif holds the lock on the ghost path was not measured.
- claude-verify: The Pillow source was not available in the backend tree, so the whole-image decode for EXIF-less PNG was not checked.
- claude-verify: Git history and the diff were not read, so the claims that read_image_dimensions placement predates this change and that the first fix moved only the extract_exif line are unchecked.
- claude-verify: The purge paths in fileops.py were not read in full, so the absence of an in-app route to a trashed row with no file rests on the soft-delete, init_upload and grep evidence.

TOTAL: 5 findings
