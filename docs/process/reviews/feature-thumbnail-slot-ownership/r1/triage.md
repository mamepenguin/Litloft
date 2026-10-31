# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks
- R-5 ran at 4e5ff9968cdedf6d554c67e5e906626c7bfccce2, and these files changed since: docs/addons/intelligence.md, docs/reference/configuration.md; run R-5 again if any of them changes what a user sees

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

Note: A stat failure other than file-not-found is treated as 'file absent' and empties a sole owner's pointer; the spec only defines the absent case (F-6).; A scan-detected move of a row with an empty or dangling pointer defers generation to the next scan; I3 and I16 do not say which one wins (F-5).; With the old addon pin, the media_import startup caption retry writes .loft rows back to path form with a new mtime and ETag, so each later startup migrates them again. decisions.md records this; the spec's delivery note covers only 'migrates at the next startup', and does not mention the repeat or the ETag change.
- claude-deep: A stat error other than not-found counts as an absent file during migration (MIG-1).
- claude-deep: Two rows naming one absent path string form a shared group and are both emptied, even if each has a slot file, whereas I10's wording repoints a row with an existing slot. I found no ordinary way to reach this: a shared group commits its emptied pointers before unlinking, so a stopped run cannot produce it. An existing slot would be stranded, and a .loft would lose its picture.
- claude-deep: A scan-detected move of a row with an empty or dangling .by-id pointer no longer generates in that scan, because _relocate_thumbnail is gone. The placeholder stays until the next scan. This agrees with I3 and I16, but the spec does not state the one-scan delay.
- claude-read: A stat failure other than file-not-found is treated as 'file absent' and empties a sole owner's pointer; the spec only defines the absent case (F-6).
- claude-read: A scan-detected move of a row with an empty or dangling pointer defers generation to the next scan; I3 and I16 do not say which one wins (F-5).
- claude-read: With the old addon pin, the media_import startup caption retry writes .loft rows back to path form with a new mtime and ETag, so each later startup migrates them again. decisions.md records this; the spec's delivery note covers only 'migrates at the next startup', and does not mention the repeat or the ETag change.
- claude-verify: A stat failure other than not-found during migration is treated as an absent file (thumbnail.py:707-710), and the spec does not define this case.
- claude-verify: A non-regular file at a pointer's path is also treated as absent (thumbnail.py:711-712), and the spec does not state this.

### unspecified_behavior

Note: A stat failure other than not-found during migration is treated as an absent file (thumbnail.py:707-710), and the spec does not define this case.; A non-regular file at a pointer's path is also treated as absent (thumbnail.py:711-712), and the spec does not state this.
- claude-deep: A stat error other than not-found counts as an absent file during migration (MIG-1).
- claude-deep: Two rows naming one absent path string form a shared group and are both emptied, even if each has a slot file, whereas I10's wording repoints a row with an existing slot. I found no ordinary way to reach this: a shared group commits its emptied pointers before unlinking, so a stopped run cannot produce it. An existing slot would be stranded, and a .loft would lose its picture.
- claude-deep: A scan-detected move of a row with an empty or dangling .by-id pointer no longer generates in that scan, because _relocate_thumbnail is gone. The placeholder stays until the next scan. This agrees with I3 and I16, but the spec does not state the one-scan delay.
- claude-read: A stat failure other than file-not-found is treated as 'file absent' and empties a sole owner's pointer; the spec only defines the absent case (F-6).
- claude-read: A scan-detected move of a row with an empty or dangling pointer defers generation to the next scan; I3 and I16 do not say which one wins (F-5).
- claude-read: With the old addon pin, the media_import startup caption retry writes .loft rows back to path form with a new mtime and ETag, so each later startup migrates them again. decisions.md records this; the spec's delivery note covers only 'migrates at the next startup', and does not mention the repeat or the ETag change.
- claude-verify: A stat failure other than not-found during migration is treated as an absent file (thumbnail.py:707-710), and the spec does not define this case.
- claude-verify: A non-regular file at a pointer's path is also treated as absent (thumbnail.py:711-712), and the spec does not state this.

### unspecified_behavior

