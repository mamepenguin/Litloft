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

## Needs a human

### unspecified_behavior

Note: The tag filter is now scoped to the listed drive's Tag rows, so stale-linked files drop out of the listing. This rests on no SPEC or UNSPEC statement that covers stale links.; Coexisting variants in one drive: each sidebar row shows its own count (`Übung` 1, `übung` 1) while choosing either lists both files (2 items). The UNSPEC at test_tag_name_matching.py:56 states the listing rule, and no rule states the count disagreement; decisions.md step 7 observed it.; A case-variant name on a note renames the one shared row for all files in the drive, while batch tagging a non-Markdown file keeps the existing spelling. A batch mixing .md and other files therefore treats the same request differently. This matches the existing ASCII behaviour and is newly reachable for non-ASCII names.; Matching uses Python str.lower(), not casefold: `STRASSE` and `straße` stay different tags, and Greek final sigma makes `ΣΑΣ` lower to `σας`, which differs from `σασ`. Tests pin only the lower() rule.
- claude-read: The tag filter is now scoped to the listed drive's Tag rows, so stale-linked files drop out of the listing. This rests on no SPEC or UNSPEC statement that covers stale links.
- claude-read: Coexisting variants in one drive: each sidebar row shows its own count (`Übung` 1, `übung` 1) while choosing either lists both files (2 items). The UNSPEC at test_tag_name_matching.py:56 states the listing rule, and no rule states the count disagreement; decisions.md step 7 observed it.
- claude-read: A case-variant name on a note renames the one shared row for all files in the drive, while batch tagging a non-Markdown file keeps the existing spelling. A batch mixing .md and other files therefore treats the same request differently. This matches the existing ASCII behaviour and is newly reachable for non-ASCII names.
- claude-read: Matching uses Python str.lower(), not casefold: `STRASSE` and `straße` stay different tags, and Greek final sigma makes `ΣΑΣ` lower to `σας`, which differs from `σασ`. Tests pin only the lower() rule.
- claude-verify: A file with a stale link to another drive's Tag row shows a chip for that tag, but the chip's ?tag= listing on the file's own drive leaves the file out. Neither a test nor known-issues.md:74-78 records this.
- claude-verify: A cross-drive move removes rows on the destination that were already unreferenced when the moved file holds a stale link to that drive. Only the one test at test_tag_name_matching.py:167-180 records this.

### unspecified_behavior

Note: A file with a stale link to another drive's Tag row shows a chip for that tag, but the chip's ?tag= listing on the file's own drive leaves the file out. Neither a test nor known-issues.md:74-78 records this.; A cross-drive move removes rows on the destination that were already unreferenced when the moved file holds a stale link to that drive. Only the one test at test_tag_name_matching.py:167-180 records this.
- claude-read: The tag filter is now scoped to the listed drive's Tag rows, so stale-linked files drop out of the listing. This rests on no SPEC or UNSPEC statement that covers stale links.
- claude-read: Coexisting variants in one drive: each sidebar row shows its own count (`Übung` 1, `übung` 1) while choosing either lists both files (2 items). The UNSPEC at test_tag_name_matching.py:56 states the listing rule, and no rule states the count disagreement; decisions.md step 7 observed it.
- claude-read: A case-variant name on a note renames the one shared row for all files in the drive, while batch tagging a non-Markdown file keeps the existing spelling. A batch mixing .md and other files therefore treats the same request differently. This matches the existing ASCII behaviour and is newly reachable for non-ASCII names.
- claude-read: Matching uses Python str.lower(), not casefold: `STRASSE` and `straße` stay different tags, and Greek final sigma makes `ΣΑΣ` lower to `σας`, which differs from `σασ`. Tests pin only the lower() rule.
- claude-verify: A file with a stale link to another drive's Tag row shows a chip for that tag, but the chip's ?tag= listing on the file's own drive leaves the file out. Neither a test nor known-issues.md:74-78 records this.
- claude-verify: A cross-drive move removes rows on the destination that were already unreferenced when the moved file holds a stale link to that drive. Only the one test at test_tag_name_matching.py:167-180 records this.

## Findings

A: 0
B: 3
C: 0

### claude-read:list-filter-drops-stale-linked-files — bucket B, MEDIUM, open

