# Triage: r2

## Trajectory

This run:
- claude-deep: There are no fix commits since r1; the only commit after r1 records the review. No round added or removed a branch, state or prediction, so I see no sign the design is being patched.
- claude-read: There are no fix commits since round 1: the reviewed commit 15073bcfd is the same change, and only the review records were added. No round added a branch, state or prediction, and none removed one. I see no sign that the design is being patched.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-deep:F2 is bucket A or BLOCKER

## Needs a human

### unspecified_behavior

Note: Many handlers were moved onto asyncio.to_thread with the request Session, including admin_markdown_images and uploads, which the touch-point list does not name.; start_import was split into prepare_import and launch_import.; physical_delete can now raise 409 in the middle of a batch.
- claude-deep: Handlers moved onto worker threads.
- claude-deep: start_import split into prepare_import and launch_import.
- claude-deep: physical_delete raises 409 mid-batch.
- claude-read: Many handlers were moved onto asyncio.to_thread with the request Session, including admin_markdown_images and uploads, which the touch-point list does not name.
- claude-read: start_import was split into prepare_import and launch_import.
- claude-read: physical_delete can now raise 409 in the middle of a batch.

### unspecified_behavior

Note: Handlers moved onto worker threads.; start_import split into prepare_import and launch_import.; physical_delete raises 409 mid-batch.
- claude-deep: Handlers moved onto worker threads.
- claude-deep: start_import split into prepare_import and launch_import.
- claude-deep: physical_delete raises 409 mid-batch.
- claude-read: Many handlers were moved onto asyncio.to_thread with the request Session, including admin_markdown_images and uploads, which the touch-point list does not name.
- claude-read: start_import was split into prepare_import and launch_import.
- claude-read: physical_delete can now raise 409 in the middle of a batch.

## Findings

A: 1
B: 5
C: 0

### claude-deep:F2 — bucket A, LOW, open

Claim: The commit adds no parity-table JSON fixture, and the core resolver has no table-driven test.
Impact: I16 cannot be checked for the core copy; the touch-point list requires the table in each tree that holds a resolver.
Evidence: Glob for parity files finds only older unrelated parity tests; no fixture for the resolver exists.
Repro: Glob **/*parity*: no resolver fixture.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Add the JSON fixture and a test that runs the core resolver against it, or state that it ships with the addon PR.

</details>

### claude-deep:F3 — bucket B, MEDIUM, open

Claim: Many handlers were moved to asyncio.to_thread and start_import was split into prepare_import and launch_import. These routers (admin_markdown_images, uploads) and handlers are not in the touch-point list.
Impact: Scope and concurrency change beyond path resolution. The request Session and the module globals _jobs and _current_job_id are used on worker threads. The calls are sequential per request, so I found no concrete race.
Evidence: backend/app/routers/admin_markdown_images.py:70-80; backend/app/routers/uploads.py:84; backend/app/routers/drives.py to_thread calls.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List these files and handlers in the touch points.

</details>

### claude-deep:F1 — bucket B, LOW, open

Claim: Bulk purge (purge_all_trash, purge_all_missing) calls physical_delete, which now raises 409 for an ambiguous name after earlier files in the same loop were already unlinked and before the single commit.
Impact: One ambiguous entry aborts the batch. Files processed earlier are gone from disk while their rows stay in Trash or Missing until a second purge. A second purge succeeds because the unlink is skipped for an absent file. The main.py trash purge job commits per row, so it is not affected.
Evidence: backend/app/services/fileops.py physical_delete (existing_or_409 then unlink); purge_all_trash loop commits once after the loop; backend/app/main.py:96 commits per row.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Commit per row in the bulk purges, or skip and report an ambiguous file.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: physical_delete now raises HTTP 409 for an ambiguous name, so a bulk purge (purge_all_trash, purge_all_missing, the trash purge job) can abort after earlier files were already unlinked and before their rows were committed.
Impact: Rows stay in Trash or Missing for files that are already gone from disk until the user purges again. A repeat purge succeeds because the unlink is skipped for an absent file. This is a rare state and not data loss.
Evidence: backend/app/services/fileops.py physical_delete (existing_or_409 before unlink); the purge_all_* loops commit after the loop. Read from the diff only; the loop bodies were not opened.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Catch the 409 per file in the bulk loops and skip that file, or resolve every file before unlinking any.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The commit has no JSON parity-table fixture, and the core resolver is tested only by hand-written cases.
Impact: I16 cannot be checked from core, and the addon copies have nothing in core to be compared against.
Evidence: The diff adds backend/tests/test_diskpath*.py and no JSON fixture file.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-deep:F4 — bucket B, INFO, rejected

Claim: complete_upload resolves the leaf non-strictly, so a twin of the target that appeared after init_upload is replaced in place.
Impact: Rare race. It matches the in-place replacement of spec step 6. No test covers the complete step.
Evidence: backend/app/services/upload.py:247-248
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I ran no tests; the tools are read-only.
- claude-deep: I did not read the full fileops mutator bodies.
- claude-deep: I did not inspect the addons.
- claude-deep: I did not verify SQLAlchemy Session thread-safety.
- claude-read: I ran no tests, because the tools are read-only.
- claude-read: I did not open the purge_all_* loop bodies or the main.py purge job exception handling.
- claude-read: I did not check Session thread-safety under to_thread.
- claude-read: I did not read the addon repositories.
- claude-read: I did not check whether the inventory regex misses real joins.
- claude-read: I read the code mainly through the diff and did not open surrounding files.
- claude-verify: main.py trash purge job commit behaviour
- claude-verify: Addon repositories and their resolver copies
- claude-verify: Inventory test content
- claude-verify: Whether any test covers a 409 in bulk purge
- claude-verify: Runtime behaviour (read-only tools)

TOTAL: 6 findings
