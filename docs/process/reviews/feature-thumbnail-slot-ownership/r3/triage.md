# Triage: r3

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-deep: Production code changed in one commit this round, 72877969e; 0154854d8 and 819742a01 are tests, and e80f61d56 and 58e9d36d6 are review records. The round adds no new migration state or branch. It narrows the 'unknown' state r2 added: a non-regular file moved from unknown back to absent, so the keep-and-warn branch now serves only stat errors. That edge has now changed in every round: treated as absent at r1, kept as unknown at r2 with a test pinning it, and absent again at r3 with that test replaced. No human ruling or spec revision records any of the three, so this one rule is oscillating, although the patching does not spread. The upload change is a reorder, not an addition: the ghost delete moved after the generator and into the existing try, and one new local, reused_row, replaced the `existing is None` predicate, because `existing` is now reassigned inside the try. That predicate change is a consequence of the reorder rather than a new behaviour. The tests are additive and include a correction to a test written in the same round (819742a01), which fixed a copy case that never reached the ghost, and the blanket except that hid it remains. No earlier prediction is repeated. Overall this round removes more behaviour than it adds, and I do not read the design as being patched, but the stat-error state is still unspecified after three runs.
- claude-read: Production code changed in one commit this round, 72877969e; 0154854d8 and 819742a01 are tests and 58e9d36d6 is a record. That commit adds no migration state or branch, and it shrinks one: the non-file case leaves 'unknown' for 'absent'. This is a reversal, not an addition. The same input was absent at r1's head, unknown at r2's head and absent again now, and the test pinned at r2 was rewritten to the opposite outcome. So the case was decided twice without a recorded ruling, while 'unknown' itself survives for stat errors and is still not in the spec. In upload.py the round moves the ghost delete back behind the generator and adds one local flag, `reused_row`, because `existing` is cleared partway through. That is a small cost of reordering, not a new state, and no earlier round added one like it. The r2 fix round's prediction about retrying an unknown row still stands and gains no sibling. On this evidence the design is not being patched repeatedly: the migration's state count fell this round and the production diff is small. The test side does repeat a weakness: the copy case needed a follow-up commit to reach its target (819742a01). A further change to the unknown or absent boundary would be the warning sign, and it should follow a recorded ruling rather than another finding.

