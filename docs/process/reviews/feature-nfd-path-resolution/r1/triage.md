# Triage: r1

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- artifact of claude-read has confidence 66, below 70

## Needs a human

### unspecified_behavior

Note: Handlers moved onto worker threads that are not in the touch-point list.; Refactor of start_import into prepare_import and launch_import.; The new 409 mid-batch in physical_delete.
- claude-deep: start_import is split into prepare_import and launch_import, with the preparation run in a worker thread.
- claude-deep: Handlers that previously ran on the event loop now run in worker threads, using the shared SQLAlchemy session.
- claude-deep: _checked_inside in drives.py imports the private safepath._contains_symlink, which the spec says is intended.
- claude-read: Handlers moved onto worker threads (asyncio.to_thread) with the request's Session.
- claude-read: start_import split into prepare_import and launch_import, with the router running prepare_import in a thread.
- claude-read: physical_delete now raises 409 on an ambiguous name. Bulk purge (purge_all_trash, purge_all_missing and the trash purge job in main.py) may abort partway or log, instead of skipping that file. Not verified.
- claude-verify: Handlers moved onto worker threads that are not in the touch-point list.
- claude-verify: Refactor of start_import into prepare_import and launch_import.
- claude-verify: The new 409 mid-batch in physical_delete.

### unspecified_behavior

Note: start_import is split into prepare_import and launch_import, with the preparation run in a worker thread.; Handlers that previously ran on the event loop now run in worker threads, using the shared SQLAlchemy session.; _checked_inside in drives.py imports the private safepath._contains_symlink, which the spec says is intended.
- claude-deep: start_import is split into prepare_import and launch_import, with the preparation run in a worker thread.
- claude-deep: Handlers that previously ran on the event loop now run in worker threads, using the shared SQLAlchemy session.
- claude-deep: _checked_inside in drives.py imports the private safepath._contains_symlink, which the spec says is intended.
- claude-read: Handlers moved onto worker threads (asyncio.to_thread) with the request's Session.
- claude-read: start_import split into prepare_import and launch_import, with the router running prepare_import in a thread.
- claude-read: physical_delete now raises 409 on an ambiguous name. Bulk purge (purge_all_trash, purge_all_missing and the trash purge job in main.py) may abort partway or log, instead of skipping that file. Not verified.
- claude-verify: Handlers moved onto worker threads that are not in the touch-point list.
- claude-verify: Refactor of start_import into prepare_import and launch_import.
- claude-verify: The new 409 mid-batch in physical_delete.

## Findings

A: 0
B: 9
C: 0

### claude-deep:F1 — bucket B, MEDIUM, open

Claim: The diff changes routers/admin_markdown_images.py and routers/uploads.py, and it moves many handlers onto asyncio.to_thread (drive folder handlers, batch_move, rename/move endpoints, batch_rename, empty_trash, purge_all_missing). None of these files or handlers is in the touch-point list.
Impact: The admin Markdown image-import endpoint now splits start_import into prepare_import and launch_import and runs prepare_import in a worker thread. uploads.complete_upload also runs in a thread. These are behaviour and concurrency changes beyond path resolution. In particular, a SQLAlchemy Session and the module-global _current_job_id are now touched from worker threads.
Evidence: backend/app/routers/admin_markdown_images.py:70-80 (asyncio.to_thread(prepare_import ...) then launch_import); backend/app/routers/uploads.py:84; backend/app/routers/drives.py (to_thread on create_folder, rename_folder, move_folder, delete_folder, purge_all_trash, purge_all_missing); backend/app/routers/files.py (batch_move, batch_rename, rename_file_endpoint, move_file_endpoint).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add these files to the touch-point list, or revert the thread offloading where it is not needed.

</details>

### claude-read:F1 — bucket B, MEDIUM, open

Claim: The diff moves many handlers onto worker threads (asyncio.to_thread), which is not in the touch-point list: folder create/rename/move/delete, empty_trash, purge_all_missing, batch_move, batch_rename, rename/move file endpoints, upload complete, and get_archive_entry, put_file_content and _write_md_tags.
Impact: Handlers that used to run fileops on the event loop with the request's SQLAlchemy Session now run it on another thread. A thread-bound session, or concurrent use of the same session while the handler awaits, can raise or race. The change reaches the concurrency model of routers/drives.py, routers/uploads.py and routers/files.py beyond the path-resolution edits.
Evidence: backend/app/routers/drives.py create_folder, rename_folder, move_folder, delete_folder, empty_trash and purge_all_missing_endpoint; backend/app/routers/uploads.py complete_upload; backend/app/routers/files.py batch_move, batch_rename, rename_file_endpoint and move_file_endpoint. All now pass `db` into asyncio.to_thread.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add these handlers to the touch-point list, or confirm that the Session and the sqlite engine allow cross-thread use.

