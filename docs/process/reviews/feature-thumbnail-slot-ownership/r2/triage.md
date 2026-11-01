# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-deep: Only one round since r1 changes production code: 3ba3a824c. The other three commits are tests (e22ce7a75) or review records (1da095a54, 134c1042a), so no earlier fix round exists for this one to repeat. That round adds one state, 'unknown', to _reach_key, plus one early-exit branch in the migration loop and the prediction that the next startup retries such a row. It answers r1's stat-error finding directly and does not rework an earlier patch, so this is not yet a design being patched. It also removes things: the migration leaves thumbnail.py, along with its SQLAlchemy and models imports and thumbnail.py's allow-list entry, and fileops._cleanup_empty_parents is gone in favour of prune_empty_dirs. The added state is not in the spec's state table and has no recorded revision. It also leaves a pointer that may never repair itself when a non-file sits at the path, so a further round around this state should be read as a warning sign.
- claude-read: There has been one round of fixes since r1, so no earlier fix round exists for this one to repeat. Commit 1da095a54 records r1 and 134c1042a records a second R-5 run; both are documents only. e22ce7a75 adds tests only, including predictions for the 'unknown' behaviour that the next commit implements. 3ba3a824c adds one state and branch to the migration: _reach_key gains an 'unknown' key beside 'inode' and 'absent', and the loop gains a keep-and-warn branch. That is a fourth per-row outcome beside moved, repointed and emptied, and the spec's state table was not revised to include it. The same commit also removes things: the migration's dependencies leave thumbnail.py, thumbnail.py drops out of the os.replace allow-list, and the duplicate fileops._cleanup_empty_parents goes. So this round adds one state and removes structure. It does not show the pattern of a design being patched repeatedly, though a further stat or non-regular special case in the migration would start that pattern.

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

Note: A stat failure other than a missing path keeps the pointer and counts as failed. This is the r1 proposal, but no spec section or revision states it, and the spec's section 3 list has no such outcome.; A pointer naming a directory or other non-regular file is kept at every startup and is never regenerated, while I10 says a row with no file and no slot has its pointer emptied (R2-MIG-1).; While a cache directory stays unsearchable, a row kept by the new branch answers 500 at GET /api/files/{id}/thumbnail instead of the placeholder. decisions.md records this as DIFFERS; the route has no diff, but at r1's head the same rows had an empty pointer and served the placeholder.; A scan-detected move of a row with an empty or dangling pointer defers generation to the next scan (r1 F-5). No ruling is recorded, and the spec's section 9 'after the first scan' does not state the delay.; Two rows naming one absent string form a shared group and are both emptied even if a slot exists, against I10's wording (claude-deep r1). I still found no ordinary way to reach this.
- claude-deep: A stat error or non-file at a pointer now keeps it and counts as failed. The spec's state table and failure cases do not state this, and I10 reads the other way for a non-file (MIG-2).
- claude-deep: Still undecided from r1: a scan-detected move of a row with an empty or dangling .by-id pointer does not generate until the next scan, because scanner.py:657-679 has no thumbnail step. This narrows I1's 'after the first scan' for a shared row renamed on disk before that scan.
- claude-deep: Still undecided from r1: two rows naming one absent path string are both emptied at thumbnail_migration.py:88-93 even if a slot exists, whereas I10 repoints a row with a slot. I found no ordinary path to that state.
- claude-deep: Still undecided from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so startups repeat the move during the delivery window (decisions.md first run, item 5).
- claude-deep: A commit failure on upload over a reused row leaves the slot holding the new file's picture while the row rolls back. Spec section 2 defines only the new-id case.
- claude-read: A stat failure other than a missing path keeps the pointer and counts as failed. This is the r1 proposal, but no spec section or revision states it, and the spec's section 3 list has no such outcome.
- claude-read: A pointer naming a directory or other non-regular file is kept at every startup and is never regenerated, while I10 says a row with no file and no slot has its pointer emptied (R2-MIG-1).
- claude-read: While a cache directory stays unsearchable, a row kept by the new branch answers 500 at GET /api/files/{id}/thumbnail instead of the placeholder. decisions.md records this as DIFFERS; the route has no diff, but at r1's head the same rows had an empty pointer and served the placeholder.
- claude-read: A scan-detected move of a row with an empty or dangling pointer defers generation to the next scan (r1 F-5). No ruling is recorded, and the spec's section 9 'after the first scan' does not state the delay.
- claude-read: Two rows naming one absent string form a shared group and are both emptied even if a slot exists, against I10's wording (claude-deep r1). I still found no ordinary way to reach this.
- claude-verify: Migration keeps the pointer for a stat error or a non-regular file (thumbnail_migration.py:30-33, :82-87). r1 sent this question to a human, and no decision is recorded.
- claude-verify: Purging a row whose pointer names a directory raises at fileops.py:641, because unlink is called on a directory, and the migration now keeps such pointers. No ordinary way to reach this was found.
- claude-verify: An upload over a reused row whose commit fails leaves the slot already rewritten, since upload.py:361 removes the new slot only when there is no reused row. The spec states only the new-id case. The target file also stays on disk, so a later scan would match the picture for a .by-id row.

