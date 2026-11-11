# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks
- R-5 ran at 2a5a6c207d056a28eb7f23925f6521d70e3e3ae1, and these files changed since: backend/app/routers/drives.py; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-read: Only one round of fixes exists, so no round can repeat what an earlier fix round added. Commit 91d0b7b65 records the r1 review and changes no code. Commit e49e4dba7 removes a state rather than adding one: it deletes the `Tag.drive == drive_name` narrowing from the filter's name lookup and adds no branch to the code. It adds one test and a comment recording a prediction about stale links. The design is not being patched on this evidence.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior

## Needs a human

### unspecified_behavior

Note: On a database with stale links, a drive's sidebar count and its listing disagree. On drive B, the row `trip` counts only files linked to B's row (drives.py:829) while choosing it also lists files linked to A's `trip` (drives.py:722-726). On drive A, the row counts the file now sitting on B because list_drive_tags has no File.drive condition, while choosing it omits that file (drives.py:684). The listing half is the parent's behaviour restored; known-issues.md:74-78 records only the count half.; Coexisting variants in one drive still show separate counts while choosing either lists the files of both, as r1 noted and decisions.md step 7 observed. The fix commits did not change or specify this.; A case-variant name on a note renames the shared row (files.py:164-168) while batch tagging a non-Markdown file keeps the existing spelling (files.py:192), so one batch mixing both treats the same request differently. Unchanged since r1.; Matching uses Python str.lower(), not casefold, so `STRASSE` and `straße` stay different tags. Unchanged since r1 and pinned only for lower().
- claude-read: On a database with stale links, a drive's sidebar count and its listing disagree. On drive B, the row `trip` counts only files linked to B's row (drives.py:829) while choosing it also lists files linked to A's `trip` (drives.py:722-726). On drive A, the row counts the file now sitting on B because list_drive_tags has no File.drive condition, while choosing it omits that file (drives.py:684). The listing half is the parent's behaviour restored; known-issues.md:74-78 records only the count half.
- claude-read: Coexisting variants in one drive still show separate counts while choosing either lists the files of both, as r1 noted and decisions.md step 7 observed. The fix commits did not change or specify this.
- claude-read: A case-variant name on a note renames the shared row (files.py:164-168) while batch tagging a non-Markdown file keeps the existing spelling (files.py:192), so one batch mixing both treats the same request differently. Unchanged since r1.
- claude-read: Matching uses Python str.lower(), not casefold, so `STRASSE` and `straße` stay different tags. Unchanged since r1 and pinned only for lower().

## Findings

A: 0
B: 1
C: 0

### claude-verify:claude-verify:stale-docstring-quotes-removed-predicate — bucket B, INFO, open

Claim: The class docstring of TestFolderScopedTagCountAgreement still quotes the removed SQL predicate `func.lower(Tag.name) == tag.lower()` as how list_drive_files matches tags.
Impact: Documentation only: a reader of the test is pointed at a predicate that no longer exists. The docstring's conclusion still holds, since case-variant rows do make the sidebar count smaller than the listing. No runtime or test effect.
Evidence: backend/tests/test_api_tags.py:266-269 quotes the predicate. backend/app/routers/drives.py:721-727 now folds in Python and filters with `File.tags.any(Tag.id.in_(by_fold[name.lower()]))`. A grep for `func.lower(...Tag|...name)` under backend finds only this docstring as a Tag-name use.
Repro: not_reproduced as a run (no shell); confirmed by reading both locations.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Reword the docstring to say the listing matches by Python lower-casing across same-name rows, without quoting the old expression.

</details>

## Not verified

- claude-read: No test, mutant or application was run: this reviewer has only Read, Glob and Grep, so every behaviour and mutation result is predicted from reading.
- claude-read: The worktree was assumed to match commit e49e4dba7; git objects were not inspected and the parent's code was taken from the supplied diffs.
- claude-read: SQLAlchemy's rendering of an empty IN inside File.tags.any was not read in its source; it was inferred from existing tests that list by an unknown tag.
- claude-read: How many stale links exist in a real database was not measured.
- claude-read: The frontend chip and search flows were not read or run for this review; their reach to the filter is taken from the r1 record.
- claude-read: The addons' raw SQL that reads tags was only grepped, not read in full.
- claude-verify: No test or mutant was run, because only Read, Glob and Grep were available; every result comes from tracing the code.
- claude-verify: The worktree's files were assumed to match commit e49e4dba7 based on the session's git status; git objects were not inspected, and the parent code's form comes from the r1 triage text.
- claude-verify: SQLAlchemy's emitted SQL for an empty `Tag.id.in_([])` was not checked in its source or by running it.
- claude-verify: Tag names in different Unicode normal forms (NFC against NFD) were not traced through the tag write paths; the tag filter at drives.py:715 applies no normalisation, unlike the search at drives.py:701.
- claude-verify: Addon code that reads Tag rows (addons/knowledge and addons/intelligence) was only grepped, not read in full.
- claude-verify: The frontend tag UI was not read or run in a browser.

TOTAL: 1 findings
