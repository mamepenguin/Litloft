# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks
- R-5 ran at 295ba729f31c2724c816602f0ae09de4f578f671, and these files changed since: backend/app/services/tagops.py, docs/developer-guide/known-issues.md; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: The record holds one code fix round after the original change, because 714a2ae57 only records the review. That round removed one thing: the per-name SQL lookup and its `if key in retargeted: continue` branch became a single Python map. It added two things of different kinds: an ordering prediction (`db.flush()` must run before the lookup so pending deletes are gone) and a new state (`left_drives`, the set of drives to sweep). Neither repeats something the first round added, so one round shows no repeated patching of the same kind. The matching rule is the place to watch: it changed in this round and still differs from `replace_file_tags`, `merge_file_tags` and the tag filter, which is the source of F1 and F2. Another round that adjusts matching only in the move path would mean the design is being patched.
- claude-read: There is one code-changing fix round since r1 (714a2ae57 records docs only). It does not repeat a kind of patch from an earlier fix round, because no earlier fix round exists; compared with the original retarget it both removes and adds. It removes the per-tag SQL lookup, the `if key in retargeted: continue` branch, and the prediction that all of a file's tags belong to src_drive. It adds a dst_by_key state, a left_drives state, and an ordering prediction that pending deletes must be flushed first. Replacing the Python-against-SQL comparison with one comparison removes a mismatch rather than patching it. left_drives is different: it is a new state that serves links a migration would otherwise remove, and it still predicts where old rows can be, which misses the destination (variant-row-on-destination-stranded-by-return-move). If a later round adds another case for stale or variant rows, the design is being patched. The same comparison also still lives in replace_file_tags and merge_file_tags, so the fix is local to the move.

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

Note: A move now treats `Übung` and `übung` as one tag, while replace_file_tags and merge_file_tags on a drive treat them as different when the existing row holds the capital. The same two names merge or stay apart depending on the path that handled them.; Python str.lower() also folds compatibility characters such as U+212A KELVIN SIGN to `k`, so such a tag name would merge into an ASCII row on the destination.; When a file holds two case variants and the destination has neither, the surviving spelling depends on the order of File.tags, which the relationship does not define (backend/app/models.py:115-117).; `{src_drive} |` at backend/app/services/tagops.py:54 makes a move of a file that has only stale links also sweep unrelated orphan rows on the source drive, where the file left nothing.
- claude-deep: A move merges non-ASCII case variants, while `replace_file_tags`, `merge_file_tags` and the tag filter keep them distinct. The tests pin this merge under an `UNSPEC` comment, so a person should confirm it.
- claude-deep: When a legacy link is present, the move sweeps orphan rows on a third drive that is neither source nor destination, and that drive may be locked for the requester. Only rows with no linked file are deleted and nothing is returned, so no data is exposed, but the transaction writes outside the two drives named in the request.
- claude-deep: The `files.moved` event names only the source and destination drives (`files.py:1438`, `files.py:422`), so an open tab on a swept third drive is not told its tag list changed.
- claude-deep: A `.md` file moved onto a row with a different ASCII spelling keeps its frontmatter spelling, and a later projection renames the destination row for every file on that drive (`files.py:169-172`). This is unchanged from r1.
- claude-read: A move now treats `Übung` and `übung` as one tag, while replace_file_tags and merge_file_tags on a drive treat them as different when the existing row holds the capital. The same two names merge or stay apart depending on the path that handled them.
- claude-read: Python str.lower() also folds compatibility characters such as U+212A KELVIN SIGN to `k`, so such a tag name would merge into an ASCII row on the destination.
- claude-read: When a file holds two case variants and the destination has neither, the surviving spelling depends on the order of File.tags, which the relationship does not define (backend/app/models.py:115-117).
- claude-read: `{src_drive} |` at backend/app/services/tagops.py:54 makes a move of a file that has only stale links also sweep unrelated orphan rows on the source drive, where the file left nothing.
- claude-verify: No spec text or test states whether a moved tag should prefer an exact-name row on the destination over an older case variant; test_a_destination_holding_two_variants_resolves_to_the_older_row covers only a destination with no exact row.
- claude-verify: Moving a non-ASCII lowercase tag onto a capitalised row merges two spellings that tag editing and the tag filter treat as separate tags.

### unspecified_behavior