### unspecified_behavior

Note: Migration keeps the pointer for a stat error or a non-regular file (thumbnail_migration.py:30-33, :82-87). r1 sent this question to a human, and no decision is recorded.; Purging a row whose pointer names a directory raises at fileops.py:641, because unlink is called on a directory, and the migration now keeps such pointers. No ordinary way to reach this was found.; An upload over a reused row whose commit fails leaves the slot already rewritten, since upload.py:361 removes the new slot only when there is no reused row. The spec states only the new-id case. The target file also stays on disk, so a later scan would match the picture for a .by-id row.
- claude-deep: A stat error or non-file at a pointer now keeps it and counts as failed. The spec's state table and failure cases do not state this, and I10 reads the other way for a non-file (MIG-2).
- claude-deep: Still undecided from r1: a scan-detected move of a row with an empty or dangling .by-id pointer does not generate until the next scan, because scanner.py:657-679 has no thumbnail step. This narrows I1's 'after the first scan' for a shared row renamed on disk before that scan.
- claude-deep: Still undecided from r1: two rows naming one absent path string are both emptied at thumbnail_migration.py:88-93 even if a slot exists, whereas I10 repoints a row with a slot. I found no ordinary path to that state.
- claude-deep: Still undecided from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so startups repeat the move during the delivery window (decisions.md first run, item 5).
- claude-deep: A commit failure on upload over a reused row leaves the slot holding the new file's picture while the row rolls back. Spec section 2 defines only the new-id case.
- claude-read: A stat failure other than a missing path keeps the pointer and counts as failed. This is the r1 proposal, but no spec section or revision states it, and the spec's section 3 list has no such outcome.
- claude-read: A pointer naming a directory or other non-regular file is kept at every startup and is never regenerated, while I10 says a row with no file and no slot has its pointer emptied (R2-MIG-1).
- claude-read: While a cache directory stays unsearchable, a row kept by the new branch answers 500 at GET /api/files/{id}/thumbnail instead of the placeholder. decisions.md records this as DIFFERS; the route has no diff, but at r1's head the same rows had an empty pointer and served the placeholder.
- claude-read: A scan-detected move of a row with an empty or dangling pointer defers generation to the next scan (r1 F-5). No ruling is recorded, and the spec's section 9 'after the first scan' does not state the delay.
- claude-read: Two rows naming one absent string form a shared group and are both emptied even if a slot exists, against I10's wording (claude-deep r1). I still found no ordinary way to reach this.
- claude-verify: Migration keeps the pointer for a stat error or a non-regular file (thumbnail_migration.py:30-33, :82-87). r1 sent this question to a human, and no decision is recorded.
- claude-verify: Purging a row whose pointer names a directory raises at fileops.py:641, because unlink is called on a directory, and the migration now keeps such pointers. No ordinary way to reach this was found.
- claude-verify: An upload over a reused row whose commit fails leaves the slot already rewritten, since upload.py:361 removes the new slot only when there is no reused row. The spec states only the new-id case. The target file also stays on disk, so a later scan would match the picture for a .by-id row.

### unspecified_behavior