Earlier runs:
- r2 / claude-deep: Only one round since r1 changes production code: 3ba3a824c. The other three commits are tests (e22ce7a75) or review records (1da095a54, 134c1042a), so no earlier fix round exists for this one to repeat. That round adds one state, 'unknown', to _reach_key, plus one early-exit branch in the migration loop and the prediction that the next startup retries such a row. It answers r1's stat-error finding directly and does not rework an earlier patch, so this is not yet a design being patched. It also removes things: the migration leaves thumbnail.py, along with its SQLAlchemy and models imports and thumbnail.py's allow-list entry, and fileops._cleanup_empty_parents is gone in favour of prune_empty_dirs. The added state is not in the spec's state table and has no recorded revision. It also leaves a pointer that may never repair itself when a non-file sits at the path, so a further round around this state should be read as a warning sign.
- r2 / claude-read: There has been one round of fixes since r1, so no earlier fix round exists for this one to repeat. Commit 1da095a54 records r1 and 134c1042a records a second R-5 run; both are documents only. e22ce7a75 adds tests only, including predictions for the 'unknown' behaviour that the next commit implements. 3ba3a824c adds one state and branch to the migration: _reach_key gains an 'unknown' key beside 'inode' and 'absent', and the loop gains a keep-and-warn branch. That is a fourth per-row outcome beside moved, repointed and emptied, and the spec's state table was not revised to include it. The same commit also removes things: the migration's dependencies leave thumbnail.py, thumbnail.py drops out of the os.replace allow-list, and the duplicate fileops._cleanup_empty_parents goes. So this round adds one state and removes structure. It does not show the pattern of a design being patched repeatedly, though a further stat or non-regular special case in the migration would start that pattern.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: A stat error other than not-found keeps the pointer and counts as failed, and the thumbnail route answers 500 for that row while the error lasts (R3-SPEC-1). r1 and r2 asked a person; no ruling is recorded.; A non-regular file at a pointer counts as absent, while the spec groups by whether the file exists. This agrees with I10's outcome and leaves the directory in the cache (R3-SPEC-1).; Carried from r1 with no ruling: a scan-detected move of a row with an empty or dangling .by-id pointer generates only at the next scan, because scanner.py:657-679 has no thumbnail step. For two shared rows whose files were renamed on disk before the first start, both pointers are empty after the first scan, which narrows I1's 'after the upgrade's first scan'. I3 requires the pointer to stay, so the code follows its text.; Carried from r1 with no ruling: two rows naming one absent or non-regular path string are both emptied at thumbnail_migration.py:93-98 even if a slot exists, where I10 repoints a row with a slot. I found no ordinary path to this state.; Carried from r2 with no ruling: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). Spec section 2 defines only the new-id case.; Carried from r1 with no ruling: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, and each later start moves them again until the addon PR lands (decisions.md first run, item 5).
- claude-deep: Still undecided from r1 and r2: a stat error other than not-found keeps the pointer and counts as failed, with a 500 from the thumbnail route while it lasts (MIG-3).
- claude-deep: Still undecided from r1: a scan-detected move of a row with an empty or dangling .by-id pointer does not generate until the next scan, because scanner.py:657-706 has no thumbnail step. This narrows I1's and section 9's 'after the first scan' for a shared row renamed on disk before that scan.
- claude-deep: Still undecided from r1, and slightly wider since this round: two rows in one ('absent', rel) group are both emptied at thumbnail_migration.py:93-98 even if a slot exists, whereas I10 repoints a row with a slot. A directory named by two rows now reaches this branch too. I found no ordinary way to reach it.
- claude-deep: Still undecided from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move during the delivery window (decisions.md run 1 item 5). The spec's Delivery entry says only that such a write migrates at the next startup.
- claude-deep: Still undecided from r2: a commit failure on upload over a reused row leaves the row's slot holding the new file's picture while the row rolls back. Section 2 defines only the new-id case. The landed file stays on disk, so for a .by-id row the picture matches the file.
- claude-deep: A non-regular file at a pointer stays in the cache after its row is emptied, as decisions.md run 3 item 2 observed. Section 1 prunes empty directories only 'as each file leaves' and does not address this. It costs only an empty directory.
- claude-read: A stat error other than not-found keeps the pointer and counts as failed, and the thumbnail route answers 500 for that row while the error lasts (R3-SPEC-1). r1 and r2 asked a person; no ruling is recorded.
- claude-read: A non-regular file at a pointer counts as absent, while the spec groups by whether the file exists. This agrees with I10's outcome and leaves the directory in the cache (R3-SPEC-1).
- claude-read: Carried from r1 with no ruling: a scan-detected move of a row with an empty or dangling .by-id pointer generates only at the next scan, because scanner.py:657-679 has no thumbnail step. For two shared rows whose files were renamed on disk before the first start, both pointers are empty after the first scan, which narrows I1's 'after the upgrade's first scan'. I3 requires the pointer to stay, so the code follows its text.
- claude-read: Carried from r1 with no ruling: two rows naming one absent or non-regular path string are both emptied at thumbnail_migration.py:93-98 even if a slot exists, where I10 repoints a row with a slot. I found no ordinary path to this state.
- claude-read: Carried from r2 with no ruling: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). Spec section 2 defines only the new-id case.
- claude-read: Carried from r1 with no ruling: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, and each later start moves them again until the addon PR lands (decisions.md first run, item 5).
- claude-verify: A stat error other than not-found keeps the pointer and counts as failed (thumbnail_migration.py:31-32, :83-92), and the thumbnail route then answers 500 while the error lasts. No spec section or revision states this, and no ruling is recorded.
- claude-verify: A non-regular file at a pointer counts as absent (thumbnail_migration.py:33-34), and the directory stays in the cache. The spec groups by whether the file exists and does not address this.
- claude-verify: A stat error on the source's picture fails the whole copy at fileops.py:255. I12 covers a failure copying the picture, and whether it covers this case is for a human to read.
- claude-verify: slot.is_file() at thumbnail_migration.py:125 sits outside any OSError handler. If Path.is_file re-raises a permission error, an absent-file row stops the run rather than failing that row alone. The lifespan catches it at main.py:278, and the next startup retries. This was inferred from reading and was not run.

