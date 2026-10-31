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

Note: A scan, upload, create or copy can rename a drive-wide Tag row to the new note's casing (F1). Whether that is intended on paths where the user did not edit tags is not declared anywhere found in this review.; Copying a note across drives can respell the destination drive's tag, whereas moving one cannot (backend/app/services/tagops.py:124).; Create parses the raw request body, while scan, upload and copy parse text from read_text, which normalises line endings. A CRLF frontmatter block is therefore read as no frontmatter by create (backend/app/services/frontmatter.py:110-112), but projects on the other paths.; Copy reads notes up to 1,000,000 bytes (backend/app/services/fileops.py:38), while scan and upload read up to 1 MiB (backend/app/services/scanner.py:57). A note between those sizes gets tags on scan or upload but none on copy.
- claude-deep: Passive registration paths rewrite the spelling of a shared Tag row (F2).
- claude-deep: Every Markdown upload and create now sweeps all orphan Tag rows on the drive, not only rows this file released. Tag rows have no use outside file links that I could find, so this looks harmless, but it is wider than the operation.
- claude-deep: A note and its copy carry the same frontmatter `id:` value on disk (decisions.md second run, step 3). This is not new, and the change did not address it.
- claude-deep: An upload registers tags but still sets no `md_id` and adds no `id:` until the first content save, so notes reach the same tag state with different identity state depending on the path.
- claude-read: A scan, upload, create or copy can rename a drive-wide Tag row to the new note's casing (F1). Whether that is intended on paths where the user did not edit tags is not declared anywhere found in this review.
- claude-read: Copying a note across drives can respell the destination drive's tag, whereas moving one cannot (backend/app/services/tagops.py:124).
- claude-read: Create parses the raw request body, while scan, upload and copy parse text from read_text, which normalises line endings. A CRLF frontmatter block is therefore read as no frontmatter by create (backend/app/services/frontmatter.py:110-112), but projects on the other paths.
- claude-read: Copy reads notes up to 1,000,000 bytes (backend/app/services/fileops.py:38), while scan and upload read up to 1 MiB (backend/app/services/scanner.py:57). A note between those sizes gets tags on scan or upload but none on copy.
- claude-verify: Registering a note can rename the drive's shared Tag row, changing the displayed spelling on other notes (backend/app/services/tagops.py:72-76).
- claude-verify: A copy onto a path held by a trashed ghost can lose a frontmatter tag whose row is pending deletion (V1).

### unspecified_behavior

Note: Registering a note can rename the drive's shared Tag row, changing the displayed spelling on other notes (backend/app/services/tagops.py:72-76).; A copy onto a path held by a trashed ghost can lose a frontmatter tag whose row is pending deletion (V1).
- claude-deep: Passive registration paths rewrite the spelling of a shared Tag row (F2).
- claude-deep: Every Markdown upload and create now sweeps all orphan Tag rows on the drive, not only rows this file released. Tag rows have no use outside file links that I could find, so this looks harmless, but it is wider than the operation.
- claude-deep: A note and its copy carry the same frontmatter `id:` value on disk (decisions.md second run, step 3). This is not new, and the change did not address it.
- claude-deep: An upload registers tags but still sets no `md_id` and adds no `id:` until the first content save, so notes reach the same tag state with different identity state depending on the path.
- claude-read: A scan, upload, create or copy can rename a drive-wide Tag row to the new note's casing (F1). Whether that is intended on paths where the user did not edit tags is not declared anywhere found in this review.
- claude-read: Copying a note across drives can respell the destination drive's tag, whereas moving one cannot (backend/app/services/tagops.py:124).
- claude-read: Create parses the raw request body, while scan, upload and copy parse text from read_text, which normalises line endings. A CRLF frontmatter block is therefore read as no frontmatter by create (backend/app/services/frontmatter.py:110-112), but projects on the other paths.
- claude-read: Copy reads notes up to 1,000,000 bytes (backend/app/services/fileops.py:38), while scan and upload read up to 1 MiB (backend/app/services/scanner.py:57). A note between those sizes gets tags on scan or upload but none on copy.
- claude-verify: Registering a note can rename the drive's shared Tag row, changing the displayed spelling on other notes (backend/app/services/tagops.py:72-76).
- claude-verify: A copy onto a path held by a trashed ghost can lose a frontmatter tag whose row is pending deletion (V1).

### unspecified_behavior