Note: A stat error other than not-found counts as an absent file during migration (MIG-1).; Two rows naming one absent path string form a shared group and are both emptied, even if each has a slot file, whereas I10's wording repoints a row with an existing slot. I found no ordinary way to reach this: a shared group commits its emptied pointers before unlinking, so a stopped run cannot produce it. An existing slot would be stranded, and a .loft would lose its picture.; A scan-detected move of a row with an empty or dangling .by-id pointer no longer generates in that scan, because _relocate_thumbnail is gone. The placeholder stays until the next scan. This agrees with I3 and I16, but the spec does not state the one-scan delay.
- claude-deep: A stat error other than not-found counts as an absent file during migration (MIG-1).
- claude-deep: Two rows naming one absent path string form a shared group and are both emptied, even if each has a slot file, whereas I10's wording repoints a row with an existing slot. I found no ordinary way to reach this: a shared group commits its emptied pointers before unlinking, so a stopped run cannot produce it. An existing slot would be stranded, and a .loft would lose its picture.
- claude-deep: A scan-detected move of a row with an empty or dangling .by-id pointer no longer generates in that scan, because _relocate_thumbnail is gone. The placeholder stays until the next scan. This agrees with I3 and I16, but the spec does not state the one-scan delay.
- claude-read: A stat failure other than file-not-found is treated as 'file absent' and empties a sole owner's pointer; the spec only defines the absent case (F-6).
- claude-read: A scan-detected move of a row with an empty or dangling pointer defers generation to the next scan; I3 and I16 do not say which one wins (F-5).
- claude-read: With the old addon pin, the media_import startup caption retry writes .loft rows back to path form with a new mtime and ETag, so each later startup migrates them again. decisions.md records this; the spec's delivery note covers only 'migrates at the next startup', and does not mention the repeat or the ETag change.
- claude-verify: A stat failure other than not-found during migration is treated as an absent file (thumbnail.py:707-710), and the spec does not define this case.
- claude-verify: A non-regular file at a pointer's path is also treated as absent (thumbnail.py:711-712), and the spec does not state this.

## Findings

A: 0
B: 13
C: 0

### claude-deep:TEST-1 — bucket B, MEDIUM, open

Claim: No test covers removal of a trashed ghost's picture by rename_file or copy_file, although I13 names both.
Impact: Deleting either removal call would leave every test green, and each such operation would then strand the ghost's picture permanently, because the row is gone and nothing lists .by-id. It costs disk and passes silently.
Evidence: backend/app/services/fileops.py:336 (copy) and :412 (rename) make the calls. test_thumbnail_slots.py covers only a move and an upload over a trashed ghost. A search of backend/tests/test_copy.py for `deleted_at =` and `state="trash"` finds nothing, and no other test file reached by my search seeds a trashed ghost with a picture for these two operations. test_purge_orphan_tags.py:148 calls resolve_db_path_conflict directly on a ghost and expects None.
Repro: not_reproduced (I cannot run tests). Predicted mutation: delete fileops.py:336 or fileops.py:412; all tests still pass.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Parametrise test_trashed_ghost_picture_is_removed_when_a_move_takes_its_path over rename and copy.

</details>

### claude-deep:TEST-2 — bucket B, MEDIUM, open

Claim: No test covers the failed-commit half of I17, the slot cleanup after register_single_file returns in Markdown image import.
Impact: Removing the cleanup would leave every test green, and a commit failure during import would strand a slot under an id no row holds. It costs disk only, but this branch is the one the change replaced, and the old unlink is gone.
Evidence: backend/app/services/markdown_image_import.py:424-425 is the branch. test_markdown_image_import.py:650-674 replaces register_single_file with a function that raises, so asset_id stays None and the branch is not entered. That test also does not check the thumbnail directory. test_thumbnail_slots.py's I17 test calls register_single_file directly and never reaches the importer.
Repro: not_reproduced (I cannot run tests). Predicted mutation: delete markdown_image_import.py:424-425; all tests still pass.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add an importer test where register_single_file succeeds on a real image and the session's commit raises, then assert that neither the asset nor the slot remains.

</details>

### claude-deep:MIG-1 — bucket B, LOW, open