### unspecified_behavior

Note: A stat error other than not-found keeps the pointer and counts as failed (thumbnail_migration.py:31-32, :83-92), and the thumbnail route then answers 500 while the error lasts. No spec section or revision states this, and no ruling is recorded.; A non-regular file at a pointer counts as absent (thumbnail_migration.py:33-34), and the directory stays in the cache. The spec groups by whether the file exists and does not address this.; A stat error on the source's picture fails the whole copy at fileops.py:255. I12 covers a failure copying the picture, and whether it covers this case is for a human to read.; slot.is_file() at thumbnail_migration.py:125 sits outside any OSError handler. If Path.is_file re-raises a permission error, an absent-file row stops the run rather than failing that row alone. The lifespan catches it at main.py:278, and the next startup retries. This was inferred from reading and was not run.
- claude-deep: Still undecided from r1 and r2: a stat error other than not-found keeps the pointer and counts as failed, with a 500 from the thumbnail route while it lasts (MIG-3).
- claude-deep: Still undecided from r1: a scan-detected move of a row with an empty or dangling .by-id pointer does not generate until the next scan, because scanner.py:657-706 has no thumbnail step. This narrows I1's and section 9's 'after the first scan' for a shared row renamed on disk before that scan.
- claude-deep: Still undecided from r1, and slightly wider since this round: two rows in one ('absent', rel) group are both emptied at thumbnail_migration.py:93-98 even if a slot exists, whereas I10 repoints a row with a slot. A directory named by two rows now reaches this branch too. I found no ordinary way to reach it.
- claude-deep: Still undecided from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move during the delivery window (decisions.md run 1 item 5). The spec's Delivery entry says only that such a write migrates at the next startup.
- claude-deep: Still undecided from r2: a commit failure on upload over a reused row leaves the row's slot holding the new file's picture while the row rolls back. Section 2 defines only the new-id case. The landed file stays on disk, so for a .by-id row the picture matches the file.
- claude-deep: A non-regular file at a pointer stays in the cache after its row is emptied, as decisions.md run 3 item 2 observed. Section 1 prunes empty directories only 'as each file leaves' and does not address this. It costs only an empty directory.
- claude-read: A stat error other than not-found keeps the pointer and counts as failed, and the thumbnail route answers 500 for that row while the error lasts (R3-SPEC-1). r1 and r2 asked a person; no ruling is recorded.
- claude-read: A non-regular file at a pointer counts as absent, while the spec groups by whether the file exists. This agrees with I10's outcome and leaves the directory in the cache (R3-SPEC-1).
- claude-read: Carried from r1 with no ruling: a scan-detected move of a row with an empty or dangling .by-id pointer generates only at the next scan, because scanner.py:657-679 has no thumbnail step. For two shared rows whose files were renamed on disk before the first start, both pointers are empty after the first scan, which narrows I1's 'after the upgrade's first scan'. I3 requires the pointer to stay, so the code follows its text.
- claude-read: Carried from r1 with no ruling: two rows naming one absent or non-regular path string are both emptied at thumbnail_migration.py:93-98 even if a slot exists, where I10 repoints a row with a slot. I found no ordinary path to this state.
- claude-read: Carried from r2 with no ruling: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). Spec section 2 defines only the new-id case.
- claude-read: Carried from r1 with no ruling: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, and each later start moves them again until the addon PR lands (decisions.md first run, item 5).
- claude-verify: A stat error other than not-found keeps the pointer and counts as failed (thumbnail_migration.py:31-32, :83-92), and the thumbnail route then answers 500 while the error lasts. No spec section or revision states this, and no ruling is recorded.
- claude-verify: A non-regular file at a pointer counts as absent (thumbnail_migration.py:33-34), and the directory stays in the cache. The spec groups by whether the file exists and does not address this.
- claude-verify: A stat error on the source's picture fails the whole copy at fileops.py:255. I12 covers a failure copying the picture, and whether it covers this case is for a human to read.
- claude-verify: slot.is_file() at thumbnail_migration.py:125 sits outside any OSError handler. If Path.is_file re-raises a permission error, an absent-file row stops the run rather than failing that row alone. The lifespan catches it at main.py:278, and the next startup retries. This was inferred from reading and was not run.

