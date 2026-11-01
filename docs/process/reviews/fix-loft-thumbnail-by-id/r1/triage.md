# Triage: r1

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 1

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- open_c claude-verify:V1-partial-download-truncates-live-by-id-slot
- unspecified_behavior
- unspecified_behavior

## Needs a human

### open_c (claude-verify:V1-partial-download-truncates-live-by-id-slot)

Question: A refresh whose thumbnail download fails mid-transfer overwrites the live slot in place, so a row with a `.by-id` pointer keeps its pointer but can name a truncated picture, while `_save_loft_thumbnail` reports the failure as if nothing had changed.
Impact: A connection dropped during Refresh metadata or the startup caption retry can silently leave a card with a partial picture. It needs no misuse, only a short read. No test covers it. The next successful download repairs it.
Evidence: addons/media_import/backend/service.py:545 calls `urllib.request.urlretrieve(thumbnail_url, str(dest))` directly on the slot path, with no temporary file. service.py:547-549 catches the exception and returns False. service.py:611-612 then returns None without touching the pointer. Core writes its generated slots through `write_thumbnail_atomically` (backend/app/services/thumbnail.py:611 uses `generating_file`), which this path does not use. docs/specs/thumbnail-slot-ownership.md section 5 says the download's failure handling is unchanged, and the non-atomic download is not new in this change.
Recommendation: Download to a temporary file beside the slot and `os.replace` it on success, or reuse core's atomic write helper.
Note: A refresh whose thumbnail download fails mid-transfer overwrites the live slot in place, so a row with a `.by-id` pointer keeps its pointer but can name a truncated picture, while `_save_loft_thumbnail` reports the failure as if nothing had changed.

### unspecified_behavior

Note: The spec states removal-failure behaviour for ghosts (log a warning, change nothing else) but not for a Media Import save over a reused row. The code lets the `OSError` propagate and abort the remaining fetch steps (F1).; A Media Import save removes the old picture but leaves its emptied directories under `<drive>/`, whereas the spec's pruning rule covers migration and the core helper prunes. decisions.md records the leftover seed directory.
- claude-read: The spec states removal-failure behaviour for ghosts (log a warning, change nothing else) but not for a Media Import save over a reused row. The code lets the `OSError` propagate and abort the remaining fetch steps (F1).
- claude-read: A Media Import save removes the old picture but leaves its emptied directories under `<drive>/`, whereas the spec's pruning rule covers migration and the core helper prunes. decisions.md records the leftover seed directory.
- claude-verify: The spec's failure cases do not say what happens when Media Import fails to remove the old picture. The code lets the OSError propagate, while the spec's nearest rule, for trashed ghosts, says a removal failure logs a warning and changes nothing else.
- claude-verify: The old-picture removal does not prune an emptied directory, unlike `remove_thumbnail_quietly`. The spec requires pruning only during migration, and decisions.md:7 records the emptied directory staying in the cache.

### unspecified_behavior

Note: The spec's failure cases do not say what happens when Media Import fails to remove the old picture. The code lets the OSError propagate, while the spec's nearest rule, for trashed ghosts, says a removal failure logs a warning and changes nothing else.; The old-picture removal does not prune an emptied directory, unlike `remove_thumbnail_quietly`. The spec requires pruning only during migration, and decisions.md:7 records the emptied directory staying in the cache.
- claude-read: The spec states removal-failure behaviour for ghosts (log a warning, change nothing else) but not for a Media Import save over a reused row. The code lets the `OSError` propagate and abort the remaining fetch steps (F1).
- claude-read: A Media Import save removes the old picture but leaves its emptied directories under `<drive>/`, whereas the spec's pruning rule covers migration and the core helper prunes. decisions.md records the leftover seed directory.
- claude-verify: The spec's failure cases do not say what happens when Media Import fails to remove the old picture. The code lets the OSError propagate, while the spec's nearest rule, for trashed ghosts, says a removal failure logs a warning and changes nothing else.
- claude-verify: The old-picture removal does not prune an emptied directory, unlike `remove_thumbnail_quietly`. The spec requires pruning only during migration, and decisions.md:7 records the emptied directory staying in the cache.

## Findings

A: 0
B: 4
C: 1

### claude-read:F2-download-failure-test-is-vacuous — bucket B, MEDIUM, open