Note: No spec text or test states whether a moved tag should prefer an exact-name row on the destination over an older case variant; test_a_destination_holding_two_variants_resolves_to_the_older_row covers only a destination with no exact row.; Moving a non-ASCII lowercase tag onto a capitalised row merges two spellings that tag editing and the tag filter treat as separate tags.
- claude-deep: A move merges non-ASCII case variants, while `replace_file_tags`, `merge_file_tags` and the tag filter keep them distinct. The tests pin this merge under an `UNSPEC` comment, so a person should confirm it.
- claude-deep: When a legacy link is present, the move sweeps orphan rows on a third drive that is neither source nor destination, and that drive may be locked for the requester. Only rows with no linked file are deleted and nothing is returned, so no data is exposed, but the transaction writes outside the two drives named in the request.
- claude-deep: The `files.moved` event names only the source and destination drives (`files.py:1438`, `files.py:422`), so an open tab on a swept third drive is not told its tag list changed.
- claude-deep: A `.md` file moved onto a row with a different ASCII spelling keeps its frontmatter spelling, and a later projection renames the destination row for every file on that drive (`files.py:169-172`). This is unchanged from r1.
- claude-read: A move now treats `Übung` and `übung` as one tag, while replace_file_tags and merge_file_tags on a drive treat them as different when the existing row holds the capital. The same two names merge or stay apart depending on the path that handled them.
- claude-read: Python str.lower() also folds compatibility characters such as U+212A KELVIN SIGN to `k`, so such a tag name would merge into an ASCII row on the destination.
- claude-read: When a file holds two case variants and the destination has neither, the surviving spelling depends on the order of File.tags, which the relationship does not define (backend/app/models.py:115-117).
- claude-read: `{src_drive} |` at backend/app/services/tagops.py:54 makes a move of a file that has only stale links also sweep unrelated orphan rows on the source drive, where the file left nothing.
- claude-verify: No spec text or test states whether a moved tag should prefer an exact-name row on the destination over an older case variant; test_a_destination_holding_two_variants_resolves_to_the_older_row covers only a destination with no exact row.
- claude-verify: Moving a non-ASCII lowercase tag onto a capitalised row merges two spellings that tag editing and the tag filter treat as separate tags.

### unspecified_behavior

Note: A move merges non-ASCII case variants, while `replace_file_tags`, `merge_file_tags` and the tag filter keep them distinct. The tests pin this merge under an `UNSPEC` comment, so a person should confirm it.; When a legacy link is present, the move sweeps orphan rows on a third drive that is neither source nor destination, and that drive may be locked for the requester. Only rows with no linked file are deleted and nothing is returned, so no data is exposed, but the transaction writes outside the two drives named in the request.; The `files.moved` event names only the source and destination drives (`files.py:1438`, `files.py:422`), so an open tab on a swept third drive is not told its tag list changed.; A `.md` file moved onto a row with a different ASCII spelling keeps its frontmatter spelling, and a later projection renames the destination row for every file on that drive (`files.py:169-172`). This is unchanged from r1.
- claude-deep: A move merges non-ASCII case variants, while `replace_file_tags`, `merge_file_tags` and the tag filter keep them distinct. The tests pin this merge under an `UNSPEC` comment, so a person should confirm it.
- claude-deep: When a legacy link is present, the move sweeps orphan rows on a third drive that is neither source nor destination, and that drive may be locked for the requester. Only rows with no linked file are deleted and nothing is returned, so no data is exposed, but the transaction writes outside the two drives named in the request.
- claude-deep: The `files.moved` event names only the source and destination drives (`files.py:1438`, `files.py:422`), so an open tab on a swept third drive is not told its tag list changed.
- claude-deep: A `.md` file moved onto a row with a different ASCII spelling keeps its frontmatter spelling, and a later projection renames the destination row for every file on that drive (`files.py:169-172`). This is unchanged from r1.
- claude-read: A move now treats `Übung` and `übung` as one tag, while replace_file_tags and merge_file_tags on a drive treat them as different when the existing row holds the capital. The same two names merge or stay apart depending on the path that handled them.
- claude-read: Python str.lower() also folds compatibility characters such as U+212A KELVIN SIGN to `k`, so such a tag name would merge into an ASCII row on the destination.
- claude-read: When a file holds two case variants and the destination has neither, the surviving spelling depends on the order of File.tags, which the relationship does not define (backend/app/models.py:115-117).
- claude-read: `{src_drive} |` at backend/app/services/tagops.py:54 makes a move of a file that has only stale links also sweep unrelated orphan rows on the source drive, where the file left nothing.
- claude-verify: No spec text or test states whether a moved tag should prefer an exact-name row on the destination over an older case variant; test_a_destination_holding_two_variants_resolves_to_the_older_row covers only a destination with no exact row.
- claude-verify: Moving a non-ASCII lowercase tag onto a capitalised row merges two spellings that tag editing and the tag filter treat as separate tags.