Claim: The migration treats any stat failure as 'file absent', so a stat error other than not-found empties the pointer of a row whose picture still exists.
Impact: A permission or I/O error on the cache at the first startup empties those pointers silently, and the run counts them as `emptied`, not `failed`. The old files stay at paths no row names, and the next run has nothing to retry. A `.loft` then needs Refresh metadata and loses its picture for good if the remote one has gone. It needs a faulty cache mount at upgrade time, so it is not ordinary use.
Evidence: backend/app/services/thumbnail.py:707-710 returns ("absent", rel) on any OSError. thumbnail.py:793-798 then repoints or empties the row. The spec's grouping and I10 speak of a file that does not exist, while I9 keeps the pointer only when os.replace fails.
Repro: not_reproduced. By reading: make `<thumbs>/<drive>` unsearchable before startup, and stat raises PermissionError for each row under it, so a sole-owner row with no slot gets an empty pointer.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Treat only FileNotFoundError and NotADirectoryError as absent. For any other OSError, keep the pointer, log a warning and count the row as failed, as I9 does for os.replace.

</details>

### claude-deep:TP-2 — bucket B, LOW, open

Claim: The diff adds app/services/thumbnail.py to the `rename-by-os` allow-list of the detector in backend/tests/test_atomic_write.py, a test edit the touch-point list does not cover.
Impact: The exemption covers the whole file, and that file holds every thumbnail generator. A later `os.replace` that publishes a half-written thumbnail from thumbnail.py would pass test_no_write_publishes_a_file_outside_the_helper, which is the mistake the detector exists to catch. Nothing is wrong at runtime today.
Evidence: backend/tests/test_atomic_write.py:209-211 adds the entry. backend/app/services/thumbnail.py:782 is the only os.replace in that module and moves a complete file. The spec's test rules cover the listed deletions, one rewrite, and changes to path-form values only.
Repro: not_reproduced. By reading: with the entry in place, a second `os.replace(tmp, dst)` in thumbnail.py leaves `_files_by_role()` unchanged, so the assertion at test_atomic_write.py:278 still passes.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have a human accept the entry through a touch-point revision, or move the migration's os.replace into a module with no generators so the exemption does not cover them.

</details>

### claude-deep:TP-3 — bucket B, LOW, open

Claim: test_spec_core_006_a_shared_slot_is_never_written drops an assertion and now forces the shared pointer by hand, which goes beyond the touch-point rule that other tests change a path-form value only.
Impact: The test no longer shows that two rows can reach one slot through registration, only that the guard works once that state is seeded. The state is now unreachable through registration, so the guard is exercised on a fabricated row. No user effect today.
Evidence: backend/tests/test_transparent_thumbnails.py:720-721 replaces `assert png_row.thumbnail_path == jpg_row.thumbnail_path` with `jpg_row.thumbnail_path = png_row.thumbnail_path` and a commit. The spec's tests touch point says any other test 'changes that value only'.
Repro: Read the diff hunk at test_transparent_thumbnails.py:717.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the rewrite in a touch-point revision, or delete the test and the redundant check together under a later spec.

</details>

### claude-read:F-5 — bucket B, LOW, open

Claim: A row with an empty pointer that a scan detects as moved stays without a picture after that scan, because the move branch no longer generates one.
Impact: A file whose shared pointer was emptied by migration and whose file was renamed on disk while the app was down shows the placeholder after the first scan, and picks up its picture only at the following scan. The same applies to a Missing row recovered at a new path. With two such same-stem files, both pointers are empty after the first scan.
Evidence: backend/app/services/scanner.py:657-679 sets the path columns and has no thumbnail step; the removed code called _relocate_thumbnail here, which regenerated from source. The generation branch at scanner.py:500-512 runs only for rows matched at their existing path, and a moved row is not visited there in the same run.
Repro: not_reproduced. By reading: seed a row with a matching file_hash and thumbnail_path None, rename the file on disk, run _scan_and_register. Expect moved == 1 and thumbnail_path still None; a second scan should fill the slot.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide whether a moved row with an empty pointer or an absent slot should be generated in the same scan, and state the answer in a revision of I3 or I16.

</details>

### claude-read:F-6 — bucket B, LOW, open