Note: Passive registration paths rewrite the spelling of a shared Tag row (F2).; Every Markdown upload and create now sweeps all orphan Tag rows on the drive, not only rows this file released. Tag rows have no use outside file links that I could find, so this looks harmless, but it is wider than the operation.; A note and its copy carry the same frontmatter `id:` value on disk (decisions.md second run, step 3). This is not new, and the change did not address it.; An upload registers tags but still sets no `md_id` and adds no `id:` until the first content save, so notes reach the same tag state with different identity state depending on the path.
- claude-deep: Passive registration paths rewrite the spelling of a shared Tag row (F2).
- claude-deep: Every Markdown upload and create now sweeps all orphan Tag rows on the drive, not only rows this file released. Tag rows have no use outside file links that I could find, so this looks harmless, but it is wider than the operation.
- claude-deep: A note and its copy carry the same frontmatter `id:` value on disk (decisions.md second run, step 3). This is not new, and the change did not address it.
- claude-deep: An upload registers tags but still sets no `md_id` and adds no `id:` until the first content save, so notes reach the same tag state with different identity state depending on the path.
- claude-read: A scan, upload, create or copy can rename a drive-wide Tag row to the new note's casing (F1). Whether that is intended on paths where the user did not edit tags is not declared anywhere found in this review.
- claude-read: Copying a note across drives can respell the destination drive's tag, whereas moving one cannot (backend/app/services/tagops.py:124).
- claude-read: Create parses the raw request body, while scan, upload and copy parse text from read_text, which normalises line endings. A CRLF frontmatter block is therefore read as no frontmatter by create (backend/app/services/frontmatter.py:110-112), but projects on the other paths.
- claude-read: Copy reads notes up to 1,000,000 bytes (backend/app/services/fileops.py:38), while scan and upload read up to 1 MiB (backend/app/services/scanner.py:57). A note between those sizes gets tags on scan or upload but none on copy.
- claude-verify: Registering a note can rename the drive's shared Tag row, changing the displayed spelling on other notes (backend/app/services/tagops.py:72-76).
- claude-verify: A copy onto a path held by a trashed ghost can lose a frontmatter tag whose row is pending deletion (V1).

## Findings

A: 0
B: 13
C: 0

### claude-deep:F1-scan-writeback-failure-skips-tags — bucket B, MEDIUM, open

Claim: When the scanner cannot write a generated `id:` back to a new note, `_ensure_md_id_for_new_file` returns before `project_frontmatter_tags`, so the note's frontmatter tags are silently not projected.
Impact: On a drive mounted `:ro`, which docs/admin-guide/docker-compose.md:41 documents as an optional setup, every note with frontmatter but no valid `id:` registers with no chips and no tag filter entry. Nothing tells the user, and later scans never revisit the row because the projection runs only for new rows. This is the symptom the change sets out to remove, on the one registration path a read-only drive has.
Evidence: backend/app/services/scanner.py:313-318 returns on OSError from `replace_file_contents`. The projection is at scanner.py:330 and only needs `content`, already read at scanner.py:286. The tests in backend/tests/test_scanner_md_id.py all use a writable drive; none combines a failed write with a `tags:` key.
Repro: not_reproduced (read from the code, not run; I did not read the internals of `replace_file_contents`, so a read-only mount raising OSError is assumed). Proposed test: monkeypatch `app.services.scanner.replace_file_contents` to raise OSError, then register `---\ntags: [a]\n---\n\nbody\n` through `_scan_and_register`. Expected from reading: `record.tags == []`. No existing test would catch it.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Run `project_frontmatter_tags` before the write-back attempt, or do not let the write-back's OSError return skip the projections that only need the content already read.

</details>

### claude-deep:F2-registration-rewrites-shared-tag-spelling — bucket B, MEDIUM, open