## Findings

A: 0
B: 6
C: 0

### claude-deep:F2-non-ascii-capital-tag-edit-fails-after-reuse — bucket B, MEDIUM, open

Claim: Editing the tags of a file that holds a non-ASCII capital tag fails on `uq_tags_drive_name`, because `replace_file_tags` still has the folding mismatch this commit removed from the move path.
Impact: After a successful move onto a reused `Übung` row, adding or removing another tag on that file answers 500 and nothing changes. For a note, the frontmatter has already been rewritten when the projection fails, so `File.tags` and the frontmatter disagree. The same mismatch makes a knowledge scanner tag post fail for that file. The failure also occurs without a move, for any file holding such a tag.
Evidence: `backend/app/routers/files.py:162` compares SQL `lower(Tag.name)` with Python `tag_name.lower()`. For `Übung` the two differ, so the lookup misses and `files.py:168` builds a second `Tag` with the same drive and name. `backend/app/models.py:47` rejects it at the flush in `cleanup_orphan_tags`. `files.py:817-819` has no handler for that error. `files.py:796-803` answers 500 `Tag projection failed` after the content write. `backend/app/routers/internal.py:165-166` calls the same helper. `merge_file_tags` at `files.py:198-206` has the same lookup and flush. The validator at `backend/app/schemas.py:129` accepts the name, and no `create_function` or ICU registration exists in `backend/app`. `docs/developer-guide/known-issues.md:204` records only the listing symptom. The new tests in `TestNonAsciiTagNames` stop at the tag list after the move and never edit tags afterwards.
Repro: not_reproduced (read-only review; derived from the code). Steps: tag a non-Markdown file `Übung`, then send `PUT /api/files/{id}/tags` with `Übung` and a second valid tag. Expected from the code: an unhandled IntegrityError and a 500, with the file's tags unchanged.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Match names in `replace_file_tags` and `merge_file_tags` with the same rule as the move path, through one shared helper, and add a test that edits tags on a file holding a non-ASCII capital tag.

</details>

### claude-read:non-ascii-capital-tag-edit-fails-after-move — bucket B, MEDIUM, open

Claim: The ASCII-only name lookup that this commit removed from the move still exists in replace_file_tags and merge_file_tags, so a tag with a non-ASCII capital that a move has correctly placed on the destination makes the next tag edit of that tag on that drive fail with an unhandled IntegrityError.
Impact: After moving a file tagged `Übung`, adding or removing any other tag on it in file detail sends the whole list, including `Übung`, and answers 500 with nothing changed. Bulk-tagging another file on that drive with `Übung` also fails: batch_tags catches only HTTPException and OSError, so the whole request aborts. The same failure happens without any move, so the move is not the cause, but the fix stops at the move and the fixed case still leads straight to it. known-issues.md records only the list filter symptom of this mismatch.
Evidence: backend/app/routers/files.py:162 and :198 compare SQL func.lower(Tag.name) with Python tag_name.lower(). For the row `Übung`, SQLite gives `Übung` and Python gives `übung`, so the lookup misses. files.py:168 and :204 then build Tag(name='Übung', drive=file.drive) for a (drive, name) that already exists, which uq_tags_drive_name (backend/app/models.py:47) rejects at flush. No create_function exists in backend/app. update_file_tags (files.py:817-819) has no handler for it, and batch_tags (files.py:446-451) catches neither. The comment at backend/app/services/tagops.py:50 states the same folding limit. backend/tests/test_move_tags_follow_drive.py:188-206 asserts only the tag list after the move and never edits the tag afterwards.
Repro: not_reproduced (read-only review). Steps: tag a non-Markdown file `Übung` on drive A, then move it to drive B. Then PUT /api/files/{id}/tags with {"tags":["Übung","neu"]}. Expected from the code: 500 from the unique constraint, and the file keeps only `Übung`.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Share one Python-side name match, per drive, among retarget_file_tags, replace_file_tags and merge_file_tags, and add a test that edits a non-ASCII capital tag on a drive where its row already exists.

</details>

### claude-deep:F1-python-fold-ignores-exact-row-and-lands-on-unfilterable-row — bucket B, LOW, open

