# Triage: r2

## Trajectory

This run:
- claude-read: The commits since r1 are not fixes to the r1 findings: those were three touch-point-list findings in bucket B, and no commit edits the list. The commits are the merge of the core PR (#506, the inspector-tabs slot, documentController and lowerInspector, as reviewed in r1), an unrelated ingest-progress feature (its spec, tests, the core endpoint, the drawer, and merges from develop) and this commit's addon gitlink bump. No round re-adds a branch, a state or a prediction that an earlier round added, and none removes one. The design of this feature is not being patched round over round.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:ASK-1 is bucket A or BLOCKER

## Findings

A: 1
B: 3
C: 0

### claude-read:ASK-1 — bucket A, MEDIUM, open

Claim: When the Ask tab unmounts while an answer is streaming, the stream is aborted and the file's question and partial answer are deleted. Closing the mobile sheet to its bar, and crossing the mobile breakpoint, both unmount the tab.
Impact: On a phone, a user asks a question and then lowers the sheet to watch the video or read the page while the answer streams. The request is cancelled and the work is lost. Reopening the sheet shows an empty Ask tab with no question, no answer and no failure line.
Evidence: MobileInspectorSheet.tsx:82 and :206-219: the drawer, and with it the children (the InspectorShell and every inspector-tabs entry), is mounted only while expanded. At peek only the strip renders. addons/intelligence/frontend/AskTab.tsx: `useEffect(() => () => releaseAskEntry(fileId), [fileId])`. askStore.ts releaseAskEntry aborts the controller and, when `entry.status === "streaming"`, calls `entries.delete(fileId)`. Spec 056 step 6 and I11 say closing the mobile sheet keeps the question and answer, and that an in-flight stream belongs to the file while the file page is mounted.
Repro: Mutation reasoning: in AskTab.test.tsx, start a stream (ask + push an answer_chunk), call `view.unmount()`, re-render `<AskTab {...view.props}/>`, and expect the question box to hold the question. Under the current releaseAskEntry the entry is deleted, so the box is empty. The existing test 'keeps the question and the answer across a tab switch or a closed sheet' unmounts only after `done`, so it does not exercise this path. The test 'aborts the stream when the file page unmounts' asserts the behaviour that breaks I11 for a sheet close, because the tab cannot tell the two apart.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Tie the entry's lifetime to the file page rather than to the tab's mount. For example, let the stream continue in the module store across a tab unmount, and abort and drop the entry only on a fileId change or a page-level unmount signal. Alternatively, keep the inspector-tabs entries mounted at peek. Add a test that unmounts mid-stream and remounts.

</details>

### claude-read:ASK-2 — bucket B, LOW, open

Claim: A settled question and answer stay in the module-level store after the file page is left, so returning to the same file later shows the old conversation.
Impact: A user leaves a file page (back to the drive listing) and later opens the same file. The previous question and answer are still shown, where the spec says returning shows an empty tab. The map also grows by one entry per file asked about for the life of the browser tab.
Evidence: askStore.ts:`const entries = new Map` at module scope. releaseAskEntry keeps any non-streaming entry and only clears its controller. dropAskEntry runs only from AskTab's layout effect, when fileId changes within the same mount. Nothing drops an entry on a page unmount.
Repro: not_reproduced. By reading: answer a question, unmount the tab, then render a new AskTab with the same fileId. `getAskEntry` returns the settled entry, which is the behaviour the 'keeps ... across a closed sheet' test depends on.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Have the file page (or a provider at its level) clear the ask store when it unmounts, separately from the tab's own unmount.

</details>

### claude-read:ASK-3 — bucket B, LOW, open

Claim: The citation parser matches only one- to three-digit markers, so a valid citation of chunk 1000 or above is silently dropped, and the tab then deletes the marker from the answer.
Impact: With `rag.file_question_max_chars` set high (up to 200,000) and short transcript chunks, more than 999 chunks can be sent. The model's `[1234]` citations then lose their pills and vanish from the text, with no error.
Evidence: app/rag/file_question.py: `_CITATION_MARKER = re.compile(r"\[(\d{1,3})\]")`. The prompt numbers passages with `loop.index`, which is unbounded. AskTab.tsx AnswerText splits on `\[\d+\]` and returns null when the number is not in the citations map.
Repro: not_reproduced. By reading: `citations("see [1000]", chunks_of_length_1200)` returns [], because the regex does not match four digits.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Use `\[(\d+)\]`; the existing `1 <= number <= len(chunks)` check already bounds it.

</details>

### claude-read:ASK-4 — bucket B, INFO, open

Claim: The availability route counts chunk rows whose text is empty, while load_material skips them. A file whose only chunks have empty text therefore shows the Ask tab, and every question about it answers 404.
Impact: An edge case: the tab appears, and asking shows the generic 'Could not answer' line on every try.
Evidence: file_question.py available(): `EXISTS(SELECT 1 FROM transcript_chunks WHERE file_id = :fid)` with no text filter. load_material skips rows with `if not text: continue` and returns None when no rows remain. The router turns None into 404.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add `AND text <> ''` (or `length(text) > 0`) to both EXISTS clauses.

</details>

## Not verified

- claude-read: Did not run any Python or vitest test.
- claude-read: Did not confirm that vec_text exposes an `embedding_id` column that is queryable with IN, or that the EPUB `page` in fts_text_content is the 1-based ?section= number.
- claude-read: Did not check whether the desktop InspectorPane unmounts its content when the inspector is collapsed (which would extend ASK-1 to desktop).
- claude-read: Did not read the truncated part of the fix diffs (ingest-progress implementation) beyond the cut-off.
- claude-read: Did not check that docs/addons/intelligence.md and docs/user-guide/search.md were updated in the core repo.
- claude-verify: Did not run any tests or a browser; all four claims were checked by reading the code.
- claude-verify: Did not check whether InspectorShell keeps hidden panels mounted across tab switches; this does not affect the sheet/peek path.
- claude-verify: Did not trace every transcription provider and the refine aligner exhaustively for empty-text chunk rows (ASK-4 reachability).
- claude-verify: Did not measure real chunk counts for long refined transcripts (ASK-3 reachability).

TOTAL: 4 findings
