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

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 3
C: 0

### claude-read:F1-regenerate-update-text-clearing-untested — bucket B, MEDIUM, open

Claim: No test exercises the new regenerate UPDATE branch on a row that actually holds short/long text, so the columns that make regeneration happen can be dropped from the UPDATE with every test still green.
Impact: The most common regenerate case, a file with both a short and a detailed summary, could regress unnoticed: 'Create again' returns 200, the worker's _has_summary sees the old text and skips, and the user silently keeps the old summary with no error.
Evidence: addons/intelligence/app/routers/summaries.py:296-297 clears short_summary and long_summary. The only real-DB regenerate test is tests/test_summaries_edit.py test_regenerate_keeps_the_detailed_summary (call at line 301). It seeds through _mark_detailed_only(engine, short=""), which already sets short_summary='', long_summary='' and status='hidden', and asserts only detailed_status, edited_at and short_original. tests/test_llm_routing_callers.py lines 469-472 and 497-500 use a recording fake and check only startswith('UPDATE file_summaries SET'). The worker skip is at app/workers/summaries.py:557-567 and 1382-1385.
Repro: not_reproduced (read-only reviewer; traced by reading, not run). Mutation: remove "short_summary = '', long_summary = '', " and/or "status = 'hidden'" and/or 'long_original = NULL' from the UPDATE at summaries.py:296-300. Predicted result: all tests stay green, because the seeded row already has those values or the column is not asserted. The commit's R-5 record in decisions.md covers this path manually at one SHA, not as a regression test.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a real-DB test that calls _mark_detailed_only(engine, short="AI short") with a non-empty long_summary and status='generated', calls regenerate_summary, and asserts short_summary == '', long_summary == '', status == 'hidden', long_original is None and detailed_status == 'generated'.

</details>

### claude-read:F2-regenerate-delete-branch-only-prefix-checked — bucket B, LOW, open

Claim: The DELETE branch for rows without a detailed summary is covered only by a fake-session check that discards its WHERE clause, so a wrong predicate that stops the row being deleted passes the tests.
Impact: A short-only file, whose 'Create again' path the old exact-SQL assertion pinned, could silently stop regenerating: the row survives, the worker skips the file and the old summary stays.
Evidence: addons/intelligence/app/routers/summaries.py:305-311. tests/test_llm_routing_callers.py:469-471 and 497-499 changed from an exact SQL match to sql.split(" WHERE ")[0], which drops the predicate. tests/test_summaries_edit.py test_regenerate_keeps_the_detailed_summary uses a row with detailed_status='generated', so it never exercises a row where detailed_status is NULL. Grep of addons/intelligence/tests finds regenerate_summary called against a real DB only at test_summaries_edit.py:301.
Repro: not_reproduced (traced by reading, not run). Mutation: change 'detailed_status IS NULL' at summaries.py:308 to "detailed_status = ''". Predicted result: the prefix assertions still pass and the keep-detailed test still passes, while a short-only row is no longer deleted.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a real-DB regenerate test on the seeded row with detailed_status NULL that asserts the row is gone and the worker was enqueued.

</details>

### claude-read:F3-batch-reports-queued-for-image-placeholder-rows — bucket B, LOW, open

Claim: Batch classification now counts a file with only a vision placeholder row as missing a summary, so an image previously reported as skipped is reported as queued although the worker never generates anything for it.
Impact: Running 'Create AI summaries' on a folder containing described images can report 'Added N summaries to the queue' on every run instead of 'All files already have summaries', and nothing appears for those files.
Evidence: app/workers/vision.py:266-272 inserts a row with short_summary=''. app/routers/summaries.py:539-540 now excludes that row from 'existing', and lines 554-559 enqueue it because the router has no file-type filter. app/workers/summaries.py:1397-1401 then returns without work because _classify_file_type returns None for images. Images with no row at all already behaved this way, so this widens an existing inaccurate count to images that have a vision row rather than creating a new class of it.
Repro: not_reproduced. Predicted steps: describe an image so it has a vision row, then POST /batch/summaries with its file_id. Predicted response: queued 1, skipped 0, on every repeat, with no summary written. Whether the folder menu's caller filters fileIds by type before calling batchSummaries was not established, so this may not be reachable from the UI.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: No test or mutation was executed; every 'survives' prediction comes from reading the code and tests only.
- claude-read: Whether the callers of FolderAIActionsMenuItems filter fileIds by file type before batchSummaries (affects whether F3 is reachable from the UI).
- claude-read: The context of the regenerate URL test at tests/test_llm_routing_callers.py:937 was not read beyond the grep line.
- claude-read: Whether another addon, such as knowledge, consumes GET /summary's available flag; the knowledge addon is not checked out in this tree.
- claude-read: The R-5 record in decisions.md was read as a claim; its screenshots and logs were not inspected.
- claude-read: Concurrent detailed generation during regenerate was not analysed, since artificial timing is out of scope.
- claude-verify: No test or mutant was run; this verifier has read-only tools, so survival of the mutants is traced by reading the tests.
- claude-verify: The base revision was not diffed, so the prior batch behaviour in F3 is inferred rather than read from origin/develop.
- claude-verify: Whether fileIds is narrowed by type earlier in FolderAIActionsMenuItems.tsx, above line 85, was not read.
- claude-verify: Concurrent regenerate during an in-flight detailed generation was not examined.

TOTAL: 3 findings