Claim: retarget_file_tags resolves a tag by Python-folded key to the oldest variant, ignoring an exact-name row on the destination, and treats non-ASCII case variants as one tag while tag editing and the tag filter treat them as two.
Impact: A file tagged `übung` that could be found by its tag on the source drive can stop being found after a move. The move answers 200 and the tag chip reads `Übung`, but choosing either spelling on the destination does not list the file, even when that drive also has a row named exactly `übung`. A note's frontmatter keeps `übung`, so the next projection moves it to a separate `übung` row and the tag counts shift again.
Evidence: `backend/app/services/tagops.py:52-53` keeps the lowest-id row for each `name.lower()`, and `tagops.py:59` looks up only that key, so an exact-name row with a higher id is never chosen. `backend/app/routers/files.py:159-168` (`replace_file_tags`) compares SQL `lower(Tag.name)`, which folds ASCII only, so `Übung` and `übung` can coexist on one drive through normal tagging when `Übung` is created first. `backend/app/routers/drives.py:716` filters with `func.lower(Tag.name) == name.lower()`, so both spellings select only the `übung` row, and a file linked to `Übung` is never listed. `docs/developer-guide/known-issues.md:204` records that a non-ASCII capital lists nothing when chosen. `backend/tests/test_move_tags_follow_drive.py` `test_a_non_ascii_case_variant_is_reused_without_renaming` asserts the variant merge, and `test_a_destination_holding_two_variants_resolves_to_the_older_row` covers only a destination with no exact-name row. The code replaced in this commit compared SQL `lower(Tag.name)` with the folded key, so it found a lowercase exact-name row.
Repro: not_reproduced (read-only review; derived from the code). Steps: on drive B, tag file 1 `Übung`, then tag file 2 `übung`, which leaves two rows. On drive A, tag file 3 `übung` and move it to B. Expected from the code: B lists `Übung` 2 and `übung` 1, and `GET /api/drives/B/files?tag=übung` returns file 2 but not file 3. A mutant that looks up the exact name first would pass every current test.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Look up the exact name on the destination first and fall back to the folded key only when there is no exact row, and add a test with both variants on the destination. Whether a non-ASCII variant should merge at all is a decision for a person, because the filter and `replace_file_tags` still treat variants as different tags.

</details>

### claude-deep:F3-legacy-link-row-stranded-by-tag-edit-or-purge — bucket B, LOW, open

Claim: A file still linked to another drive's tag row by the old code strands that row when its tags are edited or it is purged, because those paths sweep only `file.drive`.
Impact: On a database that had cross-drive moves before this fix, editing such a file's tags or purging it leaves a tag on the old drive listed with count 0. The row stays until something else sweeps that drive. The sweep added in this commit covers only the next cross-drive move, and the known-issues text no longer describes the purge case.
Evidence: `backend/app/services/fileops.py:697-701` (`physical_delete`) and `backend/app/routers/files.py:817-818` sweep the file's current drive only. `backend/app/routers/drives.py:814-819` keeps rows with no linked file in the listing. `tagops.py:45-46` returns early for a same-drive move, so that path repairs nothing. `tagops.py:54` and `tagops.py:61-62` are the only multi-drive sweep. `TestMoveSweepsEveryDriveTheTagsCameFrom` exercises only a cross-drive move.
Repro: not_reproduced (read-only review; derived from the code). Steps: link a file on drive B to a `Tag` on drive A, as the old code left it, and make that file the row's only user. Trash and purge the file, or `PUT` its tags with a different list. Expected from the code: A's tag list still has the row, with count 0.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> A one-time startup repair of links whose `Tag.drive` differs from `File.drive` would remove this whole class. Sweeping the old rows' drives in the tag-edit and purge paths is the narrower option.

</details>

### claude-read:exact-name-row-passed-over-for-older-variant — bucket B, LOW, open