Claim: No test exercises a failed download on a row that already has a picture, so the new destructive branch can lose the old picture or pointer on a failed refresh with every test still green.
Impact: A later edit that removes the old picture before downloading, or clears the pointer on failure, would turn a failed Refresh metadata into a silently lost thumbnail, and the suite would not catch it. The R-5 record in decisions.md also lists thumbnail download failure as not exercised, so neither tests nor the manual run cover this path.
Evidence: addons/media_import/backend/tests/test_loft_thumbnail.py:180-201: `test_download_failure_leaves_thumbnail_path_unchanged` seeds row f5 with a NULL pointer and asserts it is still NULL, and it has no old file. The only path-form test, test_loft_thumbnail.py:225-266, has a successful download. Removal-after-commit ordering has no test either, because nothing makes the commit fail. docs/process/reviews/fix-loft-thumbnail-by-id/decisions.md:8 states that the failure of a thumbnail download was not exercised.
Repro: not_reproduced (no shell for this reviewer). Mutants predicted to survive from reading the tests: (a) in service.py, read the pointer and unlink the old file before the download loop; (b) set `thumbnail_path = None` in the for-else failure branch; (c) move the unlink at service.py:624-625 before `db.commit()`. A mutate reviewer can confirm these.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a test that seeds a path-form pointer and an old file, makes the download return False, and asserts that the pointer and the old file's bytes are both unchanged. Add one that makes the commit fail and asserts that the old file remains.

</details>

### claude-read:F1-unlink-oserror-aborts-link-fetch — bucket B, LOW, open

Claim: The old-picture removal added to `_save_loft_thumbnail` lets an `OSError` escape into `_fetch_and_update`, a caller the spec's touch-point list does not name, so a cache cleanup failure aborts the rest of a metadata fetch after the new pointer has already committed.
Impact: If the old path-form picture cannot be removed, Refresh metadata or a /link import ends with item status `error`. The thumbnail is updated, but `loft_metadata` is not upserted, captions are not fetched, STT is not started and no file-updated event is emitted, all for a stale cache file. It needs a filesystem failure on the old path after a successful write to `.by-id`, so it is uncommon. A successful removal also leaves the emptied old directories in the cache, which the core helper would prune.
Evidence: addons/media_import/backend/service.py:624-625 calls `unlink(missing_ok=True)` with no `try`. The call site at service.py:923 is followed by the `loft_metadata` upsert at service.py:933-963 and the captions step at service.py:965-1009. The exception is only caught at service.py:780-782, which sets `item.status = "error"`. Core's `remove_thumbnail_quietly` at backend/app/services/thumbnail.py:634-643 absorbs `OSError`, logs a warning and prunes empty directories. The subscription caller at subscription/manager.py:716 is not affected in practice, because a newly registered row has no old pointer (subscription/db.py never writes `thumbnail_path`).
Repro: not_reproduced. Read-only trace: seed a .loft row with a path-form pointer, make `Path.unlink` raise `PermissionError` for that path, and run `_fetch_and_update`. The trace predicts an escaped `PermissionError`, the pointer already at `.by-id/<id>.jpg`, and no `loft_metadata` write.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Call `remove_thumbnail_quietly(old_rel)` from `app.services.thumbnail` after the commit when the pointer changed, in place of the bare `unlink`.

</details>

### claude-read:F3-stale-manager-comment-and-dead-parameters — bucket B, LOW, open

Claim: The change makes the comment at `subscription/manager.py:702-707` false, and that file is not in the touch-point list: the comment says the thumbnail path must match the on-disk filename for the core endpoint to find it, while `drive`, `folder_path` and `filename` no longer affect the helper at all.
Impact: No user-visible effect today. A reader who trusts the comment could keep threading filename logic through the import path, or could 'fix' the slot back toward a filename-derived path, which is the shape this change removes.
Evidence: addons/media_import/backend/subscription/manager.py:702-707 says `the thumb_rel must match the on-disk filename for the core thumbnail endpoint to find it`, while manager.py:720 still passes `filename=loft_path.name`. addons/media_import/backend/service.py:606 computes `thumb_rel` from `file_id` only, and the parameters at service.py:578-580 are no longer read anywhere in the function body shown at service.py:603-626. service.py:925-927 and manager.py:718-720 still pass them.
Repro: Read-only: the `_save_loft_thumbnail` body at service.py:603-626 contains no reference to `drive`, `folder_path` or `filename`. Changing the values passed at manager.py:718-720 cannot change the resulting pointer.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Delete the sentence about matching the on-disk filename at manager.py:704-707, and drop the three unused parameters from the helper and its two callers.

</details>

### claude-read:F4-new-tests-write-to-process-wide-thumbnail-cache — bucket B, LOW, open