Claim: Scan, upload, copy and create now reuse `replace_file_tags`, whose case-variant branch renames the shared Tag row, so registering one note changes the spelling of the tag on other notes.
Impact: Adding or copying one note with `tags: [ALPHA]` changes the chip on every other note on that drive tagged `alpha`, though the user edited none of them. The next chip edit on such a note writes the new spelling into its file on disk. A cross-drive copy rewrites the destination drive's spelling, while `retarget_file_tags` keeps the destination spelling for a move. Copying a note whose disk spelling is older flips the row back, and in one scan the last note in `rglob` order decides the spelling.
Evidence: backend/app/services/tagops.py:72-76 does the rename. The new callers are scanner.py:330, fileops.py:336, upload.py:323 and drives.py:892. tagops.py:124 states that a destination row is never rewritten for a move. test_scanner_md_id.py `test_case_variant_reuses_row` pins the rename for scan and single registration. `TestCopy.test_cross_drive_uses_destination_rows` runs only against an empty destination. R-5 step 5 in docs/process/reviews/fix-project-frontmatter-tags-on-scan/decisions.md observed the effect: `caps.md` by rescan changed tagged.md's chip to ALPHA, and the next chip add wrote ALPHA to disk.
Repro: From the recorded R-5 step 5: note A has `tags: [alpha]`; add note B with `tags: [ALPHA]` and rescan; A's chip reads ALPHA while A's file still reads alpha; adding a chip to A writes ALPHA to A's file. The copy variant was not run: seeding drive2 with row `ALPHA` and copying a note with `[alpha]` should leave drive2's row as `alpha`, by reading tagops.py:72-76.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Give the projection a mode that reuses an existing case-variant row as it stands, as `retarget_file_tags` and batch tagging do, and keep the rename for explicit tag edits.

</details>

### claude-read:F1-unattended-tag-respelling — bucket B, MEDIUM, open

Claim: Registering a note by scan, upload, create or copy now renames the drive's shared Tag row to that note's frontmatter casing, so a background scan or a copy changes the displayed tag on every other note carrying it.
Impact: With notes A and C spelled `Python`, a new note B spelled `python` appearing on disk makes the next scan turn every `Python` chip into `python`, while A's and C's frontmatter still say `Python`. When several new notes differ in case, the scan's visiting order picks the final spelling. Copying a note to another drive also respells that drive's existing tag, which a move across drives deliberately never does. The user did not edit any tag and is not told.
Evidence: backend/app/services/tagops.py:72-76 assigns `tag.name = tag_name` for a case-variant match. It is newly reached from backend/app/services/scanner.py:330, backend/app/services/upload.py:323, backend/app/services/fileops.py:336 and backend/app/routers/drives.py:892. backend/app/services/tagops.py:124 says of the move path that a destination row is reused as it stands and its spelling never rewritten. frontend/src/components/EditableTagChips.tsx:251-254 canonicalises suggestions specifically to avoid renaming a tag for every file that carries it. backend/tests/test_scanner_md_id.py:178-183 pins the rename on registration, and test_scan_shares_new_tag_row_across_notes asserts only the row count, not the spelling.
Repro: not_reproduced (read-only reviewer). Traced by reading: seed Tag(name='Python') attached to note A, write b.md with `tags: [python]`, run _scan_and_register. index.get('python') misses the exact map and hits the folded map, the row is renamed, and A's tag name becomes `python`. The existing test test_case_variant_reuses_row asserts this outcome for a row with no attached note.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have the registration and copy paths reuse a case-variant row as it stands, as retarget_file_tags does, and keep the rename for explicit tag or content writes only.

</details>

### claude-deep:F3-swallowed-db-error-poisons-session — bucket B, LOW, open

Claim: `project_frontmatter_tags` catches a database error from its flush without rolling back, so the session stays unusable and the failure is not actually isolated from registration.
Impact: If the flush in `replace_file_tags` fails, the next session use raises PendingRollbackError. In `_scan_and_register` that aborts the scan and loses its uncommitted work. In `complete_upload` it surfaces from `cleanup_orphan_tags` or `db.commit` after the uploaded file has landed on disk, leaving a file with no row. No normal-use trigger was found, so this is a latent gap rather than a daily failure.
Evidence: backend/app/services/tagops.py:75 flushes inside the try at tagops.py:89-92, and the except only logs. `except (OSError, UnicodeDecodeError)` at upload.py:325 does not cover PendingRollbackError. `_record_created_file_version` in the same change's drives.py:57 already isolates its failure with `db.begin_nested()`. `test_projection_failure_does_not_break_registration` injects a plain RuntimeError at entry, so it never reaches a failed flush.
Repro: not_reproduced. Mutation in thought: make the flush raise IntegrityError instead of raising at entry of `replace_file_tags`; the following `db.flush` at scanner.py:754 would raise PendingRollbackError, and the existing test does not exercise this.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Wrap the `replace_file_tags` call in `with db.begin_nested():` and extend the failure test to raise from a flush.

</details>