Claim: retarget_file_tags keys the destination only by the lowered name and keeps the oldest row, so a file whose exact tag name exists on the destination is attached to a differently spelled older row instead.
Impact: A file tagged `übung` moved to a drive holding an older `Übung` and a newer `übung` silently becomes `Übung`, although its own spelling has a row there. The counts shift between the two rows and the file's displayed tag changes. Both rows can exist on one drive through normal tagging when `Übung` was created first, because replace_file_tags then misses it for `übung`.
Evidence: backend/app/services/tagops.py:52-53 uses setdefault in Tag.id order, and tagops.py:59 looks up only by the lowered key, with no exact-name preference. The pinned test test_a_destination_holding_two_variants_resolves_to_the_older_row (backend/tests/test_move_tags_follow_drive.py:208-217) moves `alpha` where only `Alpha` and `ALPHA` exist, so it never has an exact row to choose. Coexistence comes from backend/app/routers/files.py:162, :167-168.
Repro: not_reproduced (read-only review). Steps: on drive B, PUT tags `Übung` on one file, then `übung` on another, which gives two rows. On drive A, tag a file `übung` and move it to B. Expected from the code: B lists `Übung` 2 and `übung` 1, and the moved file shows `Übung`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Look up the exact name on the destination first and fall back to the lowered key only when no exact row exists.

</details>

### claude-read:variant-row-on-destination-stranded-by-return-move — bucket B, LOW, open

Claim: retarget_file_tags excludes the destination from its sweep, so a stale-linked file moved back to the drive of its old row can leave that row attached to nothing when the name resolves to an older case variant.
Impact: A file moved by the old code and now moved back can leave the destination's tag list showing a row with count 0. The next tag edit that sweeps that drive removes it, so the effect is cosmetic and temporary. It is an exception to the known-issues statement that the next move sweeps the old rows.
Evidence: backend/app/services/tagops.py:61 sweeps left_drives - {dst_drive}. tagops.py:53 and :59 can resolve the file's row to a different, older row on dst_drive, so the row it left is on dst_drive and is not swept. backend/app/routers/drives.py:817-820 lists rows with no files. test_stale_links_to_a_third_drive_are_swept (backend/tests/test_move_tags_follow_drive.py:254-280) covers a stale link only to a drive other than the destination.
Repro: not_reproduced (read-only review). Steps: seed drive B with `Übung` on another file and a newer `übung`. Link a file on drive A only to B's `übung`, as the old code left it. Move that file to B. Expected from the code: B lists `Übung` 2 and `übung` 0.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Sweep the destination drive too, after the file's tags are reassigned, and add this state as a test.

</details>

## Not verified

- claude-deep: Nothing was executed. F1, F2 and F3 come from reading the code, and the commit's claim that the three r1 cases reproduced as failing tests was not checked.
- claude-deep: SQLite's ASCII-only `lower()` rests on the absence of a `create_function` registration in `backend/app` and on the known-issues note; the SQLite build in the image was not inspected.
- claude-deep: The frontend sending the full tag list on an edit, which is the UI route into F2. I relied on the rule in design-decisions.md that saves go through `saveFileTags` and did not read that code.
- claude-deep: How often the knowledge scanner re-projects a moved note, and how it reacts to a failed tag post beyond the status check in `addons/knowledge/app/internal_client.py:240`.
- claude-deep: `_write_md_tags` before line 785 of `backend/app/routers/files.py`, and the remaining reads of tag data in addons beyond the grep results and the `tag_knn.py` lookup.
- claude-deep: The `/similar/{file_id}` known-issues claim: I confirmed the route exists at `addons/intelligence/app/routers/similar.py:17` but did not read its gating.
- claude-read: No test or code was run (read-only tools). All findings and mutation outcomes come from reading, including whether the new tests pass.
- claude-read: The IntegrityError path in replace_file_tags and merge_file_tags was traced by reading, not observed. The SQLite build was not inspected for ICU; the claim rests on no create_function in backend/app and the repository's own ASCII-only statements.
- claude-read: Whether _write_md_tags handles the same IntegrityError for Markdown files was not traced; the finding's repro uses a non-Markdown file.
- claude-read: Frontend tag-edit requests were taken from decisions.md and the replace semantics of the endpoint, not read in frontend code.
- claude-read: The knowledge addon's handling of files.moved and addon use of tag rows beyond the grep matches were not read in full.
- claude-read: The batch performance cost was estimated, not measured.
- claude-verify: Nothing was executed: all six records come from reading the code, so the IntegrityError and the response codes were not observed.
- claude-verify: Whether the SQLite build in the deployed image has ICU; this rests on no registration in backend/app and on known-issues.md:204.
- claude-verify: The old retarget code was read only through the quotes in the r1 triage, and no git diff was available.
- claude-verify: Addon code that may call the tag helpers or read tag rows, and the frontend tag and filter requests, were not read.
- claude-verify: How often the scanner or knowledge addon re-posts tags through internal.py:165-166.

TOTAL: 6 findings
