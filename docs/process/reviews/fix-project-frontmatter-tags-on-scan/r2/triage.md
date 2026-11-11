# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-deep: Of the fix commits, 933ca488b and db7aa7e74 add only review records and change no code. c6c022417 is the one code round: it adds a `respell` mode to `replace_file_tags` (a new branch) and a savepoint with a stated prediction about what it flushes and confines (a new state), and it moves the scanner call without adding to it. With a single code round there is no repeated pattern across rounds of the same branch or state being added again, so the record does not yet show the design being patched. The new mode does create a warning sign: the spelling decision now differs per caller and is scoped by a flag, and F1 and F2 are cases that flag does not settle, so a further fix there that adds another flag or caller condition would be patching. No round removed a branch or state.
- claude-read: Only one round since r1 changes code: c6c022417. By their subjects, 933ca488 and db7aa7e7 only record documents, and their diffs were not supplied. c6c022417 adds a state, the `respell` keyword that gives replace_file_tags two modes, and a savepoint around the projection, and it moves the scanner's projection call ahead of the id write-back. It removes no branch. The round before r1 (6a3839fc7) added per-path call sites for upload, copy and create, which is a different kind of addition, so no mechanism has been added twice and this does not yet show the design being patched. The savepoint in one helper handles the flush hazards for all paths, with no per-path flush added. One thing to watch: reusing a case-variant row as it stands is now spelled in three places, retarget_file_tags, merge_file_tags and replace_file_tags(respell=False), and content writes keep the opposite rule, which is the source of R2-F1. If the next round adds another condition to `respell`, the design is being patched.

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

Note: A note's chip can now differ in case from its frontmatter from the moment it is registered: disk `python`, chip `Python`. The first chip edit rewrites the file to the row's spelling (frontend/src/lib/tags.ts:59-63), and a body-only save rewrites the row to the file's spelling (R2-F1). Which of the two wins depends on the next operation.; When one scan registers several notes with case variants of a new tag, the first note visited sets the row's spelling (test_scan_shares_new_tag_row_across_notes asserts only that the notes agree). The visiting order depends on the filesystem walk.; Registration projects only the first 10 valid tags (frontmatter.py:209-210), so a note with more shows only 10 chips, and the next chip edit writes that shorter list to the file. known-issues.md records this data loss for rejected tags but not for the cap.; Create parses the raw request body, so a CRLF frontmatter block is read as no frontmatter (frontmatter.py:110-112), while scan, upload and copy use read_text, which normalises line endings and projects it. Unchanged since the previous review.
- claude-deep: Three spelling rules now exist for one row: registration joins it as it stands, a move joins it as it stands through its own loop in `retarget_file_tags`, and a content PUT or internal post renames it. Whether a body-only save counts as a tag edit is not declared anywhere found.
- claude-deep: A chip can differ from its own note's frontmatter spelling for as long as the note is not chip-edited, and a chip edit then rewrites the note's spelling on disk (decisions.md third run steps 1 and 3). Which of the two a reader should treat as correct is not declared beyond frontmatter being canonical.
- claude-deep: A CRLF note is read through `read_text` on scan, upload and copy, which normalises line endings, so its tags are projected. `PUT content` parses the raw body, where `parse` reports no frontmatter (frontmatter.py:110-112), and `_write_md_tags` answers 422 (frontmatter.py:155-158). A CRLF note keeping its line endings can therefore get chips at registration and lose them on a raw save. An id write-back during a scan rewrites the file with LF, so this needs a note that already has an id or sits on a read-only drive.
- claude-deep: On a read-only drive the tags now project, while `md_id` and `md_aliases` still do not, because the OSError return at scanner.py:319-320 precedes both, so one note ends up with a partial projection and no log line.
- claude-read: A note's chip can now differ in case from its frontmatter from the moment it is registered: disk `python`, chip `Python`. The first chip edit rewrites the file to the row's spelling (frontend/src/lib/tags.ts:59-63), and a body-only save rewrites the row to the file's spelling (R2-F1). Which of the two wins depends on the next operation.
- claude-read: When one scan registers several notes with case variants of a new tag, the first note visited sets the row's spelling (test_scan_shares_new_tag_row_across_notes asserts only that the notes agree). The visiting order depends on the filesystem walk.
- claude-read: Registration projects only the first 10 valid tags (frontmatter.py:209-210), so a note with more shows only 10 chips, and the next chip edit writes that shorter list to the file. known-issues.md records this data loss for rejected tags but not for the cap.
- claude-read: Create parses the raw request body, so a CRLF frontmatter block is read as no frontmatter (frontmatter.py:110-112), while scan, upload and copy use read_text, which normalises line endings and projects it. Unchanged since the previous review.
- claude-verify: Which spelling wins when a note's frontmatter differs in case from its shared row is declared differently by the user guide (first spelling kept) and the design rules (frontmatter canonical), and differs by path: registration keeps the row, PUT and Markdown bulk rename it.
- claude-verify: project_frontmatter_tags' docstring at tagops.py:90 says 'Same rules as PUT /api/files/{id}/content', yet it passes respell=False while the PUT uses the default True.
- claude-verify: Create parses the raw body (drives.py:1014, :1100) while scan, upload and copy parse read_text output, which normalises line endings. frontmatter.py:149 says parse treats a CRLF block as no frontmatter, so a CRLF note sent to create gets no tags, and over a missing row loses its old ones, where the same bytes uploaded project tags. Browser-entered text is expected to be LF, so this needs an API caller or pasted bytes; not run.