### claude-deep:F4-copy-size-limit-differs — bucket B, LOW, open

Claim: Copy reads a note for projection only up to 1,000,000 bytes while scan, upload and create accept up to 1,048,576 bytes, so a note in that gap keeps its tags on those paths and silently loses them on copy.
Impact: A note between 1,000,001 and 1,048,576 bytes shows chips on the source, while its copy shows none, with no log line or error. Rare, because it needs a note of nearly 1 MB.
Evidence: backend/app/services/fileops.py:38 uses `1_000_000`. backend/app/services/scanner.py:57 uses `1 * 1024 * 1024`, imported by upload.py:22 and used at upload.py:321. backend/app/routers/drives.py:885 allows 1 MiB on create. No test covers the boundary.
Repro: not_reproduced. From reading: create a 1,020,000-byte `.md` with `tags: [a]` through POST /api/drives/{drive}/files, then POST /api/files/{id}/copy; the source has chip a and the copy has none.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Use one shared limit constant for all Markdown projection reads.

</details>

### claude-deep:F5-upload-skip-branch-keeps-stale-tags — bucket B, LOW, open

Claim: Uploading an oversize or non-UTF-8 `.md` over a reused row skips projection with a bare `pass`, so the row silently keeps the tags of the content it replaced.
Impact: The new file's chips and tag filter results describe the old note, and nothing is logged. The PUT content path logs a warning for the same non-UTF-8 case.
Evidence: backend/app/services/upload.py:321 is the size guard and upload.py:325-326 the bare `pass`, with the row reused at upload.py:278-301. backend/app/routers/files.py:1620-1625 logs the equivalent case. backend/tests/test_frontmatter_tags_on_create.py covers neither branch, and a search of the upload, frontmatter, copy and scanner_md test files found no such upload.
Repro: not_reproduced. From reading: a row with `missing_since` set and tag `stale`, then an upload to that path of a body containing invalid UTF-8; the row is revived with tag `stale`. Mutations expected to survive the current tests: removing the size guard, and narrowing the except clause.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Log a warning in the skip branch and add tests for both skip conditions; decide whether a reused row whose new content cannot be read should keep its tags.

</details>

### claude-deep:F6-sidebar-not-refreshed-for-new-tags — bucket B, LOW, open

Claim: Upload, copy, create and scan can now create Tag rows, but the sidebar's tag list is not refetched when they do.
Impact: After such an operation the new tags appear as chips on the note but are missing from the sidebar until a full page load, so the user cannot filter by them and may think the tag was not saved. The same holds for the destination drive after a cross-drive copy.
Evidence: frontend/src/components/sidebar/useSidebarData.ts:58-83 refetches tags only on drive, folder or `refreshKey` changes. useSidebarData.ts:85-89 refreshes only the drive summary on `scan:complete`. decisions.md second run, steps 1, 3 and 4, recorded the upload, cross-drive copy and create cases as stale until a full page load.
Repro: Recorded in decisions.md second run: upload `uploaded.md` with `tags: [delta, epsilon]`; 2.5 seconds later the sidebar lists neither, and after a full page load it lists both. I did not trace what increments `refreshKey`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Refetch the sidebar tags on the events that can create tags, such as `upload:complete` and `scan:complete`, and after a copy or quick note.

</details>

### claude-read:F2-writeback-failure-skips-tags — bucket B, LOW, open

Claim: When a new note has frontmatter but no valid `id:` and writing the generated id back fails, _ensure_md_id_for_new_file returns before projecting tags, so its readable tags are not projected.
Impact: A note without an `id:` on a drive the app cannot write, such as a read-only mount, registers with no chips even though its tags were read successfully. A note on the same drive that already has an id gets chips. Nothing but the absent chips shows this; no warning is logged on this path. Later scans do not retry, because the row then exists.
Evidence: backend/app/services/scanner.py:314-318 has `except OSError: return`, and the projection is only at backend/app/services/scanner.py:330. `content` is already in memory at line 286, so the projection does not depend on the write. backend/tests/test_scanner_md_id.py has no test with a failing write-back (no match for OSError, chmod or read-only).
Repro: not_reproduced. Traced by reading: make replace_file_contents raise OSError and register a note containing `---\ntags: [a]\n---\n`. The function returns at line 318 and File.tags stays empty.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Project tags before the id write-back, or on the OSError branch before returning.

</details>

