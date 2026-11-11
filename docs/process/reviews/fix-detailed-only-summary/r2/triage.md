# Triage: r2

## Warnings

- core.hooksPath is '/Users/libre/Sources/video_share/.githooks', so the pre-push hook in .githooks does not run in this clone; fix: git config core.hooksPath .githooks

## Trajectory

This run:
- claude-read: No. Round r1 to r2 consists of 7fa10a00f, which only records the r1 review documents, and bac2b2ac4, which pins the submodule at a commit changing only tests. Neither adds a production branch, state or prediction. bac2b2ac4 replaces the WHERE-discarding prefix assertions with exact SQL pins and replaces one regenerate test with three parametrized cases, adding test cases only. The fix diffs show no sign of the design being patched, and they removed no production branch either.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 1
C: 0

### claude-read:F3-batch-reports-queued-for-image-placeholder-rows — bucket B, LOW, open

Claim: Batch classification counts a file whose only file_summaries row is a vision placeholder as missing a summary, so it is reported as queued although the worker generates nothing for an image; the r2 fix commits did not touch this r1 finding.
Impact: Running 'Create AI summaries' on a folder containing described images can report 'Added N summaries to the queue' on every run instead of 'All files already have summaries', and no summary appears for those images. There is no data damage and no LLM cost.
Evidence: addons/intelligence/app/workers/vision.py:268 inserts the placeholder row. app/routers/summaries.py:539-540 excludes rows with empty short text from 'existing', and lines 554-559 enqueue without a file-type check. app/workers/summaries.py:367-369 classifies images as None and line 1400 returns without work. New since r1: frontend/src/components/FolderBrowser.tsx:590 passes files.map((f) => f.id) with no filter at that call site, and addons/intelligence/frontend/FolderAIActionsMenuItems.tsx:115 sends fileIds unchanged. That supports UI reachability, although typeFilter handling of the loaded list and the prop's path to the slot were not traced. Images with no row already behaved this way before the change.
Repro: not_reproduced (read-only reviewer). Predicted steps: describe an image so it has a vision row, then POST /batch/summaries with its file_id. Predicted response: queued 1, skipped 0 on every repeat, with no summary written. The R-5 record in decisions.md lists no image in its batch scenario.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: No test or mutant was run; all kill predictions come from reading the code and tests, because this reviewer has read-only tools.
- claude-read: The submodule's two commit ranges were not diffed directly; the claim that production code did not change since r1 rests on the supplied fix diff.
- claude-read: How FolderBrowser's fileIds prop reaches the folder-ai-actions slot, and whether typeFilter narrows the loaded files list, was not fully traced; the component receiving the prop at FolderBrowser.tsx:590 was not opened.
- claude-read: Whether a stale panel can actually reach edit after a failed regeneration: the code retains data during polling, while decisions.md reports the section disappearing, and the two were not reconciled.
- claude-read: The knowledge addon is not checked out, so its possible use of GET /summary's available flag was not examined.
- claude-read: The R-5 record in decisions.md was read as a claim; its screenshots and logs were not inspected, and it was recorded at 105ca5653, not at this commit.
- claude-read: Regenerate during an in-flight detailed generation was not analysed.
- claude-verify: Nothing was executed: no POST /batch/summaries call and no UI run; the result comes from reading the code.
- claude-verify: The origin/develop version of the batch classification was not read, so the before-and-after behaviour is not confirmed by a diff.
- claude-verify: The backend listing endpoint was not read, so that an unfiltered folder listing returns images is assumed from the client code.
- claude-verify: enqueue_unprocessed (app/workers/summaries.py:1270 onward) was not examined for how it treats image placeholder rows on the on_index path.

TOTAL: 1 findings