### unspecified_behavior

Note: Still undecided from r1 and r2: a stat error other than not-found keeps the pointer and counts as failed, with a 500 from the thumbnail route while it lasts (MIG-3).; Still undecided from r1: a scan-detected move of a row with an empty or dangling .by-id pointer does not generate until the next scan, because scanner.py:657-706 has no thumbnail step. This narrows I1's and section 9's 'after the first scan' for a shared row renamed on disk before that scan.; Still undecided from r1, and slightly wider since this round: two rows in one ('absent', rel) group are both emptied at thumbnail_migration.py:93-98 even if a slot exists, whereas I10 repoints a row with a slot. A directory named by two rows now reaches this branch too. I found no ordinary way to reach it.; Still undecided from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move during the delivery window (decisions.md run 1 item 5). The spec's Delivery entry says only that such a write migrates at the next startup.; Still undecided from r2: a commit failure on upload over a reused row leaves the row's slot holding the new file's picture while the row rolls back. Section 2 defines only the new-id case. The landed file stays on disk, so for a .by-id row the picture matches the file.; A non-regular file at a pointer stays in the cache after its row is emptied, as decisions.md run 3 item 2 observed. Section 1 prunes empty directories only 'as each file leaves' and does not address this. It costs only an empty directory.
- claude-deep: Still undecided from r1 and r2: a stat error other than not-found keeps the pointer and counts as failed, with a 500 from the thumbnail route while it lasts (MIG-3).
- claude-deep: Still undecided from r1: a scan-detected move of a row with an empty or dangling .by-id pointer does not generate until the next scan, because scanner.py:657-706 has no thumbnail step. This narrows I1's and section 9's 'after the first scan' for a shared row renamed on disk before that scan.
- claude-deep: Still undecided from r1, and slightly wider since this round: two rows in one ('absent', rel) group are both emptied at thumbnail_migration.py:93-98 even if a slot exists, whereas I10 repoints a row with a slot. A directory named by two rows now reaches this branch too. I found no ordinary way to reach it.
- claude-deep: Still undecided from r1: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, so each startup repeats the move during the delivery window (decisions.md run 1 item 5). The spec's Delivery entry says only that such a write migrates at the next startup.
- claude-deep: Still undecided from r2: a commit failure on upload over a reused row leaves the row's slot holding the new file's picture while the row rolls back. Section 2 defines only the new-id case. The landed file stays on disk, so for a .by-id row the picture matches the file.
- claude-deep: A non-regular file at a pointer stays in the cache after its row is emptied, as decisions.md run 3 item 2 observed. Section 1 prunes empty directories only 'as each file leaves' and does not address this. It costs only an empty directory.
- claude-read: A stat error other than not-found keeps the pointer and counts as failed, and the thumbnail route answers 500 for that row while the error lasts (R3-SPEC-1). r1 and r2 asked a person; no ruling is recorded.
- claude-read: A non-regular file at a pointer counts as absent, while the spec groups by whether the file exists. This agrees with I10's outcome and leaves the directory in the cache (R3-SPEC-1).
- claude-read: Carried from r1 with no ruling: a scan-detected move of a row with an empty or dangling .by-id pointer generates only at the next scan, because scanner.py:657-679 has no thumbnail step. For two shared rows whose files were renamed on disk before the first start, both pointers are empty after the first scan, which narrows I1's 'after the upgrade's first scan'. I3 requires the pointer to stay, so the code follows its text.
- claude-read: Carried from r1 with no ruling: two rows naming one absent or non-regular path string are both emptied at thumbnail_migration.py:93-98 even if a slot exists, where I10 repoints a row with a slot. I found no ordinary path to this state.
- claude-read: Carried from r2 with no ruling: an upload over a reused row whose commit fails leaves the slot holding the new file's picture while the row rolls back (upload.py:280-283, :363). Spec section 2 defines only the new-id case.
- claude-read: Carried from r1 with no ruling: with the old addon pin, Media Import's caption retry rewrites .loft rows to path form with a new mtime and ETag, and each later start moves them again until the addon PR lands (decisions.md first run, item 5).
- claude-verify: A stat error other than not-found keeps the pointer and counts as failed (thumbnail_migration.py:31-32, :83-92), and the thumbnail route then answers 500 while the error lasts. No spec section or revision states this, and no ruling is recorded.
- claude-verify: A non-regular file at a pointer counts as absent (thumbnail_migration.py:33-34), and the directory stays in the cache. The spec groups by whether the file exists and does not address this.
- claude-verify: A stat error on the source's picture fails the whole copy at fileops.py:255. I12 covers a failure copying the picture, and whether it covers this case is for a human to read.
- claude-verify: slot.is_file() at thumbnail_migration.py:125 sits outside any OSError handler. If Path.is_file re-raises a permission error, an absent-file row stops the run rather than failing that row alone. The lifespan catches it at main.py:278, and the next startup retries. This was inferred from reading and was not run.