Note: A stat error or non-file at a pointer now keeps it and counts as failed. The spec's state table and failure cases do not state this, and I10 reads the other way for a non-file (MIG-2).; Still undecided from r1: a scan-detected move of a row with an empty or dangling .by-id pointer does not generate until the next scan, because scanner.py:657-679 has no thumbnail step. This narrows I1's 'after the first scan' for a shared row renamed on disk before that scan.; Still undecided from r1: two rows naming one absent path string are both emptied at thumbnail_migration.py:88-93 even if a slot exists, whereas I10 repoints a row with a slot. I found no ordinary path to that state.; Still undecided from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so startups repeat the move during the delivery window (decisions.md first run, item 5).; A commit failure on upload over a reused row leaves the slot holding the new file's picture while the row rolls back. Spec section 2 defines only the new-id case.
- claude-deep: A stat error or non-file at a pointer now keeps it and counts as failed. The spec's state table and failure cases do not state this, and I10 reads the other way for a non-file (MIG-2).
- claude-deep: Still undecided from r1: a scan-detected move of a row with an empty or dangling .by-id pointer does not generate until the next scan, because scanner.py:657-679 has no thumbnail step. This narrows I1's 'after the first scan' for a shared row renamed on disk before that scan.
- claude-deep: Still undecided from r1: two rows naming one absent path string are both emptied at thumbnail_migration.py:88-93 even if a slot exists, whereas I10 repoints a row with a slot. I found no ordinary path to that state.
- claude-deep: Still undecided from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so startups repeat the move during the delivery window (decisions.md first run, item 5).
- claude-deep: A commit failure on upload over a reused row leaves the slot holding the new file's picture while the row rolls back. Spec section 2 defines only the new-id case.
- claude-read: A stat failure other than a missing path keeps the pointer and counts as failed. This is the r1 proposal, but no spec section or revision states it, and the spec's section 3 list has no such outcome.
- claude-read: A pointer naming a directory or other non-regular file is kept at every startup and is never regenerated, while I10 says a row with no file and no slot has its pointer emptied (R2-MIG-1).
- claude-read: While a cache directory stays unsearchable, a row kept by the new branch answers 500 at GET /api/files/{id}/thumbnail instead of the placeholder. decisions.md records this as DIFFERS; the route has no diff, but at r1's head the same rows had an empty pointer and served the placeholder.
- claude-read: A scan-detected move of a row with an empty or dangling pointer defers generation to the next scan (r1 F-5). No ruling is recorded, and the spec's section 9 'after the first scan' does not state the delay.
- claude-read: Two rows naming one absent string form a shared group and are both emptied even if a slot exists, against I10's wording (claude-deep r1). I still found no ordinary way to reach this.
- claude-verify: Migration keeps the pointer for a stat error or a non-regular file (thumbnail_migration.py:30-33, :82-87). r1 sent this question to a human, and no decision is recorded.
- claude-verify: Purging a row whose pointer names a directory raises at fileops.py:641, because unlink is called on a directory, and the migration now keeps such pointers. No ordinary way to reach this was found.
- claude-verify: An upload over a reused row whose commit fails leaves the slot already rewritten, since upload.py:361 removes the new slot only when there is no reused row. The spec states only the new-id case. The target file also stays on disk, so a later scan would match the picture for a .by-id row.

## Findings

A: 0
B: 13
C: 0

### claude-deep:TEST-3 — bucket B, MEDIUM, open

Claim: No test fails if the scan's path-form guard at scanner.py:501 is removed, although test_path_form_row_is_left_alone is labelled I16 and I16 forbids a generator or rewrite for such a row.
Impact: A regression could let a scan regenerate or rewrite a row whose migration failed, with every test green. The row's picture would change, or its old file would be stranded while the next startup still tries to move it. Nothing is wrong in the code today.
Evidence: backend/app/services/scanner.py:501 is the guard. test_thumbnail_slots.py test_path_form_row_is_left_alone uses an opaque RGB PNG, a seeded row with image_width None and an existing thumbnail file whose bytes start with \xff\xd8l. With the guard gone, line 503 finds the file, _is_flattened_transparent_picture returns False at scanner.py:215 because the signature differs, and _is_letterboxed_image_thumbnail returns False at scanner.py:180 because the width is None. The pointer and bytes therefore stay as asserted. No path-form row with an absent file, a transparent source or letterboxed dimensions is scanned in this test. Other scans over path-form seeds (test_markdown_images.py:256-283, test_missing.py:84 and :288) target other behaviour, and I found no assertion in them that this guard would decide; I read them through search hits only.
Repro: not_reproduced (read-only reviewer). Predicted mutation: replace `gen_fn is not None and _is_slot_or_empty(file_record.thumbnail_path)` with `gen_fn is not None` at scanner.py:501; predicted result is that the mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Parametrise the test over three rows: a path-form pointer with its file absent, a transparent PNG with a real JPEG-signature thumbnail, and an image with stored dimensions and a 320x180 thumbnail. Assert the pointer and bytes are unchanged and no slot appears.