### unspecified_behavior

Note: Which spelling wins when a note's frontmatter differs in case from its shared row is declared differently by the user guide (first spelling kept) and the design rules (frontmatter canonical), and differs by path: registration keeps the row, PUT and Markdown bulk rename it.; project_frontmatter_tags' docstring at tagops.py:90 says 'Same rules as PUT /api/files/{id}/content', yet it passes respell=False while the PUT uses the default True.; Create parses the raw body (drives.py:1014, :1100) while scan, upload and copy parse read_text output, which normalises line endings. frontmatter.py:149 says parse treats a CRLF block as no frontmatter, so a CRLF note sent to create gets no tags, and over a missing row loses its old ones, where the same bytes uploaded project tags. Browser-entered text is expected to be LF, so this needs an API caller or pasted bytes; not run.
- claude-deep: Three spelling rules now exist for one row: registration joins it as it stands, a move joins it as it stands through its own loop in `retarget_file_tags`, and a content PUT or internal post renames it. Whether a body-only save counts as a tag edit is not declared anywhere found.
- claude-deep: A chip can differ from its own note's frontmatter spelling for as long as the note is not chip-edited, and a chip edit then rewrites the note's spelling on disk (decisions.md third run steps 1 and 3). Which of the two a reader should treat as correct is not declared beyond frontmatter being canonical.
- claude-deep: A CRLF note is read through `read_text` on scan, upload and copy, which normalises line endings, so its tags are projected. `PUT content` parses the raw body, where `parse` reports no frontmatter (frontmatter.py:110-112), and `_write_md_tags` answers 422 (frontmatter.py:155-158). A CRLF note keeping its line endings can therefore get chips at registration and lose them on a raw save. An id write-back during a scan rewrites the file with LF, so this needs a note that already has an id or sits on a read-only drive.
- claude-deep: On a read-only drive the tags now project, while `md_id` and `md_aliases` still do not, because the OSError return at scanner.py:319-320 precedes both, so one note ends up with a partial projection and no log line.
- claude-read: A note's chip can now differ in case from its frontmatter from the moment it is registered: disk `python`, chip `Python`. The first chip edit rewrites the file to the row's spelling (frontend/src/lib/tags.ts:59-63), and a body-only save rewrites the row to the file's spelling (R2-F1). Which of the two wins depends on the next operation.
- claude-read: When one scan registers several notes with case variants of a new tag, the first note visited sets the row's spelling (test_scan_shares_new_tag_row_across_notes asserts only that the notes agree). The visiting order depends on the filesystem walk.
- claude-read: Registration projects only the first 10 valid tags (frontmatter.py:209-210), so a note with more shows only 10 chips, and the next chip edit writes that shorter list to the file. known-issues.md records this data loss for rejected tags but not for the cap.
- claude-read: Create parses the raw request body, so a CRLF frontmatter block is read as no frontmatter (frontmatter.py:110-112), while scan, upload and copy use read_text, which normalises line endings and projects it. Unchanged since the previous review.
- claude-verify: Which spelling wins when a note's frontmatter differs in case from its shared row is declared differently by the user guide (first spelling kept) and the design rules (frontmatter canonical), and differs by path: registration keeps the row, PUT and Markdown bulk rename it.
- claude-verify: project_frontmatter_tags' docstring at tagops.py:90 says 'Same rules as PUT /api/files/{id}/content', yet it passes respell=False while the PUT uses the default True.
- claude-verify: Create parses the raw body (drives.py:1014, :1100) while scan, upload and copy parse read_text output, which normalises line endings. frontmatter.py:149 says parse treats a CRLF block as no frontmatter, so a CRLF note sent to create gets no tags, and over a missing row loses its old ones, where the same bytes uploaded project tags. Browser-entered text is expected to be LF, so this needs an API caller or pasted bytes; not run.