## Findings

A: 0
B: 8
C: 0

### claude-deep:COPY-1 — bucket B, LOW, open

Claim: `copy_file` evaluates `old_thumb.exists()` before the copy starts, so a stat error on the source's picture fails the whole copy, although I12 says a failure over the picture leaves the copy in place.
Impact: With the source's cache directory unsearchable, the copy answers 500 and no file is created. Spec section 2 says a picture failure must not cost the copy. The state needs a permission fault on the cache. Migration's 'unknown' state leaves rows pointing into exactly such a directory.
Evidence: backend/app/services/fileops.py:255 is outside any try and runs before the exclusive create at :267. On Python 3.12 (backend/Dockerfile:1) Path.exists re-raises any error other than ENOENT, ENOTDIR, EBADF or ELOOP. The route's 500 in decisions.md run 2 item 2 comes from the same call. The try at fileops.py:337-341 covers only the later write. test_a_picture_that_cannot_be_copied_leaves_copy_and_no_partial_slot uses a directory at the pointer, for which exists() succeeds, so this path is not tested. The same `exists()` call was in the expression this diff simplified.
Repro: not_reproduced. By reading: chmod a-x the directory holding a source's thumbnail, then POST /api/files/{id}/copy. A PermissionError is predicted at fileops.py:255, with no file and no row created.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide fills_thumbnail_slot inside the post-commit try, so that any OSError there leaves the copy with no pointer.

</details>

### claude-deep:MIG-3 — bucket B, LOW, open