Claim: The tag filter in list_drive_files now matches only Tag rows of the listed drive, so a file whose tag link still points at another drive's row is silently left out of a tag listing it used to appear in.
Impact: On a database with cross-drive moves made before the tag-follows-drive fix (known-issues.md:74 says these links stay and no migration exists), a file on drive B linked to drive A's row `trip` still shows the chip `trip`. Choosing `trip` on B (`?tag=trip`, the `tag:trip` search operator, or the sidebar row if B has its own `trip` row) used to list that file and now omits it with no error. For ASCII names this is a regression; non-ASCII names did not match this way before.
Evidence: backend/app/routers/drives.py:719 restricts the id lookup to `Tag.drive == drive_name`; drives.py:723 filters on those ids only. The removed code was `File.tags.any(func.lower(Tag.name) == name.lower())`, with no drive condition, while drives.py:684 restricts only the file to the drive. frontend/src/components/folder/useFolderFiles.ts:193 passes `tag:` search operators to this filter. No test seeds a file on the listed drive linked to another drive's row.
Repro: not_reproduced (read-only review). Predicted steps: seed a File on SRC, append Tag(name='trip', drive=DST) to it, commit, GET /api/drives/SRC/files?tag=trip. At the parent commit the file is listed; at c317e9de1 the result is empty. Optionally add a SRC row `trip` on another file: the parent lists both files, this commit lists one.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide which behaviour is wanted. Either match the names of the rows the files actually hold, for example by collecting matching ids without the drive condition, or keep the drive scope, add a test for it, and extend the known-issues entry to say such a file is not listed under that tag on its current drive.

</details>

### claude-read:drive-scope-test-cannot-fail — bucket B, LOW, open

Claim: test_another_drives_tag_is_not_listed does not exercise the new `Tag.drive == drive_name` condition, so the drive scoping of the tag filter is effectively untested.
Impact: The only test named for this rule stays green whether or not the scoping exists, so the behaviour change in list-filter-drops-stale-linked-files, or a later removal of the scope, passes the suite unnoticed.
Evidence: backend/tests/test_tag_name_matching.py:80-86 seeds the `übung` file on DST and lists SRC. backend/app/routers/drives.py:684 already excludes that file through `File.drive == drive_name`, regardless of which Tag rows are matched.
Repro: not_reproduced (no shell). Predicted mutation: delete `.filter(Tag.drive == drive_name)` at drives.py:719. The test still passes, because the DST file never enters the query and the SRC file still matches through its own row.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Seed a file on the listed drive that is linked to another drive's row and assert the intended result.

</details>

### claude-read:move-now-sweeps-destination-drive-orphans — bucket B, INFO, open

Claim: retarget_file_tags now also sweeps the destination drive when the moved file held a stale link to it, deleting every unreferenced Tag row there and not only the row the file left.
Impact: Moving such a file removes unrelated zero-count rows from the destination drive's tag list, and whether this happens depends on the file's stale links. The result is harmless in practice because other tag edits on a drive sweep the same way, so it is reported as a place the diff reaches beyond name matching and not as a data-loss defect.
Evidence: backend/app/services/tagops.py:88 builds left_drives from the file's old rows; tagops.py:98-99 now sweeps all of them, where the parent excluded dst_drive. backend/tests/test_tag_name_matching.py:167-180 pins this behaviour, including the removal of `leftover`, which the file never held.
Repro: not_reproduced as a run; the test at test_tag_name_matching.py:167-180 asserts the deletion of `leftover`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: No test or the application was run: this reviewer has only Read, Glob and Grep, so every behaviour and mutation prediction comes from reading.
- claude-read: The parent commit's listing of stale-linked files was inferred from the removed lines in the diff and not observed.
- claude-read: SQLAlchemy's handling of a duplicate object in a many-to-many list was not checked in its source; it is not reachable through current callers because names are deduped first.
- claude-read: How the addons read tag rows after a merge or rename (addons/intelligence workers) was only grepped, not read in full.
- claude-read: The frontend tag UI was only partly read; whether a chip click on a file leads to the tag filter was not confirmed.
- claude-verify: No test or mutant was run, because only Read, Glob and Grep were available; every result comes from tracing the code.
- claude-verify: The parent code was read from the sibling checkout /Users/libre/Sources/video_share; I did not confirm that checkout is at origin/develop, or inspect git objects for the commit.
- claude-verify: The worktree's files were assumed to match commit c317e9de1; the only check was r1/head.txt naming that commit.
- claude-verify: How many stale links exist in a real database was not measured.
- claude-verify: The full bodies of the single-drive filter tests in test_api_tags.py and test_api_drives.py were not all read; their requests were found by grep.
- claude-verify: Frontend rendering of the chip and the search flow was not run in a browser.

TOTAL: 3 findings