### unspecified_behavior

Note: Three spelling rules now exist for one row: registration joins it as it stands, a move joins it as it stands through its own loop in `retarget_file_tags`, and a content PUT or internal post renames it. Whether a body-only save counts as a tag edit is not declared anywhere found.; A chip can differ from its own note's frontmatter spelling for as long as the note is not chip-edited, and a chip edit then rewrites the note's spelling on disk (decisions.md third run steps 1 and 3). Which of the two a reader should treat as correct is not declared beyond frontmatter being canonical.; A CRLF note is read through `read_text` on scan, upload and copy, which normalises line endings, so its tags are projected. `PUT content` parses the raw body, where `parse` reports no frontmatter (frontmatter.py:110-112), and `_write_md_tags` answers 422 (frontmatter.py:155-158). A CRLF note keeping its line endings can therefore get chips at registration and lose them on a raw save. An id write-back during a scan rewrites the file with LF, so this needs a note that already has an id or sits on a read-only drive.; On a read-only drive the tags now project, while `md_id` and `md_aliases` still do not, because the OSError return at scanner.py:319-320 precedes both, so one note ends up with a partial projection and no log line.
- claude-deep: Three spelling rules now exist for one row: registration joins it as it stands, a move joins it as it stands through its own loop in `retarget_file_tags`, and a content PUT or internal post renames it. Whether a body-only save counts as a tag edit is not declared anywhere found.
- claude-deep: A chip can differ from its own note's frontmatter spelling for as long as the note is not chip-edited, and a chip edit then rewrites the note's spelling on disk (decisions.md third run steps 1 and 3). Which of the two a reader should treat as correct is not declared beyond frontmatter being canonical.
- claude-deep: A CRLF note is read through `read_text` on scan, upload and copy, which normalises line endings, so its tags are projected. `PUT content` parses the raw body, where `parse` reports no frontmatter (frontmatter.py:110-112), and `_write_md_tags` answers 422 (frontmatter.py:155-158). A CRLF note keeping its line endings can therefore get chips at registration and lose them on a raw save. An id write-back during a scan rewrites the file with LF, so this needs a note that already has an id or sits on a read-only drive.
- claude-deep: On a read-only drive the tags now project, while `md_id` and `md_aliases` still do not, because the OSError return at scanner.py:319-320 precedes both, so one note ends up with a partial projection and no log line.
- claude-read: A note's chip can now differ in case from its frontmatter from the moment it is registered: disk `python`, chip `Python`. The first chip edit rewrites the file to the row's spelling (frontend/src/lib/tags.ts:59-63), and a body-only save rewrites the row to the file's spelling (R2-F1). Which of the two wins depends on the next operation.
- claude-read: When one scan registers several notes with case variants of a new tag, the first note visited sets the row's spelling (test_scan_shares_new_tag_row_across_notes asserts only that the notes agree). The visiting order depends on the filesystem walk.
- claude-read: Registration projects only the first 10 valid tags (frontmatter.py:209-210), so a note with more shows only 10 chips, and the next chip edit writes that shorter list to the file. known-issues.md records this data loss for rejected tags but not for the cap.
- claude-read: Create parses the raw request body, so a CRLF frontmatter block is read as no frontmatter (frontmatter.py:110-112), while scan, upload and copy use read_text, which normalises line endings and projects it. Unchanged since the previous review.
- claude-verify: Which spelling wins when a note's frontmatter differs in case from its shared row is declared differently by the user guide (first spelling kept) and the design rules (frontmatter canonical), and differs by path: registration keeps the row, PUT and Markdown bulk rename it.
- claude-verify: project_frontmatter_tags' docstring at tagops.py:90 says 'Same rules as PUT /api/files/{id}/content', yet it passes respell=False while the PUT uses the default True.
- claude-verify: Create parses the raw body (drives.py:1014, :1100) while scan, upload and copy parse read_text output, which normalises line endings. frontmatter.py:149 says parse treats a CRLF block as no frontmatter, so a CRLF note sent to create gets no tags, and over a missing row loses its old ones, where the same bytes uploaded project tags. Browser-entered text is expected to be LF, so this needs an API caller or pasted bytes; not run.