</details>

### claude-deep:TEST-4 — bucket B, MEDIUM, open

Claim: The failure branch of complete_upload has no test: neither the removal of a new slot when the commit fails nor the rule that a trashed ghost keeps its picture when the upload fails.
Impact: Deleting upload.py:361-362 would strand a slot under an id no row holds, and moving the removal at upload.py:364 ahead of the commit would destroy a ghost's picture while the rollback restores its row. Either change would pass every test I found. I13's failure half is exercised only for a move.
Evidence: backend/app/services/upload.py:360-364. test_upload_over_a_trashed_ghost_removes_the_ghosts_picture covers only the success path. A search of backend/tests for a replaced session commit finds only test_trash_purge_loop.py, test_markdown_image_import.py and test_thumbnail_slots.py:912, which is the migration test. test_upload.py has no match for commit failure, SQLAlchemyError or untrack_empty_folder. Spec section 2 states 'Upload with a new id, the commit fails: the slot just written is removed'. The r1 coverage notes listed the first half and the fix round did not cover it.
Repro: not_reproduced (read-only reviewer). Predicted mutations: delete upload.py:361-362, or move upload.py:364 before the try at upload.py:297; predicted result is that both survive.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add one upload test over a trashed ghost in which a call inside the try raises. Assert the upload fails, the ghost row and its picture remain, and no new slot file exists.

</details>

### claude-read:R2-TEST-1 — bucket B, MEDIUM, open

Claim: I13's failure half is tested only for move, so the fix that extended the success half to rename and copy left a premature removal in rename, copy or upload undetected.
Impact: If the removal moved ahead of the commit in rename_file, copy_file or complete_upload, a failed operation would keep the ghost row but lose its picture. The Trash view would then show the placeholder for good on a .loft or a Missing row, and every test would stay green. The current code is correct.
Evidence: fileops.py:406 (rename), fileops.py:330 (copy) and upload.py:364 remove the picture after the commit. test_thumbnail_slots.py:427 test_a_move_that_fails_before_its_commit_leaves_the_ghost_and_its_picture is the only failure-half test. The parametrised test added in e22ce7a75 runs only the success path, and it would still pass with an early removal. Pattern searches of backend/tests for ghost or trash tests with a failure, and for monkeypatches of upload's helpers, found nothing.
Repro: not_reproduced (read-only tools). Predicted mutation: move remove_thumbnail_quietly(ghost_picture) from fileops.py:406 to just before old_full.rename at fileops.py:388. All tests are predicted to stay green, because the rename test only asserts the picture is gone after a 200. The same applies at fileops.py:330 if placed before the commit, and at upload.py:364.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Parametrise the failure-half test over rename, copy and upload as the success-half test was, failing each before its commit and asserting the ghost row and picture bytes remain.

</details>

### claude-deep:CONC-1 — bucket B, LOW, open

Claim: complete_upload now generates the thumbnail after flushing a trashed ghost's delete, so the SQLite write transaction stays open for the whole generation.
Impact: Uploading a video over a trashed ghost holds the write lock while ffmpeg runs, including its retries. Another writer in that window, such as watch progress or a rename, can fail with 'database is locked' once the driver's wait runs out. It needs a ghost whose file has left the disk, because init_upload otherwise answers 409, so it is uncommon.
Evidence: backend/app/services/upload.py:278-280 deletes, flushes and cleans tags, and upload.py:290 then generates. Before this change the generator ran ahead of the lookup, as the diff of upload.py shows. backend/app/database.py:15-27 sets no timeout, so the sqlite3 driver's default applies; I took that default of 5 seconds from memory of the Python documentation. Only the trashed branch flushes first. A reused row reads only, so it takes no write lock before generation.
Repro: not_reproduced. By reading: trash a large video, remove its file from disk, upload a video to the same path, and issue a write while generation runs.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Look up the row and choose the id first, generate, then delete and flush the ghost inside the try.

</details>

### claude-deep:MIG-2 — bucket B, LOW, open