### claude-read:F3-upload-reuse-keeps-stale-tags — bucket B, LOW, open

Claim: An upload that replaces a reused Markdown row with a file that is over 1 MiB or not valid UTF-8 skips projection and leaves the old content's tags on the row.
Impact: After such an upload, the note keeps chips and tag-filter membership from content that no longer exists, with nothing logged. The same function resets the row's other content-derived state for this replacement, and the upload-over-missing tests establish that tags should follow the new content.
Evidence: backend/app/services/upload.py:319-326: the size guard falls through and `except (OSError, UnicodeDecodeError): pass` is silent, so neither replace_file_tags nor cleanup_orphan_tags runs. backend/app/services/upload.py:278-301 reuses the row and resets file_hash, chapters_probed_at and trust_tier. backend/tests/test_frontmatter_tags_on_create.py has no oversized or non-UTF-8 case.
Repro: not_reproduced. Traced by reading: seed a missing row n.md with tag `stale`, upload n.md with bytes `b'\xff\xfe'`. read_text raises UnicodeDecodeError, the `pass` runs, and the row is revived with `stale` still attached.
Introduced: unverified
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> On a reused row whose new content cannot be read as a note, clear the tags and sweep orphans.

</details>

### claude-read:F4-tests-miss-drive-scoping-and-upload-guards — bucket B, LOW, open

Claim: The new tests do not distinguish destination-drive tag rows from source-drive rows on a cross-drive copy, and they do not exercise the upload size guard or decode-error handler.
Impact: A regression that attached a source-drive Tag row to a copy, or that turned a non-UTF-8 `.md` upload into a 500 after its bytes landed, would pass this commit's new tests.
Evidence: backend/tests/test_frontmatter_tags_on_create.py:121-139: test_cross_drive_uses_destination_rows seeds the source through _seed_note, which never projects tags, so the source drive holds no `Alpha` row and the test cannot show which drive's row was chosen. It also seeds no destination row, so reuse there is untested. backend/app/services/upload.py:321 and :325 have no matching case in the new test file.
Repro: Mutations reasoned, not run. (1) In replace_file_tags, load all drives' tags instead of file.drive's: the cross-drive test still passes, because no source row exists to be picked. Other test files were not checked for killing this mutant. (2) Remove `except (OSError, UnicodeDecodeError)` in complete_upload: no case in the new test file fails.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Project the source's tags before the cross-drive copy and seed a same-name destination row, then assert the copy's row has drive2 and the destination row's id. Add a non-UTF-8 upload case.

</details>

### claude-verify:V1-copy-attaches-row-pending-delete — bucket B, LOW, open

Claim: A copy onto a path held by a trashed ghost can attach the new note to a Tag row already marked for deletion, so the copy can lose that frontmatter tag.
Impact: When the ghost was the destination drive's last carrier of a tag and the copied note names that tag, the expected result is a copy with no chip for it, a removed Tag row and a 200 response. The tag stays in the file on disk, and a later chip edit would drop it from the file.
Evidence: backend/app/services/fileops.py:196-198 deletes the ghost, flushes, then calls cleanup_orphan_tags, which only marks orphans with db.delete at backend/app/services/tagops.py:116-117 and does not flush them. backend/app/database.py:38 sets autoflush=False, so load_tag_index at backend/app/services/tagops.py:65, reached from backend/app/services/fileops.py:336, still sees the row. backend/app/services/tagops.py:134-136 flushes first in retarget_file_tags for this hazard ('or a row about to be deleted gets attached'), and replace_file_tags has no such flush. Upload avoids it through db.flush at backend/app/services/upload.py:318. file_tags.tag_id is ON DELETE CASCADE at backend/app/models.py:28. Trash keeps the file on disk (backend/app/services/fileops.py:711), and _resolve_copy_filename at backend/app/services/fileops.py:222-225 avoids a path that exists on disk, so the ghost must have lost its disk file out of band. backend/tests/test_frontmatter_tags_on_create.py has no ghost case.
Repro: not_reproduced: this verifier cannot run code, and the final state after flush is inferred from reading the code and SQLAlchemy's unit-of-work ordering. Steps to run: on drive B, trash n.md carrying the only reference to tag alpha and remove its disk file; copy n.md with tags: [alpha] from drive A to the same path on B; inspect the copy's File.tags and B's Tag rows.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Call db.flush() before load_tag_index on this path, or flush at the end of the trashed branch in resolve_db_path_conflict, and add a copy-over-ghost test.

