# Review of the round-1 fixes: core 197f6ff92 (+ pointer 674e5a452), addon f7f1160

Threat model: a personal home-LAN tool with one user, its owner, and no adversary.
Method: I read both commits and the code they touch, the knowledge addon frontend at the pinned 863fa38, and react-pdf 10's TextLayer. Mutation runs used throwaway copies:
- core: a detached worktree at 674e5a452, with the addons extracted with `git archive` at their pinned SHAs and linked by `setup-addons.sh`;
- addon: a clone at f7f1160, image `intelligence-rev2-b2`.
I restored the files after each mutant, then removed both copies and the image. Neither repository was edited.

Baselines:
- core, the 4 find test files: 100 passed;
- core, full `vitest run` with the addons present: 9495 passed and 1 failed. The failure was `src/addons/intelligence/Page.test.tsx` "puts a ?q= seed in the box", which is flaky: it passed and failed on two reruns, and the file is untouched by this change;
- addon, `tests/test_file_find_endpoint.py`: 91 passed.

## Does each fix fix its finding in ordinary use

- **F2 / F18 (core)**: fixed. Both windows are now taken after whitespace is collapsed, so the stored `\n\n` and the rendered `\n` between paragraphs compare equal. markdown-it runs with `breaks: false`, so a soft line break stays as `\n` text and is collapsed the same way. Markdown syntax inside the 20-character window still defeats the context match, and the ordinal fallback is then shifted by the frontmatter. That is the design question already raised in round 1, and this round does not change it.
- **F4 (core)**: fixed. In the commit where the page number changes, the current mark is now held back until `onRenderTextLayerSuccess` reports the layer, and `pageRef` is that page's number by then. Changing the page cancels the old page's text-layer task (TextLayer's layout-effect cleanup), so a stale success cannot claim the new page in ordinary use.
- **F7 (core)**: fixed.
  - Inside the `knowledge-edit` slot, `KnowledgeEditSection` renders `Editor` and `MediaCaptureAction`. `Editor` renders `MarkdownEditor`, `PropertiesPanel`, exactly one `MarkdownPreview` (the body, frontmatter stripped) or one `TextLines`, `VersionHistoryPanel` (no `MarkdownPreview`/`TextLines`, so no marks) and `WikiLinkAutocomplete`.
  - Nothing else in the slot calls `useFindMarksIn`: no active summary, no embedded note, no transclusion. `ActiveSummarySection` and `DetailedSummarySection` live in `heavySummaries`, outside the provider, on the desktop canvas and on the phone sheet alike.
  - `FilePreview`, and with it `MarkdownFileViewer`, is mounted only for the file's own preview (`MediaPlayerBlock`, `ShellLayout` HTML).
- **F22 / F24 (core)**: the tests exist and kill the mutants they target (see the killed list below).
- **Addon F1 / I12**: fixed. The extractors that pass no overlap use 200: Office (`office.py:53,91,129`) and picture OCR (`ocr.py:265`). Every other extractor passes `text_chunking.overlap`: text, HTML, PDF and EPUB. `_OFFICE_MIMES` matches `indexer.TEXT_MIMES`.
- **Addon F2 / F3**: fixed. Each new test fails when its guard is removed.

Regressions checked, with none found:
- citation mark (`useHighlightPassage` untouched);
- cleanup on closing (the clear does not depend on `ownsText`, and the summary keeps its plain marks and clears them);
- cross-node marks (`wrap` and segments unchanged);
- Markdown viewed outside the knowledge editor (`MarkdownFileViewer` is wrapped);
- `TextLines` (untouched, still uses `isTextFindRow`);
- PDF full-screen viewer: it has no find marks, and on close `setPage(last)` goes through the new text-layer gate.

## Findings

### 1. The production wiring for F7 is untested: removing either `FindTextBodyProvider` leaves every test green
- File: frontend/src/components/FileDetail/ShellLayout.tsx:493-505 and frontend/src/components/MarkdownFileViewer.tsx:114-123. The tests: FindInFile.test.tsx's mocked `FilePreview` (it wraps `MarkdownPreview` in its own `FindTextBodyProvider`), and FindMarksRender.test.tsx (it builds the provider by hand).
- Claim: the tests reach `ownsText = true` only through providers the tests themselves create. Neither production wrapper is ever mounted by a find test. Mutants C1 (ShellLayout wrapper removed) and C2 (MarkdownFileViewer wrapper removed) both survive. I ran C1 three times; one of the runs had a single unrelated flaky failure.
- Defect let through: a refactor that drops or moves either wrapper means every Markdown note shows no current mark and is never scrolled to:
  - the knowledge inline editor, which is the default Markdown path;
  - or a Markdown file shown through `FilePreview`.
  The tests would still pass.
- When in ordinary use (if regressed): any find in a note.
- Frequency: 8 (if regressed). Impact: 5 (stepping in a note goes nowhere, which the user can see).
- Evidence: C1 and C2 survive on the 4 find test files: 100/100, and 81/81 twice for C1.
- Introduced (the wrappers and the test bypass are both in this fix).

### 2. Test hole: collapsing on the rendered side is not pinned (mutant C8 survives)
- File: frontend/src/lib/findMarks.ts:193-206 (`collapseWithOffsets(folded)` and the windows taken from it).
- Claim: if the rendered windows go back to 20 raw characters (collapsed only after slicing), every test still passes. The new tests only have whitespace runs on the stored (snippet) side.
- When in ordinary use (if regressed): the rendered text has a whitespace run near the hit. markdown-it emits consecutive `\n` text nodes where nested blocks close, and a pdf.js layer can carry runs of spaces. The context match then fails and the ordinal is used.
  - In plain text the ordinal is right.
  - In Markdown, the cases I could build also had syntax (`- `, `> `, fences) inside the window, which defeats the match anyway. So the effect in ordinary use is small.
- Frequency: 1. Impact: 3.
- Evidence: mutant C8 SURVIVED (100/100).
- Introduced (new code with no test of its own).

### 3. Minor: a stale chunk index makes the new tight cap double-count (one line, unusual condition)
- File: addons/intelligence app/file_find.py:54-58.
- Claim: the cap now trusts the current config. If a text file's chunks were written with a different overlap and never re-indexed, the replay is not found and occurrences inside it are counted twice. Example: the pre-April-2026 default of 200/1000 (intelligence 62514b9 changed it to 80/400 and shipped a manual `scripts/reindex_text_content.py`). Before this fix, the 200 cap covered that case.
- Frequency: 0 (local data checked: every text, Markdown, PDF and EPUB chunk is 400 characters or shorter, so it was re-indexed; production not checked). Impact: 3.
- Introduced.

## Surviving mutants (core)

- **C5**: `row.page === page` dropped from PdfPreview's `isCurrentUnit` (only the `textLayerPageRef` check left). Equivalent: when the two disagree, the current row's page is the new `page`, which is not the layer's page, so the answer is the same in every ordinary sequence.
- **C9**: the `before.length === 0 ? ""` guard removed (`slice(-0)` returns the whole window). It only matters for a hit at the very start of a unit, where the ordinal fallback already picks the same occurrence (ordinal 1, or a PDF page start). Near-equivalent. Frequency 1, impact 1.
- **C11**: the occurrence's before window not trimmed to the snippet's length. The two differ only when the snippet has under 20 characters before the hit, which happens at the start of a unit, where the rendered side is equally short. Near-equivalent. Frequency 1, impact 1.
- **C12**: a whitespace run's later characters mapped to the next index. Equivalent unless the term begins or ends with whitespace.
- **C13**: `snippetEnd` computed as `snippetStart + match_length`. Equivalent unless the matched term itself contains a whitespace run, which an exact match of a typed term does not.
- **C15**: `CONTEXT_CHARS` 20 changed to 10. This is a pre-existing constant that was not changed here. Defect let through: weaker disambiguation, so a context match can land on a look-alike occurrence. Frequency 1, impact 2.

## Killed mutants

Core, on the 4 find test files:
- C3: `MarkdownPreview` ignores `ownsText` (FindMarksRender "summary … no current mark").
- C4: PdfPreview drops the `textLayerPageRef` check (the inline PDF test). This is the F4 revert.
- C6: `textLayerPageRef` never set (the inline PDF test).
- C7: snippet windows raw, as before the fix (the findMarks unit test, the frontmatter test and the PDF test). This is the F2 revert.
- C10: the after window not trimmed to the snippet.
- C14: scroll on every render (FindMarksRender "does not scroll again"). This is F22.
- C16: no context step.

Addon, on test_file_find_endpoint.py:
- `_replay_limit` always 200 (the repeated-line tests; the F1 revert);
- always the config value (the office and picture tests);
- the image branch dropped;
- the Office branch dropped;
- lexical `ORDER BY chunk_index` (the 12-chunk test; F2);
- the `document_sections` query without `file_id` (the per-file section-title test; F3);
- limit +40;
- limit −1.

## Not verified

- No browser run. F4 relies on react-pdf 10's Page/TextLayer code and on the test's mock of it.
- Production's `fts_text_content` chunk sizes (Finding 3).

TOTAL: 3 findings