Claim: The media_import test fixtures do not redirect `config.THUMBNAILS_DIR`, so the new tests create and delete files in the process-wide thumbnail directory instead of a per-test directory.
Impact: Running the addon tests from a checkout can leave `.by-id/f1.jpg`, `f6`, `f7`, `f8` and an empty `d/yt/` tree in `./data/thumbnails`, relative to the working directory. backend/tests/conftest.py:35-37 records that `./data` in a checkout is what the dev stack bind-mounts. These are stranded cache files with no row, so the cost is clutter and tests that depend on shared state, not a wrong picture.
Evidence: addons/media_import/backend/tests/conftest.py:17-99 patches `SessionLocal`, `get_drive_path` and `get_drive_access_group` but never `THUMBNAILS_DIR`. backend/app/config.py:8,11 derives `THUMBNAILS_DIR` from `DATA_DIR`, which defaults to `./data`. test_loft_thumbnail.py:236-239 seeds `d/yt/Old.jpg` under it, and the fake downloads at test_loft_thumbnail.py:80-85 and 250-254 write the slot there. The same unisolated write pattern already existed in the older `_fake_download` tests, so this change extends it to new tests and a seeded old file.
Repro: not_reproduced. Predicted: run `test_loft_thumbnail.py` from a checkout with `DATA_DIR` unset, then list `./data/thumbnails/.by-id/`; the files named after the test ids remain.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have the `media_import_db` or `drive_path` fixture monkeypatch `config.THUMBNAILS_DIR` to a directory under `tmp_path`.

</details>

### claude-verify:V1-partial-download-truncates-live-by-id-slot — bucket C, LOW, open

Claim: A refresh whose thumbnail download fails mid-transfer overwrites the live slot in place, so a row with a `.by-id` pointer keeps its pointer but can name a truncated picture, while `_save_loft_thumbnail` reports the failure as if nothing had changed.
Impact: A connection dropped during Refresh metadata or the startup caption retry can silently leave a card with a partial picture. It needs no misuse, only a short read. No test covers it. The next successful download repairs it.
Evidence: addons/media_import/backend/service.py:545 calls `urllib.request.urlretrieve(thumbnail_url, str(dest))` directly on the slot path, with no temporary file. service.py:547-549 catches the exception and returns False. service.py:611-612 then returns None without touching the pointer. Core writes its generated slots through `write_thumbnail_atomically` (backend/app/services/thumbnail.py:611 uses `generating_file`), which this path does not use. docs/specs/thumbnail-slot-ownership.md section 5 says the download's failure handling is unchanged, and the non-atomic download is not new in this change.
Repro: not_reproduced: read-only verifier, no commands available. Code trace only: `urlretrieve` opens the destination for writing before it copies the body, and raises `ContentTooShortError` on a short body after those bytes are written. A 404 raises before the destination is opened, so it does not damage the slot.
Introduced: pre-existing
Reviewer bucket: C | Author bucket: 

<details><summary>Proposed fix</summary>

> Download to a temporary file beside the slot and `os.replace` it on success, or reuse core's atomic write helper.

</details>

## Not verified

- claude-read: Nothing was executed: no tests, mutations or application run. All predictions come from reading the code; this reviewer has only Read, Glob and Grep.
- claude-read: Whether commit 228674ba0 is reachable from the addon remote or its default branch. The local packed-refs search under the main checkout's git modules directory found no match, which is inconclusive.
- claude-read: The stdlib behaviour of `urlretrieve` on a mid-transfer failure was taken from memory, not checked against the runtime's source.
- claude-read: The core side of the feature (migration, scanner, fileops, upload) was treated as already reviewed in PR #494 and read only where this diff depends on it.
- claude-read: The R-5 evidence files named in decisions.md live outside the repository and were not read.
- claude-read: The Intelligence addon's handling of `.by-id` paths was read only at the clip.py docstring, not through its path resolution.
- claude-verify: Nothing was executed: no tests, mutants or reproductions were run, because only Read, Glob and Grep are available. Every record rests on reading the code.
- claude-verify: The working tree was read rather than the commit object; it was assumed to match c55aa33e, including the addon submodule at its pin, based on the clean git status snapshot.
- claude-verify: `urlretrieve` behaviour in V1 comes from knowledge of the Python standard library, not from running it or reading its source in this environment.
- claude-verify: How an `error` item status reaches the user in the UI, and how the `.gitignore` treats `./data`, were not checked.

TOTAL: 5 findings