Claim: The fix adds an unknown state that keeps the pointer for a stat error or a non-file at the path, and neither the spec nor a recorded revision states this state.
Impact: A pointer naming a directory is never repaired. Each startup logs one warning and counts one failure, the scan skips the row as path form, and the thumbnail endpoint finds that the path exists and tries to serve a directory. While a stat error lasts, the run log records a 500 from the endpoint. No user path I found creates a directory at a pointer, because the old generator could not publish a file over one; the stat case needs a faulty cache mount.
Evidence: backend/app/services/thumbnail_migration.py:30-33 and :82-87. Spec section 3 lists path form to .by-id or empty only, and section 1 groups only by file exists or does not. I10 says a row whose file is absent with no slot is emptied, while test_a_pointer_naming_something_that_is_not_a_file_is_kept pins the opposite for a directory. docs/process/reviews/feature-thumbnail-slot-ownership/invariants.md has an empty Revisions section. r1 raised these two cases as unspecified behaviour needing a person, and decisions.md records the observed behaviour (run 2, item 2: 500s at routers/files.py get_thumbnail) but no human decision. routers/files.py:1195-1196 uses exists(), not is_file().
Repro: not_reproduced by me. decisions.md run 2 item 2 records the stat case: 'moved 11, emptied 6, failed 2', then 500s until the mode was restored. The directory case is by reading plus the pinned test.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the unknown state in a revision: stat errors keep the pointer. Have a person decide whether a non-file at the pointer keeps it or is treated as absent, as I10 reads.

</details>

### claude-deep:TEST-5 — bucket B, LOW, open

Claim: The NotADirectoryError half of the new absent test in _reach_key has no test.
Impact: If that exception were dropped from the except clause, a pointer whose parent component is a regular file would become unknown, keeping its pointer, logging a warning and counting as failed at every startup, with the scan skipping it forever. I10 says such a row is emptied. This shape is rare in a real cache.
Evidence: backend/app/services/thumbnail_migration.py:28 catches (FileNotFoundError, NotADirectoryError). In test_thumbnail_slots.py the absent cases use a missing leaf or missing directories, and test_a_stat_that_fails_for_another_reason uses PermissionError. test_unavailable_cache_does_not_fail_the_operation replaces the thumbnail directory with a file, but it seeds a .by-id pointer, which migration does not select, and it does not restart.
Repro: not_reproduced (read-only reviewer). Predicted mutation: change thumbnail_migration.py:28 to `except FileNotFoundError:`; predicted result is that the mutant survives.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Seed a pointer `<drive>/f.jpg/a.jpg` where `<drive>/f.jpg` is a file, restart, and assert the pointer is empty and the warning count is zero.

</details>

### claude-read:R2-MIG-1 — bucket B, LOW, open

Claim: The fix for MIG-1 and F-6 added a third migration outcome, 'unknown', that the approved spec's state table and failure list do not contain, and it keeps a pointer naming a non-regular file with no way out.
Impact: A stat error that clears retries correctly at the next startup. A directory at the pointer's path does not clear by itself: the row logs a warning and counts as failed at every startup, and the scan skips it because the pointer is path-form, so no picture is ever generated. The thumbnail endpoint would find the path existing and hand a directory to FileResponse, which should answer an error rather than the placeholder. At r1's head this case was emptied and regenerated. Reaching it needs a directory exactly at a row's pointer, and I found no ordinary sequence that produces one, because the old generator could not publish a file over a directory or the reverse.
Evidence: thumbnail_migration.py:32-33 returns ('unknown', rel) for a non-regular file, and :82-87 keeps the pointer. scanner.py:501 skips the row. routers/files.py:1195-1196 and :1160-1168 pass the directory on with its stat result. test_thumbnail_slots.py test_a_pointer_naming_something_that_is_not_a_file_is_kept pins the kept pointer. The spec's section 3 list of pointer states, section 2 and I10 ('with neither, its pointer is emptied') do not address it. invariants.md has an empty Revisions section, so the spec was not revised. Spec section 3 also says a row whose rename failed names its own file alone, and an unknown group can hold several rows naming one string.
Repro: not_reproduced. By reading: seed a sole row, mkdir at its pointer path, restart repeatedly. The pointer is kept with one warning per start (pinned by the test above); GET /api/files/{id}/thumbnail is predicted to fail rather than serve the placeholder.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record in a revision that a stat failure keeps the pointer, and decide whether a non-regular file should count as absent under I10 so the row can regenerate.

</details>

### claude-read:R2-TEST-2 — bucket B, LOW, open