Claim: The migration treats any stat failure as an absent file, so a sole-owner row whose picture exists but cannot be stat'ed has its pointer emptied.
Impact: If a cache subdirectory cannot be searched at first start, for example after a permission problem on a bind mount, each such row loses its pointer and the picture stays stranded at the old path. Scannable rows regenerate. A .loft row keeps the placeholder until Refresh metadata runs, and a Missing row until recovery.
Evidence: backend/app/services/thumbnail.py:704-712: _reach_key returns ('absent', rel) on every OSError, not only FileNotFoundError. The later branch in migrate_thumbnail_slots then calls _set_pointer(db, file_id, None) when slot.is_file() is false. By contrast, an os.replace OSError keeps the pointer for a retry (I9).
Repro: not_reproduced. By reading: chmod a-x the thumbnail drive directory, or mock Path.stat to raise PermissionError, and restart. Expect thumbnail_path to be None with the old file still on disk. No test in test_thumbnail_slots.py covers a stat error other than a missing file.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Treat only FileNotFoundError and NotADirectoryError as absent; for other OSError values keep the pointer, log one warning and count it as failed, as the os.replace path does.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: The diff adds app/services/thumbnail.py to the os.replace allowlist in the backend/tests/test_atomic_write.py detector, and the touch-point list does not name that test or any allowlist change.
Impact: The tree-wide check on who may publish a file with os.replace now exempts the whole of thumbnail.py. Any later os.replace added to thumbnail.py, including one that publishes generated contents, passes this detector without review.
Evidence: backend/tests/test_atomic_write.py:209-211 adds the entry to ROLES['rename-by-os']. The spec's backend/tests entry allows named deletions, one named rewrite, and tests that pin or seed a path-form value changing that value only. This test pins no thumbnail value. The detector's own comment at lines 196-199 does allow a file to be written down with its reason, and one is given.
Repro: Mutation, not run: add a second os.replace(tmp, dst) anywhere in thumbnail.py. _files_by_role works per file (test_atomic_write.py:234-245 builds a set of files per role), so the detector should stay green.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the allowlist entry in the touch-point list through a revision in invariants.md so a person sees it.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: test_spec_core_006_a_shared_slot_is_never_written had its assertion deleted and its setup rewritten, which is outside the touch-point rule that other tests change a path-form value only.
Impact: The test no longer shows two rows reaching a shared slot through real registration, because it now builds that state by assigning a pointer. Any further loosening of this kind is supposed to go to the human under the spec's stop rule, and this edit is not listed for that decision.
Evidence: backend/tests/test_transparent_thumbnails.py:719-721 replaces 'assert png_row.thumbnail_path == jpg_row.thumbnail_path' with 'jpg_row.thumbnail_path = png_row.thumbnail_path' and a commit. The file is not in the touch-point list by name. The spec's section 7 keeps the shared-row check in _is_flattened_transparent_picture, and this test still exercises that check (lines 727-732), so its guard survives.
Repro: not_reproduced; found by reading the diff against the backend/tests touch-point rule.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record this rewrite in the touch-point list through a revision in invariants.md, naming the test and why the assertion went.

</details>

### claude-deep:TP-1 — bucket B, INFO, open

Claim: The diff edits docs/developer-guide/architecture.md, which is not in the touch-point list.
Impact: No user effect. The sentence describes the code correctly (.by-id slots, Markdown projections under <drive>/.markdown/). Only the list of planned reach is incomplete.
Evidence: docs/developer-guide/architecture.md:45 gains the `.by-id/<file id>.jpg` sentence. The spec's documentation touch points name only docs/specs/INDEX.md, docs/developer-guide/known-issues.md and docs/admin-guide/monitoring.md.
Repro: Compare the diff's file list with the spec's Touch points section.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record the file in a touch-point revision. The text needs no change.

</details>

### claude-deep:TP-4 — bucket B, INFO, open

Claim: test_a_copy_onto_a_missing_record_at_the_drive_root has its assertion inverted from `is None` to the retained path, a rewrite the touch-point list does not name.
Impact: The new expectation matches the spec's statement that a retired row keeps its own picture, so no behaviour is wrong. The list of rewritten tests names only test_thumbnail_relocated_on_move, so an approver reading it would not know this expectation changed.
Evidence: backend/tests/test_copy.py:796 asserts `db.get(File, ghost_id).thumbnail_path == root_thumb_rel`; it previously asserted `is None`. The expected value changed from empty to a path, and the docstring at test_copy.py:757 was also reworded.
Repro: Read the diff hunk at test_copy.py:792.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Record it in a touch-point revision. The assertion stays.