Claim: The 'unknown' migration state for a stat error other than not-found is still absent from the spec and from any revision, and it keeps the row on a pointer the thumbnail endpoint answers with 500 rather than the placeholder.
Impact: While a cache directory stays unsearchable after the upgrade, those cards are blank and the route answers 500. Once the mode is restored, the next start moves them. The state needs a permission fault on the cache, so it is not ordinary use. Keeping the pointer is the safer behaviour, but r1 and r2 both sent this question to a person and no ruling is recorded.
Evidence: backend/app/services/thumbnail_migration.py:31-32 and :83-92 keep the pointer. Spec section 1 groups only by 'the file exists' or 'it does not', and section 3 has no such state. docs/process/reviews/feature-thumbnail-slot-ownership/invariants.md still has an empty Revisions section. routers/files.py:1195 calls Path.exists, which on the Dockerfile's Python 3.12 re-raises PermissionError. decisions.md's second and third runs record the 500. docs/admin-guide/monitoring.md:87 names only `Could not move thumbnail`, not the `Could not examine thumbnail` warning this state logs.
Repro: Recorded in decisions.md run 3 item 2 (not rerun by me): chmod a-x on a cache subdirectory before start gives 'failed 1', the pointer is kept, and the route answers 500 until the mode is restored.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record a revision stating that a stat error keeps the pointer and counts as failed.

</details>

### claude-deep:TEST-6 — bucket B, LOW, open

Claim: The new I13 failure test and the new-id upload failure test wrap the operation in `try/except Exception: pass` and never assert that the operation failed or reached the ghost's path, so they can pass without exercising the failure path.
Impact: These tests cover the upload and rename failure paths that r2 asked for. A later setup error or route change makes them pass without testing anything, because `except Exception` also swallows the AssertionError raised inside `_upload_png`. A premature picture removal could then ship with green tests. The current code is correct, and the tests do reach the failure today by my reading.
Evidence: backend/tests/test_thumbnail_slots.py test_an_operation_that_fails_before_its_commit_leaves_the_ghost_and_its_picture and test_upload_with_a_new_id_whose_commit_fails_leaves_no_slot: `except Exception: pass`, then assertions only on the ghost row and picture, or on `_slot_files() == []`. `_upload_png` asserts status codes inside the guarded block. No response status is read for the rename or copy case. Commit 819742a01 shows this has already happened: in 0154854d8 the copy case seeded its source at dest/b.png, so the copy took a name other than the ghost's and never reached the ghost's path, and the test could not report that. The new-id test also never shows a slot existed before the failure, so it would pass if generation had failed.
Repro: not_reproduced (read-only reviewer). Predicted test mutation: in the upload case change `folder="dest"` to `folder=""` so the upload never touches the ghost; the test still passes. Predicted test mutation: seed the mover at a missing path so rename answers 404; the test still passes.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Build a TestClient with raise_server_exceptions=False, assert the failing response status for each operation, and assert in the generator or with a spy that the new slot was written before the failure.

</details>

### claude-deep:TEST-7 — bucket B, LOW, open

Claim: No test pins the r2 CONC-1 fix, so moving the trashed ghost's delete back ahead of the generator leaves every test green.
Impact: The write lock would again be held while ffmpeg runs on an upload over a trashed ghost, and nothing automated would notice. Other writers can then wait or fail with 'database is locked'. The manual run in decisions.md observed this behaviour once, at 819742a01. Only that run covers it, and it does not repeat.
Evidence: backend/app/services/upload.py:280-296 generates before `db.delete(existing)` and `db.flush()`. test_upload_over_a_trashed_ghost_removes_the_ghosts_picture and the upload case of test_an_operation_that_fails_before_its_commit assert only the outcome, and that outcome is the same in either order. The only record of the ordering is the comment at upload.py:290-291.
Repro: not_reproduced (read-only reviewer). Predicted mutation: move the ghost branch at upload.py:287-296 above the generator block at upload.py:274-283, keeping `superseded_picture` set; all tests are predicted to stay green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test whose stubbed generator opens a second session and asserts that a BEGIN IMMEDIATE succeeds, or that the ghost row is still visible and no write transaction is open.

</details>

### claude-read:R3-SPEC-1 — bucket B, LOW, open