</details>

### claude-deep:F7-no-touch-point-list — bucket B, INFO, open

Claim: No touch-point list exists for this change, so the first-review question cannot be answered as a difference against a list, and every place below is unlisted by default.
Impact: No user impact. The scope grew from the branch's scan fix to upload, copy, create and a helper relocation with no declared list to check it against, and the decision about that scope falls to a person.
Evidence: docs/process/reviews/fix-project-frontmatter-tags-on-scan/ holds decisions.md and r1/ only, with no invariants.md. No file in docs/specs is named for frontmatter, and docs/specs/INDEX.md has no matching entry. Direct reach: backend/app/services/scanner.py, upload.py, fileops.py, tagops.py; backend/app/routers/drives.py, files.py; the two test files; docs/developer-guide/known-issues.md. Indirect reach, not in the diff: backend/app/routers/internal.py:26 through the `replace_file_tags` re-export in files.py; backend/app/services/markdown_image_import.py:414 through `register_single_file`; the frontend sidebar tag list (F6).
Repro: not_reproduced; found by listing the directory and searching docs/specs.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:F5-no-touch-point-list — bucket B, INFO, open

Claim: No invariants file declares a touch-point list for this change, so every place the diff reaches is undeclared, including several the diff text does not show.
Impact: No declared boundary exists to check the reach against. The reach outside the visibly edited lines is: every internal tag write, which reaches the moved helper through a re-export; the markdown image import through register_single_file; a new upload-to-scanner import; and a tag-index load per new Markdown file during a scan.
Evidence: Only decisions.md exists in docs/process/reviews/fix-project-frontmatter-tags-on-scan/, and docs/specs/INDEX.md has no matching frontmatter-tag entry. Edited places: backend/app/routers/drives.py:889-893, 1014, 1100; backend/app/routers/files.py:92; backend/app/services/fileops.py:336; backend/app/services/scanner.py:330; backend/app/services/tagops.py:49-92; backend/app/services/upload.py:22-23, 319-326. Reached without an edit: backend/app/routers/internal.py:26 imports replace_file_tags through app.routers.files; backend/app/services/markdown_image_import.py:414 calls register_single_file; backend/app/services/scanner.py:758 runs load_tag_index in tagops.py:65 once per new Markdown file with frontmatter.
Repro: not_reproduced. Found by reading and by a repository-wide search for the changed symbols.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: No test, mutation or application run was performed; this reviewer has read-only tools, and every repro is reasoned from the code or quoted from decisions.md.
- claude-deep: Addon submodule code under addons/ was not read, including any imports of core helpers and the knowledge scanner's reconciliation of the tags projected here.
- claude-deep: The supplied diff was reviewed as given. It spans the branch, although the named commit a14fcf475 is described as a documentation commit, and I could not run git to compare them.
- claude-deep: `replace_file_contents` internals, the actual exception on a real read-only mount, and what increments the sidebar's `refreshKey` were not read.
- claude-deep: R-5 observations in decisions.md were not independently repeated.
- claude-read: No code, test or mutation was run; every repro is traced by reading.
- claude-read: Whether tests outside the changed files kill the F4 mutants, or cover oversized or non-UTF-8 Markdown uploads.
- claude-read: Addon behaviour: a search for tag usage in Python files under addons/ returned nothing, and addons located elsewhere were not examined, including how the knowledge addon's tag writes interact with registration-time projection.
- claude-read: Frontend behaviour beyond the quoted lines of EditableTagChips.tsx, including how chips refresh after a background rename.
- claude-read: Scan time and memory on a large drive.
- claude-read: The contents of decisions.md for this change and the untracked r1 directory, which were deliberately not read to keep the review independent of the author's reasoning.
- claude-read: Behaviour on PostgreSQL or any database other than SQLite, and of a mount that folds case or Unicode normalisation.
- claude-verify: No code or test was executed, because this verifier has only Read, Glob and Grep; all confirmations come from reading the code and decisions.md.
- claude-verify: SQLAlchemy behaviour was not observed at runtime, including PendingRollbackError after a failed flush and the flush outcome assumed in V1.
- claude-verify: The trigger inside useFileDetailData.ts for its requestRefresh calls was not read.
- claude-verify: The commit diff was not read, so which lines the change introduced was not checked independently; files were read from the working tree, assumed to match the reviewed commit.

TOTAL: 13 findings