</details>

### claude-read:TP-1 — bucket B, INFO, open

Claim: The diff edits docs/developer-guide/architecture.md, which the touch-point list does not name.
Impact: No user-visible effect. The list understates what the change reaches, so a reader relying on it would miss this document when checking the addon follow-up or a revert.
Evidence: docs/developer-guide/architecture.md:45 gains the sentence 'Each file owns .by-id/<file id>.jpg; Markdown projections live under <drive>/.markdown/'. The spec's documentation touch points are only docs/specs/INDEX.md, docs/developer-guide/known-issues.md and docs/admin-guide/monitoring.md. The sentence agrees with thumbnail_slot_rel and markdown_images.py:390-393.
Repro: not_reproduced; found by comparing the diff's file list with the touch-point list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the file to the touch-point list through a revision in invariants.md, or drop the edit.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: test_a_copy_onto_a_missing_record_at_the_drive_root had an assertion reversed rather than a path-form value changed, and it is not among the tests the touch-point list names as rewritten.
Impact: Nothing a user hits: the new assertion matches the spec's rule that a retired row keeps its picture. The record of which tests changed meaning is incomplete, because the list names test_thumbnail_relocated_on_move as the only rewrite.
Evidence: backend/tests/test_copy.py:795-796 changes 'db.get(File, ghost_id).thumbnail_path is None' to '== root_thumb_rel', and the test's docstring is rewritten. The neighbouring test around test_copy.py:424-436 also loses its explanatory comments while its assertion changes only in value.
Repro: not_reproduced; found by reading the diff against the backend/tests touch-point rule.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add this test to the 'Rewritten to the new behaviour' entry through a revision in invariants.md.

</details>

## Not verified

- claude-deep: I ran nothing: no tests, mutations or application. Every mutation outcome here is predicted from reading the code.
- claude-deep: The Media Import half of I15 and SPEC-ADDON-040, which are not at this commit.
- claude-deep: Migration timing on a Docker Desktop bind mount and the healthcheck-window claim in monitoring.md.
- claude-deep: Inode stability on real case-folding or FUSE cache mounts.
- claude-deep: Frontend behaviour beyond confirming that media_import's frontend uses thumbnail_path only as a truthy check in the two components I found.
- claude-deep: The full body of the Intelligence reconcile; I read only the path resolver and the grep results of the sync code.
- claude-deep: That no test outside the files I searched seeds a trashed ghost with a picture for rename or copy; my search covered test_copy.py and the test_{fileops,rename*,upload*,purge*,batch*}.py files.
- claude-read: No tests or mutations were run, because this reviewer has only read tools; every mutation result above is a prediction from reading.
- claude-read: Whether tests outside the files searched reach rename_file or copy_file over a trashed ghost through the API, rather than by setting deleted_at directly.
- claude-read: The Docker Desktop bind-mount per-row migration cost that the spec says is recorded in the PR.
- claude-read: The evidence directory cited in decisions.md, which is outside this worktree; its claims were not checked.
- claude-read: Frontend and mcp-server use of thumbnail values beyond confirming the mcp-server match is in a test file.
- claude-read: Addon tests test_loft_thumbnail.py and test_subscription_manager.py, which belong to the later addon PR.
- claude-read: Whether the startup scan's scan.complete actually triggers Intelligence's reconcile as the spec's section 7 states.
- claude-verify: No test or code was run: the tools allow reading only, so every confirmation comes from reading the code.
- claude-verify: The main checkout at /Users/libre/Sources/video_share served as the pre-change copy; its exact commit was not confirmed to equal origin/develop.
- claude-verify: The working tree was taken to match commit 57538c57a from the git status snapshot and r1/head.txt; the commit objects were not read.
- claude-verify: The bodies of the 31 test files that set deleted_at were not all read for TEST-1; only pattern searches and selected files were checked.
- claude-verify: The addons/media_import code, main.py lifespan ordering beyond the call site at main.py:277, and purge code were not reviewed.

TOTAL: 13 findings