Claim: The migration's moved, emptied and failed counts are not asserted by any test, so the summary line an operator is told to read can be wrong with every test green.
Impact: The admin guide directs the operator to the line 'moved N, emptied N, failed N'. Dropping the failed count for a kept row would make the log report 'failed 0' while pointers were kept and pictures unmigrated, which is a check passing silently. The return value of migrate_thumbnail_slots is discarded at main.py:277, and the tests never read it.
Evidence: thumbnail_migration.py:85, :93, :101, :114, :119, :122 and :125 update the counts. A search of test_thumbnail_slots.py for 'moved N', 'emptied', 'rows to examine' and 'Thumbnail migration' finds only an unrelated string at line 445. The r1 stat-failure tests at test_thumbnail_slots.py (test_a_stat_that_fails_for_another_reason_keeps_the_pointer_and_the_run_goes_on, test_a_pointer_naming_something_that_is_not_a_file_is_kept) assert the pointer and the warning text, not the count. Only a manual run in decisions.md observed these numbers.
Repro: not_reproduced (read-only tools). Predicted mutation: delete counts["failed"] += len(members) at thumbnail_migration.py:85; all tests are predicted to stay green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Call migrate_thumbnail_slots directly in the existing stat-failure, shared, absent and sole-owner tests and assert the returned counts.

</details>

### claude-read:R2-TEST-3 — bucket B, LOW, open

Claim: The NotADirectoryError arm of _reach_key has no test, although it decides between emptying a pointer and keeping it at every later startup.
Impact: If that arm were dropped, a row whose pointer runs through a path component that is now a file would land in the unknown group. It would then keep its pointer, log a warning at every startup and never get a picture, because the scan skips path-form rows. No test would notice.
Evidence: thumbnail_migration.py:28 catches FileNotFoundError and NotADirectoryError. test_thumbnail_slots.py's absent-file tests (test_absent_file_with_existing_slot_is_repointed, test_absent_file_and_absent_slot_empties_the_pointer) leave the parent missing, which raises FileNotFoundError. A search for NotADirectory in test_thumbnail_slots.py finds nothing.
Repro: not_reproduced (read-only tools). Predicted mutation: narrow the except at thumbnail_migration.py:28 to FileNotFoundError; all tests are predicted to stay green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that places a regular file at a parent component of the pointer and asserts the pointer is emptied.

</details>

### claude-read:R2-TEST-4 — bucket B, LOW, open

Claim: The spec's failure case 'upload with a new id, the commit fails: the slot just written is removed' still has no test.
Impact: Removing the cleanup would strand one slot per failed upload under an id no row holds. Nothing lists .by-id, so that disk is never reclaimed, and no test would fail. The cost is disk only and needs a commit failure.
Evidence: upload.py:360-363 is the branch. claude-deep's r1 test_coverage listed this gap, and e22ce7a75 did not add it. test_upload.py has no commit-failure injection (its only commit matches are the seeding calls at lines 416 and 429), and test_thumbnail_slots.py's upload tests all succeed at the commit.
Repro: not_reproduced (read-only tools). Predicted mutation: delete upload.py:361-362; all tests are predicted to stay green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Fail a helper before the commit in complete_upload for a new-id upload and assert .by-id holds no file.

</details>

### claude-deep:LOG-1 — bucket B, INFO, open

Claim: The new unknown-state warning names only the path, not the row.
Impact: An operator with a failed row gets a thumbnail path and no file id. Several rows reaching one unknown string log identical lines. The picture is unaffected.
Evidence: backend/app/services/thumbnail_migration.py:83-84 discards the id with `for _, rel in members`. Spec section 8 says each failed migration row logs one warning 'naming the row and the path', and the os.replace warning at thumbnail_migration.py:111-113 does name both.
Repro: Read the code. test_a_stat_that_fails_for_another_reason asserts only that one message contains a.jpg.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Keep the id in the loop and include it in the warning.

</details>

### claude-deep:SCOPE-1 — bucket B, INFO, open

Claim: The fix round creates backend/app/services/thumbnail_migration.py, while the touch-point list still places the migration in thumbnail.py, and no touch-point departure is recorded in a revision.
Impact: No user effect. A reader of the approved list looks for the migration in the wrong module, and the atomic-write detector's allow-list entry for the new module is not named. r1's TP-1, TP-3 and TP-4 also remain unrecorded in the same way.
Evidence: Touch points: 'backend/app/services/thumbnail.py: thumbnail_slot_rel, the migration step'. invariants.md has an empty Revisions section. backend/tests/test_atomic_write.py:209-211 now names thumbnail_migration.py. Moving the module does narrow r1's TP-2 concern: thumbnail.py is off the allow-list, and the detector sees the file holding only the migration's os.replace at thumbnail_migration.py:109. The commit also replaces fileops._cleanup_empty_parents with prune_empty_dirs, including in physical_delete, which is unlisted; the behaviour is the same by reading.
Repro: Compare the diff's file list with the Touch points section and read invariants.md.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the module, the allow-list entry and r1's listed test and document edits to a touch-point revision.

