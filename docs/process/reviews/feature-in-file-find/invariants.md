spec: docs/specs/in-file-find.md

## Revisions

I10. (r0) Opening the bar by any route — the button, Cmd/Ctrl+F, `?find=` or `find-shortcut` from the EPUB frame — focuses and selects the input, lists and selects the 「検索」 tab in both inspector instances, opens the desktop inspector or raises the phone sheet to at least half, and remembers the tab and layout it replaced; on any surface other than `canonical` (the file page `RightPaneFile` draws) there is no button and no shortcut.

I11. (r0, R-5) The find answer's `indexed` is true exactly when the stage that fills the file's kind has finished — `whisper_indexed` for a video or audio file, `ocr_indexed` for an image, `text_indexed` for every other kind — or when the file has an active Visual Index run while the drive's Visual Index is open; a file whose stage has not finished answers `indexed: false`, so it shows the not-yet-indexed text and never 「見つかりません」. This replaces the "any flag" rule of the addon's Normal flow step 6.

I12. (r1-extra, human) When the addon rebuilds a text unit, the overlap it removes between two adjacent chunks is the longest suffix–prefix match of at least 20 characters and at most the replay the chunk's extractor uses — `chunk_text`'s default of 200 for Office and picture OCR, `indexing.text_chunking.overlap` for every other kind — never longer, so a line repeated near a chunk boundary is not taken for replay and no occurrence is dropped. This replaces the fixed 200-character cap of the addon's Normal flow step 3.

I5. (r2, R-5, human) While the bar is open with rows, every occurrence of the term (ASCII-only case folding) in each rendered text layer of the inline PDF viewer, in the rendered `MarkdownPreview` of the file's own body (the knowledge editor's preview included) and in a decorated `TextLines` carries the find mark. When a `page` or `text` row is current, at most one occurrence in its unit carries the current mark. It is the occurrence whose context matches the row's snippet, where the context is compared on letters and digits only (Unicode letter and number characters; whitespace, punctuation and Markdown syntax are dropped before the windows are taken). When no occurrence matches: on a `page` row the occurrence numbered `ordinal`, else the first, carries it; on a `text` row none does, and nothing scrolls. This replaces I5 and the order of core step 10.

I5. (r3, R-5, human) While the bar is open with rows, every occurrence of the term (ASCII-only case folding) in each rendered text layer of the inline PDF viewer, in the rendered `MarkdownPreview` of the file's own body (the knowledge editor's preview included) and in a decorated `TextLines` carries the find mark. When a `page` or `text` row is current, at most one occurrence in its unit carries the current mark, chosen by context on letters and digits only (Unicode letter and number characters; whitespace, punctuation and Markdown syntax dropped). Each occurrence is scored as the number of letters that agree, read backwards from the term, in the 20 before it, plus the number that agree, read forwards, in the 20 after it, against the row's snippet. The occurrence with the highest score carries the current mark when that score is at least 10 and no other occurrence has it. Otherwise, on a `page` row the occurrence numbered `ordinal`, else the first, carries it; on a `text` row none does, and nothing scrolls. This replaces the r2 revision of I5.

I5. (r4, human) While the bar is open with rows, every occurrence of the term (ASCII-only case folding) in each rendered text layer of the inline PDF viewer, in the rendered `MarkdownPreview` of the file's own body (the knowledge editor's preview included) and in a decorated `TextLines` carries the find mark. When a row is current, at most one occurrence carries the current mark, chosen by position rather than by guessing from rendered text:
- A `text` row is located in the file's source — the text the viewer renders from, frontmatter included — by finding the row's snippet (without its 「…」 and with whitespace runs compared as one space) in that source; when the snippet occurs more than once, the occurrence nearest the row's `ordinal` is taken. In `MarkdownPreview` the rendered block whose source lines contain that occurrence is found through the source line numbers markdown-it gives each block, and its k-th occurrence of the term carries the current mark, k being the number of occurrences of the term in that block's source up to and including this one. In `TextLines` the occurrence at that source position carries it. An occurrence inside the frontmatter, a snippet not found in the source, or a block whose rendered text has fewer than k occurrences gives no current mark, and nothing scrolls.
- A `page` row (PDF) keeps the score of r3 without any extra guard: the top score of at least 10, unique, else `ordinal`, else the first.
This replaces the r3 revision of I5.

## Clarifications

Settled with the human on 2026-11-05, while the acceptance tests were written. These fill gaps in the approved spec and change no invariant.

- The bar's buttons are named 「前の箇所」, 「次の箇所」 and 「検索を閉じる」.
- A chip reads its label, a space and its count (「発話 6」), and 「発話 6+」 when `truncated` is true.
- `set-find-intercept` is `{type: "set-find-intercept", interceptFind: boolean}`, the same field name as on `open`.

## Places reached outside the touch-point list (r1)

Found by r1 (TP-1 to TP-6) and recorded here because the approved spec is not edited. Each is in this change:

- `frontend/src/components/ShortcutsProvider.tsx`: shortcuts gain an optional `when()`, and a binding whose `when()` is false lets lower contexts match the key. The human accepted this in r1.
- `frontend/src/components/markdown/MarkdownDocumentLayout.tsx`: the page row of Markdown and plain-text documents hosts the find button and passes `findEnabled` to `FileDetailShell`.
- `frontend/src/lib/documentCapture.ts` (`clearSelectionWithin`) with `PdfPreview.tsx`: a PDF page turn clears only a selection inside the PDF. The human accepted this in r1.
- `frontend/src/hooks/useFindMarksIn.ts`, `frontend/src/lib/findMarks.ts`, `frontend/src/lib/findShortcut.ts`: the I5 mark logic and the I7 suppression test.
- `docs/user-guide/search.md`: the passages link.
- `frontend/src/__tests__/ime-enter-guard.test.ts`, `frontend/e2e-epub/findShortcut.spec.ts`, `frontend/e2e-epub/fixtures/host.html`: tests and fixtures.