## Findings

A: 0
B: 5
C: 0

### claude-deep:F1-unattended-respell-survives-on-other-projections — bucket B, MEDIUM, open

Claim: `respell=False` covers only registration, so the frontmatter projections through `PUT /api/files/{id}/content` and the knowledge scanner's internal tag route still rename a shared Tag row to one note's case variant.
Impact: The registration fix now deliberately leaves notes whose frontmatter spelling differs from the row. Saving a body-only edit to such a note changes the chip on every other note that carries the tag, and the next chip edit on those notes writes the new spelling to disk. With the knowledge addon running, its projection of frontmatter tags should reach the same rename with no user action, which would undo what registration kept. In a deployment with that addon, r1's unattended respelling would then return one step later.
Evidence: backend/app/routers/files.py:1617 and backend/app/routers/internal.py:165 call `replace_file_tags` without `respell`, and the default at backend/app/services/tagops.py:50 is True. docs/ADDON-DEVELOPMENT.md:531 says the internal route is used by the knowledge scanner to project frontmatter tags. decisions.md third run step 4 observed a PUT with a changed spelling rename the row and change the chips of a.md, b.md and c.md, while step 1 records b.md keeping `python` on disk against row `Python`. All R-5 runs record knowledge as absent. No test sends a body-only PUT for a note whose spelling differs from its row, or posts a case variant to the internal route and asserts another note's chip.
Repro: not_reproduced (read-only reviewer; addon code is absent from this worktree). From reading: a.md has `tags: [Python]`; b.md with `tags: [python]` registers and joins row `Python`; PUT b.md's content with only its body changed; files.py:1617 passes `python` with respell=True, and tagops.py:78-82 renames the row, so a.md's chip reads `python`. Whether the knowledge scanner posts a new note's tags unchanged was not verified.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Use `respell=False` on the internal route, and rename on a content PUT only when that note's frontmatter spelling changed from what its previous content said.

</details>

### claude-deep:F2-joined-row-overrides-the-only-carriers-new-spelling — bucket B, LOW, open