Claim: Two migration outcomes the code now has are in neither the approved spec nor a recorded revision: a stat error other than not-found keeps the pointer as failed, and a non-regular file at the pointer counts as absent although the spec groups by whether 'the file exists'.
Impact: While a cache directory stays unsearchable, a kept row answers 500 at GET /api/files/{id}/thumbnail with a blank card, whereas an emptied one would serve the placeholder; the row recovers at the next start once the mode is restored. The admin guide names 'Could not move thumbnail' but not this 'Could not examine thumbnail' warning. This needs a faulty cache permission at the upgrade, and the non-regular case needs a directory at a pointer, so it is outside ordinary use.
Evidence: backend/app/services/thumbnail_migration.py:31-34 and :83-92. docs/specs/thumbnail-slot-ownership.md section 1 groups by '(st_dev, st_ino) when the file exists ... and the string when it does not', and section 3 has no kept-after-stat-error transition. docs/process/reviews/feature-thumbnail-slot-ownership/invariants.md has an empty Revisions section. r1 and r2 both sent this to a human, and decisions.md records observations (third run, item 2) with no ruling. docs/admin-guide/monitoring.md:87 mentions only the move warning. routers/files.py:1195 calls exists(), which is where decisions.md records the PermissionError.
Repro: Recorded, not run by me: decisions.md third run, item 2, gives 'moved 11, emptied 7, failed 1', the warning text, and a 500 PermissionError at the thumbnail route until the mode was restored.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record both outcomes in invariants.md as a revision, and add the 'Could not examine thumbnail' warning to the monitoring guide's list.

</details>

### claude-read:R3-TEST-1 — bucket B, LOW, open

Claim: The new counts test pins only one kind of failed row and one kind of moved row, so three count updates and the os.replace warning can change with every test green.
Impact: The admin guide tells the operator to read 'moved N, emptied N, failed N'. If a row whose os.replace failed stopped being counted, the log would say 'failed 0' while that row stayed unmigrated, so a check passes silently. Picture data is unaffected.
Evidence: backend/app/services/thumbnail_migration.py:119 (os.replace failure), :106 (shared file that cannot be removed; spec section 2 says 'counted as failed') and :127 (absent file repointed at its slot) update counts. The only assertion on the return value is test_the_returned_counts_say_what_happened at backend/tests/test_thumbnail_slots.py:1179. Its failed row is a stat failure, and it has no repointed row. A search of the file finds no other `_migrate(` assertion and no 'Could not move thumbnail'. test_failed_replace_keeps_pointer_and_next_startup_moves_it asserts pointers and bytes only, and test_shared_file_that_cannot_be_removed_warns_and_pointers_stay_empty checks only the warning.
Repro: not_reproduced (read-only tools). Predicted mutations, each predicted to survive: delete thumbnail_migration.py:119; delete :106; delete :127; delete the warning at :116-118.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a failed os.replace, a repointed row and an unremovable shared file to the existing counts test, and assert the failure warning names the row.

</details>

### claude-read:R3-TEST-2 — bucket B, LOW, open

Claim: The new upload and ghost failure tests swallow every exception and never assert that the operation failed at the intended point, so a failure in their setup passes as success.
Impact: If the upload helper starts failing at init or chunk for an unrelated reason, or an operation answers an early 404 or 409, the ghost and its picture are untouched and test_an_operation_that_fails_before_its_commit_leaves_the_ghost_and_its_picture stays green without exercising I13's failure half. test_upload_with_a_new_id_whose_commit_fails_leaves_no_slot goes vacuous the same way. Today both reach their failure, so no user-visible behaviour is affected.
Evidence: backend/tests/test_thumbnail_slots.py, in both tests: `try: ... except Exception: pass`. `_upload_png` signals its own setup failures through `assert`, and AssertionError is an Exception, so it is swallowed. The rename and copy branches discard the response. The commit 819742a01 shows this weakness had already bitten: as first written, the copy case in 0154854d8 seeded its source in dest/, so it could not reach the ghost's path, and the test's assertions could still be satisfied.
Repro: not_reproduced (read-only tools). Predicted mutation: change the upload case's folder argument so init answers an error, or make init_upload reject the target. The test is predicted to stay green with complete_upload never called.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Assert the failure explicitly: a 500 for rename and copy where the handler answers, pytest.raises or a non-200 at the complete step for upload, with init and chunk outside the guard.

