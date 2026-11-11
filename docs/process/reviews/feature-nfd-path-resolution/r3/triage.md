# Triage: r3

## Trajectory

This run:
- claude-deep: The two fix commits since the previous review do not patch the design. The first adds the parity JSON fixture and a table-driven test, which only adds test coverage and no new branch, state or prediction in the resolver. The second records the review in docs. No round added a branch, state or prediction that an earlier round also added, and no round removed one.
- claude-read: The two commits since r2 are a parity table plus its table-driven test, and a docs record of review round 2. The parity commit adds only a fixture and a test. It adds no branch, state or prediction to the resolver or to any handler, and it removes none. It closes the I16 core-copy gap that r2 raised, and I see no sign the design is being patched. The bulk-purge partial state from r1 and r2 is still unchanged.

Earlier runs:
- r2 / claude-deep: There are no fix commits since r1; the only commit after r1 records the review. No round added or removed a branch, state or prediction, so I see no sign the design is being patched.
- r2 / claude-read: There are no fix commits since round 1: the reviewed commit 15073bcfd is the same change, and only the review records were added. No round added a branch, state or prediction, and none removed one. I see no sign that the design is being patched.

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: Handlers moved onto asyncio.to_thread with the request Session, including routers/uploads.py and routers/admin_markdown_images.py, which the touch-point list does not name.; start_import was split into prepare_import and launch_import.; physical_delete can raise 409 mid-batch in purge_all_trash.
- claude-deep: Several handlers (folder operations, batch_move, batch_rename, rename/move, complete_upload, empty_trash, purge_all_missing) now run in worker threads with the request Session.
- claude-deep: start_import is split into prepare_import and launch_import, with prepare_import run in a worker thread.
- claude-deep: physical_delete can now raise 409 partway through a bulk purge.
- claude-read: Handlers moved onto asyncio.to_thread with the request Session, including routers/uploads.py and routers/admin_markdown_images.py, which the touch-point list does not name.
- claude-read: start_import was split into prepare_import and launch_import.
- claude-read: physical_delete can raise 409 mid-batch in purge_all_trash.

### unspecified_behavior

Note: Several handlers (folder operations, batch_move, batch_rename, rename/move, complete_upload, empty_trash, purge_all_missing) now run in worker threads with the request Session.; start_import is split into prepare_import and launch_import, with prepare_import run in a worker thread.; physical_delete can now raise 409 partway through a bulk purge.
- claude-deep: Several handlers (folder operations, batch_move, batch_rename, rename/move, complete_upload, empty_trash, purge_all_missing) now run in worker threads with the request Session.
- claude-deep: start_import is split into prepare_import and launch_import, with prepare_import run in a worker thread.
- claude-deep: physical_delete can now raise 409 partway through a bulk purge.
- claude-read: Handlers moved onto asyncio.to_thread with the request Session, including routers/uploads.py and routers/admin_markdown_images.py, which the touch-point list does not name.
- claude-read: start_import was split into prepare_import and launch_import.
- claude-read: physical_delete can raise 409 mid-batch in purge_all_trash.

## Findings

A: 0
B: 3
C: 0

### claude-deep:F1 — bucket B, LOW, open

Claim: Bulk purge (purge_all_trash, and each batch of purge_all_missing) still calls the strict physical_delete in a loop with a single commit after the loop, so a 409 on a later ambiguous file leaves earlier files unlinked on disk while their row deletions roll back.
Impact: After one ambiguous entry, Trash or Missing rows remain for files already removed from disk, until the user purges again; the second purge succeeds because the unlink is skipped for an absent file. No data beyond the already-purged files is lost.
Evidence: backend/app/services/fileops.py:756-759 (loop of physical_delete, then one db.commit) and :811-814 (per-batch commit); physical_delete at :670 raises through existing_or_409 before the unlink at :673. No fix commit since the previous review touched this.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Catch the 409 per file in the bulk loops and skip that file, or commit per row.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: physical_delete now raises 409 for an ambiguous name inside purge_all_trash, whose single commit comes after the loop, so earlier files in the loop are already unlinked when the exception rolls the session back.
Impact: After Empty Trash meets one ambiguous entry, earlier trashed files are gone from disk but their rows stay in Trash. Every later Empty Trash hits the same entry again and returns 409 until the user purges that file by hand. Repeating the purge does clear the stale rows, so no data is lost beyond the files the user already trashed.
Evidence: backend/app/services/fileops.py:670 (existing_or_409 before unlink at 673), :756-759 (loop with one db.commit after it). purge_all_missing (:811-814) commits per batch, but missing rows have no on-disk match, so they are not ambiguous in practice.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> In purge_all_trash, resolve every file with existing_or_409 before unlinking any, or catch the 409 per file and skip it.

</details>

### claude-deep:F2 — bucket B, INFO, open

Claim: The new parity table covers only the non-strict resolver: it has no case for several matching entries, the sorted-bytes tie rule, an empty or absolute component, or an unreadable directory.
Impact: Addon resolver copies could diverge from core on ambiguity or empty-component handling while still passing the table, so I16 gives less protection than its wording suggests.
Evidence: backend/tests/fixtures/diskpath_parity.json lists 8 cases (exact, nfd leaf/ancestor/both, twin, nothing, real ancestor, dot-dot) and backend/tests/test_diskpath_parity.py calls only resolve_on_disk with strict off.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add cases for the sorted-bytes tie and empty components.

</details>

## Not verified

- claude-deep: I ran no tests; the tools are read-only.
- claude-deep: I did not check SQLAlchemy Session thread-safety under asyncio.to_thread.
- claude-deep: I did not read the main.py purge job exception handling or the scanner change in full.
- claude-deep: I did not inspect the addon repositories or compare resolver copies.
- claude-deep: I did not check whether the inventory regex misses real joins.
- claude-read: I ran no tests, because the tools are read-only.
- claude-read: I did not check SQLAlchemy Session thread-safety under to_thread.
- claude-read: I did not read the addon repositories or their resolver copies.
- claude-read: I did not open the main.py trash purge job to check its commit and exception handling.
- claude-read: I did not check whether the inventory regex misses real joins.
- claude-verify: I did not run any tests.
- claude-verify: I did not check addon copies of the resolver.
- claude-verify: I did not check whether the inventory test or the other mutating-site tests cover ambiguity.
- claude-verify: I did not test the purge_all_missing ambiguity scenario.

TOTAL: 3 findings