Claim: An upload or create over a missing row joins the row's own old case variant and keeps that spelling, even when no other note carries the tag.
Impact: Replacing a missing note that was the only carrier of `Alpha` with a note saying `alpha` shows chip `Alpha`, though no other note's chip needed protecting. The next chip edit silently rewrites the new file's frontmatter to `Alpha`, so the projection overrides the file that the rules call canonical.
Evidence: backend/app/services/tagops.py:71-78 reads the index while the reused row still links its old tags, and with respell=False it keeps the folded match. The orphan sweep runs only afterwards at backend/app/services/upload.py:324 and backend/app/routers/drives.py:893. .claude/rules/design-decisions.md:62 makes frontmatter canonical for `.md`. decisions.md third run step 3 observed a chip add rewriting a note's disk spelling to the row's. TestReusedRow in backend/tests/test_frontmatter_tags_on_create.py uses `stale` against `Alpha, beta`, whose names do not fold together.
Repro: not_reproduced. From reading: seed a missing `n.md` whose only tag row is `Alpha`, carried by no other file, then upload `n.md` with `tags: [alpha]`. Expected from the code: chip `Alpha`, file on disk `alpha`, and after a chip add, file on disk `Alpha`.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> When a reused row's tags are replaced, release its old links and flush them before resolving names, or respell a row whose only carrier is this file.

</details>

### claude-deep:F3-upload-skip-branch-still-keeps-stale-tags — bucket B, LOW, open

Claim: Uploading a non-UTF-8 or over-limit `.md` over a reused row still skips projection with a bare `pass` or a false size guard, so the row keeps the old content's tags and logs nothing.
Impact: Chips and tag filter results describe content that no longer exists. Round r1's F5 is unchanged: the new non-UTF-8 test covers only a new row, which has no old tags to go stale.
Evidence: backend/app/services/upload.py:321 is the size guard and upload.py:325-326 the silent `pass`, with the row reused at upload.py:278-301. backend/tests/test_frontmatter_tags_on_create.py `test_upload_of_non_utf8_note_succeeds_without_tags` starts with no row at that path. backend/app/routers/files.py:1620-1625 logs the equivalent PUT case. No test in the changed files uploads an over-limit note.
Repro: not_reproduced. From reading: a missing row n.md with tag `stale`, then an upload of n.md whose body has invalid UTF-8; the row is revived with `stale` attached. Mutation by reasoning: removing the size guard at upload.py:321 survives the changed test files.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Log the skip, and decide and test what a reused row whose new content cannot be read does with its old tags.

</details>

### claude-deep:F4-copy-size-limit-still-differs — bucket B, LOW, open

Claim: Copy still projects tags only up to 1,000,000 bytes while scan, upload and create accept up to 1,048,576 bytes, so a note in that gap loses its chips on copy.
Impact: A note between 1,000,001 and 1,048,576 bytes shows chips on the source and none on its copy, with no log line, and no later scan projects them because the row already exists. Rare, because it needs a note of nearly 1 MB. Round r1's F4 is unchanged.
Evidence: backend/app/services/fileops.py:38 uses `1_000_000`; backend/app/services/scanner.py:284 and backend/app/services/upload.py:321 use `_MD_READ_MAX_BYTES`, and backend/app/routers/drives.py:885 allows 1 MiB on create. backend/app/services/fileops.py:334-336 skips the projection when the read returns None. No test covers the boundary.
Repro: not_reproduced. From reading: create a 1,020,000-byte `.md` with `tags: [a]`, then copy it; the source has chip `a` and the copy has none.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Use one shared limit constant for all Markdown projection reads.

</details>

### claude-read:R2-F1-later-save-still-respells-shared-row — bucket B, LOW, open