</details>

### claude-deep:SCOPE-2 — bucket B, INFO, open

Claim: The touch-point departures raised in r1 and r2 are still unrecorded after a third run: the list still places the migration in thumbnail.py and has no revision for the new module, its allow-list entry, architecture.md or the two rewritten test assertions.
Impact: No user effect. A reader of the approved list looks for the migration in the wrong module, and the spec's rule that other tests change a path-form value only stays contradicted by test_transparent_thumbnails.py and test_copy.py with no recorded decision.
Evidence: docs/process/reviews/feature-thumbnail-slot-ownership/invariants.md has only a heading under Revisions. docs/specs/thumbnail-slot-ownership.md Touch points: 'backend/app/services/thumbnail.py: thumbnail_slot_rel, the migration step'. backend/app/main.py:27 imports from thumbnail_migration. The test_atomic_write.py allow-list names the new module. test_transparent_thumbnails.py hand-sets a shared pointer, and test_copy.py reverses an assertion.
Repro: Compare the diff's file list with the Touch points section and read invariants.md.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add one touch-point revision to invariants.md that names these items.

</details>

## Not verified

- claude-deep: I ran nothing: no tests, mutations or application. Every mutation outcome here is predicted from reading the code.
- claude-deep: Git objects were not read. I took the working tree to be commit 58e9d36d6 from the status snapshot and r3/fixes.txt.
- claude-deep: The evidence directory cited in decisions.md is outside this worktree. Its observations are quoted as a record and not checked.
- claude-deep: Path.exists on Python 3.12 re-raising PermissionError comes from my knowledge of the standard library and the 500 recorded in decisions.md. I did not read the interpreter's source.
- claude-deep: The scan-and-upload IntegrityError window in regression_risks was not exercised, and I did not read how scan_all_drives schedules its thread.
- claude-deep: The Media Import half of I15 and SPEC-ADDON-040, which are not at this commit.
- claude-deep: Inode stability on case-folding, FUSE or network cache mounts, and migration timing against the healthcheck window on a large library.
- claude-deep: Frontend code and the Intelligence reconcile beyond search hits on thumbnail paths.
- claude-read: I ran nothing: no tests, mutations or application. Every mutation outcome here is predicted from reading the code.
- claude-read: Git objects were not read. I took the worktree as commit 58e9d36d6 from the status snapshot and compared it with the supplied diff.
- claude-read: The evidence directory cited in decisions.md is outside this worktree. I quote its recorded observations and did not check them.
- claude-read: Media Import's change and its tests, which are not at this commit, so the first half of I15 and SPEC-ADDON-040 are unchecked.
- claude-read: Every test body outside test_thumbnail_slots.py was not read; coverage statements about other files rest on earlier records and pattern searches.
- claude-read: Inode stability on case-folding, FUSE or network cache mounts, and migration timing against the healthcheck window on a large library.
- claude-read: The Intelligence reconcile and frontend use of thumbnail values were not re-read in this round; I relied on the r1 and r2 notes and on search hits.
- claude-verify: Nothing was run: no tests, mutations or application. Every mutation outcome and failure point comes from reading the code.
- claude-verify: Git objects were not read. The worktree was taken as commit 58e9d36d6 from the status snapshot, so the base code, the seed in 0154854d8 and the claim that the exists() call predates this diff were not checked directly.
- claude-verify: Python 3.12's Path.exists and Path.is_file source was not read. Their re-raise behaviour rests on my recollection and on the runs recorded in decisions.md.
- claude-verify: The evidence directory cited in decisions.md is outside this worktree, so its records were taken as written.
- claude-verify: Searches for ordering tests covered the thumbnail_slots, upload, fileops and copy test files only. Other test files were not read for this.
- claude-verify: Media Import's writer and its tests, which belong to the later addon PR, were not reviewed.

TOTAL: 8 findings