</details>

### claude-read:F2 — bucket B, MEDIUM, open

Claim: routers/admin_markdown_images.py is changed and services/markdown_image_import.py's start_import is split into prepare_import and launch_import. Neither the router nor this refactor is in the touch-point list. Only the service file is listed, for path resolution.
Impact: The import job now does its validation and job registration in a thread, so the module globals _jobs and _current_job_id are mutated off the event loop. That can race with concurrent job starts or maintenance checks. The public start_import is kept, but the router no longer uses it.
Evidence: backend/app/routers/admin_markdown_images.py start_markdown_image_import; backend/app/services/markdown_image_import.py prepare_import and launch_import.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:F2 — bucket B, LOW, open

Claim: docs/ADDON-DEVELOPMENT.md is edited but is not in the touch-point list. The spec text mentions it only in the user-visible behavior section.
Impact: Documentation scope only.
Evidence: docs/ADDON-DEVELOPMENT.md:581
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:F3 — bucket B, LOW, open

Claim: physical_delete now raises HTTPException 409 for an ambiguous name partway through a batch loop. In purge_all_trash and purge_all_missing, files earlier in the loop are already unlinked from disk but their rows are not yet committed.
Impact: One ambiguous file aborts the batch. Earlier files are gone from disk while their rows stay in Trash or Missing until the user purges again. The re-purge succeeds because the unlink is skipped when the file is absent. The trash purge job in main.py has the same exposure, depending on how it handles the exception.
Evidence: backend/app/services/fileops.py:667-673, 756-760, 811-814; backend/app/main.py:96
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F3 — bucket B, LOW, open

Claim: Unlisted reach in routers/files.py: get_wiki_resolutions, get_subtitle (the subtitle path now goes through _on_disk_path), batch_move and the new _on_disk_path helper are changed. They are not named in the touch-point list. Only 'markdown resolution handlers' is listed loosely.
Impact: These handlers sit on the access-control path through _validate_path. A reviewer relying on the list would not have checked them.
Evidence: backend/app/routers/files.py _on_disk_path, get_subtitle and get_wiki_resolutions.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5 — bucket B, LOW, open

Claim: The commit contains no parity-table JSON fixture, and no addon pointer bump or addon changes. The touch-point list requires the parity table in each tree that holds a resolver.
Impact: I16 cannot be checked from this commit. The core resolver has no table-driven test, only hand-written cases.
Evidence: The diff adds backend/tests/test_diskpath*.py but no JSON fixture.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:F4 — bucket B, INFO, open

Claim: complete_upload resolves the leaf with a non-strict resolve_on_disk. If an NFD twin of the target appeared after init_upload, the upload replaces that existing file in place.
Impact: This is a rare race. The spec's step 6 allows replacement in place, so it is probably intended, but no test covers the complete step.
Evidence: backend/app/services/upload.py:247-248
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F4 — bucket B, INFO, open

Claim: Other unlisted reach: routers/drives.py gains new helpers (_checked_inside, _on_disk_new_target, _on_disk_existing_target) that import the private safepath._contains_symlink. docs/ADDON-DEVELOPMENT.md is edited (the spec text mentions it, but the touch-point list does not). backend/tests/test_listing_call_inventory.py gets a new inventory entry.
Impact: Duplicated containment logic in drives.py can drift from safepath.py's checks.
Evidence: backend/app/routers/drives.py _checked_inside; docs/ADDON-DEVELOPMENT.md; backend/tests/test_listing_call_inventory.py.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I did not run any tests. The tools are read-only.
- claude-deep: I did not read the full bodies of the fileops mutators, the main.py purge job exception handling, or the scanner change.
- claude-deep: I did not inspect the addon repositories or the parity fixture.
- claude-deep: I did not check the thread-safety of SQLAlchemy session use under the to_thread calls.
- claude-read: I did not run any test.
- claude-read: I did not read the full repository context of the changed functions, such as the purge_all_* loops, main.py's purge job error handling, or the thumbnail/heic callers.
- claude-read: I did not check Session thread-safety against the database engine configuration.
- claude-read: I did not read the addons.
- claude-read: I did not check that the inventory test's regex heuristics (DRIVE_PART) catch every site.
- claude-verify: Addon repositories and the pointer bump
- claude-verify: Whether the SQLAlchemy session is safe across to_thread
- claude-verify: Invariants I1 to I11 and I13 to I15 in detail
- claude-verify: The test_listing_call_inventory.py edit

TOTAL: 9 findings