Claim: A note registered with a case-variant spelling now keeps that spelling on disk while it joins the existing row, and its first body-only save or bulk add of any tag renames the shared row to the disk spelling, so other notes' chips change on an operation that did not edit that tag.
Impact: With A and C spelled `Python` and a new note B spelled `python`, registration leaves every chip `Python`. Editing only B's body, or bulk-adding an unrelated tag to B, turns every chip on the drive into `python`. Saving A's body then turns them back to `Python`. The user is not told. The fix stops the rename at registration, but the same surprise arrives at B's next write.
Evidence: backend/app/routers/files.py:1616-1617 projects PUT content through replace_file_tags with the default respell=True. backend/app/routers/files.py:721 and :756 do the same after a bulk merge, reached from files.py:399 with the disk spelling kept by _merged_tag_list (files.py:692-693). tagops.py:78-82 performs the rename. The non-Markdown batch rule keeps the spelling (backend/tests/test_tag_name_matching.py:131-139), so the two paths disagree. The new tests in backend/tests/test_scanner_md_id.py:178-192 stop at registration and make no later write.
Repro: not_reproduced (read-only reviewer). Traced by reading: row `Python` on note a.md; register n.md with `tags: [python]`, and n.md joins `Python`; PUT /api/files/{n}/content with the same frontmatter and a changed body; index.get('python') returns the folded row, respell defaults to True, and a.md's chip reads `python`.
Introduced: pre-existing
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Rename a row on a content write only when this note's own frontmatter spelling of that tag changed compared with the previous content; otherwise pass respell=False.

</details>

## Not verified

- claude-deep: No test, mutation or application run was performed, because this reviewer has read-only tools. Every repro is reasoned from code or quoted from decisions.md.
- claude-deep: SQLAlchemy and pysqlite behaviour was read from memory and not observed: savepoint rollback expiry, a failed flush at `begin_nested` entry, and RELEASE of an outermost savepoint.
- claude-deep: Addon code under addons/ is absent from this worktree, so what the knowledge scanner posts, when, and for which notes was not read. That part of F1 rests on docs/ADDON-DEVELOPMENT.md:531.
- claude-deep: The JPEG work inside `project_markdown_thumbnail` was read only as far as markdown_images.py:395, and its duration under the write lock was not measured.
- claude-deep: The frontend's `saveFileTags` and editor line-ending behaviour were not read, so how a CRLF note behaves through the UI is unconfirmed.
- claude-deep: R-5 observations in decisions.md were not independently repeated. Files were read from the working tree and assumed to match commit db7aa7e74.
- claude-read: No code, test or mutation was run; every statement about SQLAlchemy savepoints, pysqlite and test outcomes comes from reading the code and from recalled library behaviour.
- claude-read: decisions.md and the docs commits 933ca488 and db7aa7e7 were not read, so I treat them as documentation by their subjects and do not know whether the still-open earlier findings were deliberately accepted.
- claude-read: Addon code, including the knowledge scanner's reconciliation of File.tags and its own spelling of a tag, was not read.
- claude-read: The frontend editor's autosave path was not traced beyond frontend/src/lib/tags.ts, so how often a body save reaches PUT content in R2-F1 is assumed.
- claude-read: project_markdown_thumbnail's run time and the actual lock contention on copy were not measured.
- claude-read: Behaviour on a real read-only mount was not observed; the tests simulate it with an OSError.
- claude-verify: No code or test was executed, because this verifier has only Read, Glob and Grep; every confirmation comes from reading code and decisions.md, whose R-5 observations were not repeated.
- claude-verify: addons/ holds no Python code in this worktree, so the knowledge scanner's actual calls to the internal tag route and its reconciliation were not read.
- claude-verify: The commit diff could not be read, so the working tree was assumed to match db7aa7e74, and which lines were introduced was not checked against origin/develop.
- claude-verify: Scanner recovery of a missing row whose file returns with changed content was not traced.
- claude-verify: Test files were searched by pattern rather than read in full, apart from those cited, so a test using other names for a case-variant write could have been missed.
- claude-verify: Frontend callers of the batch tag route and the knowledge editor's save path were not read.

TOTAL: 5 findings