</details>

### claude-read:R2-TP-1 — bucket B, INFO, open

Claim: backend/app/services/thumbnail_migration.py, created by the r1 fix, is not in the touch-point list, which still places the migration step in thumbnail.py, and none of r1's touch-point departures were recorded.
Impact: No user effect. A reader following the spec's touch points looks for the migration in thumbnail.py, and the list still omits the test_atomic_write allow-list entry, architecture.md and the test_transparent_thumbnails and test_copy rewrites.
Evidence: main.py:27 imports from app.services.thumbnail_migration. The spec's touch points say 'backend/app/services/thumbnail.py: thumbnail_slot_rel, the migration step'. docs/process/reviews/feature-thumbnail-slot-ownership/invariants.md lines 1-3 hold an empty Revisions section. The move itself did what claude-deep's TP-2 proposed: test_atomic_write.py:209-211 now exempts only a module with no generators, and thumbnail.py has no os.replace left.
Repro: not_reproduced; found by comparing the diff's file list with the touch-point list and invariants.md.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a touch-point revision in invariants.md naming the new module and r1's TP-1 to TP-4.

</details>

## Not verified

- claude-deep: I ran nothing: no tests, mutations or application. Every mutation outcome here is predicted from reading the code.
- claude-deep: That the thumbnail endpoint answers 500 for a directory at the pointer; I read the exists() check in routers/files.py but not _revalidating_image's or Starlette's handling of a directory.
- claude-deep: The actual lock wait on the configured connection and how long ffmpeg holds it for CONC-1.
- claude-deep: Every body of the five other test files that complete uploads (test_transparent_thumbnails.py, test_purge_orphan_tags.py, test_image_dimensions.py, test_frontmatter_tags_on_create.py, test_chapter_ingest.py) for a failure injection; I relied on searches for replaced commits.
- claude-deep: The full bodies of test_missing.py and test_markdown_images.py for TEST-3; I read search hits only.
- claude-deep: The evidence directory cited in decisions.md, which is outside this worktree; its claims are quoted, not checked.
- claude-deep: The Media Import half of I15 and SPEC-ADDON-040, which are not at this commit.
- claude-deep: Inode stability on case-folding, FUSE or network cache mounts, and migration timing against the healthcheck window on a large library.
- claude-deep: The Intelligence reconcile in full; I read search hits for its thumbnail handling only.
- claude-read: I ran nothing: no tests, mutations or application. Every mutation outcome here is predicted from reading the code.
- claude-read: I did not confirm by running that FileResponse on a directory answers an error at the thumbnail endpoint; that is inferred from routers/files.py and from how a directory open fails.
- claude-read: The test-gap searches were pattern searches of backend/tests, not a reading of every test file, so a differently named failure test could exist.
- claude-read: The SQLite busy timeout and whether a video generation under the upload's flushed transaction reaches it.
- claude-read: The evidence directory cited in decisions.md, which is outside this worktree; I took its recorded observations as a record and did not check them.
- claude-read: Media Import's writer and its tests, which are not at this commit, and the Python runtime's Path.is_file behaviour on a slot stat error other than a missing path at thumbnail_migration.py:120.
- claude-read: Migration timing on a Docker Desktop bind mount, and inode stability on case-folding or FUSE cache mounts.
- claude-verify: Nothing was run: no tests, mutations or application. Every mutation outcome is predicted from reading.
- claude-verify: Git objects were not read. The worktree was taken as commit 134c1042a from the status snapshot and r2/head.txt, and the base comparison used the main checkout, whose commit was not confirmed.
- claude-verify: Not every test body that sets deleted_at or scans was read. Coverage outside the files named comes from pattern searches.
- claude-verify: Starlette's FileResponse behaviour for a directory with a supplied stat result was not read, nor was a directory case run.
- claude-verify: The evidence directory cited in decisions.md is outside this worktree and was not checked.
- claude-verify: SQLite lock contention and the driver's 5-second default were not exercised, and the default comes from memory of the Python documentation.

TOTAL: 13 findings
