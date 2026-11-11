# Core (frontend) review of d68d6d297 — find in file (SPEC-CORE-028)

Scope: `git diff origin/develop...d68d6d297 -- frontend/ DESIGN.md docs/user-guide docs/reference`.
Threat model: personal home-LAN tool, owner only, no adversary.
Mutation runs were done in throwaway worktrees at d68d6d297, with the test files
FindInFile.test.tsx, FindInFile.epub.test.tsx, findMarks.test.ts, PassageList.test.tsx,
useSelectedFile.test.tsx, canonicalFileUrl.test.ts, epubReaderChannel.test.ts.
(ime-enter-guard.test.ts fails in a worktree without addon submodules checked out, at baseline; it was left out.)

## Findings

### F1. Find marks wrap React-owned text nodes in the uncoloured TextLines; a later content change duplicates text in the preview
- File: frontend/src/components/TextLines.tsx:93 (`useFindMarksIn(() => preRef.current, ...)`) with frontend/src/lib/findMarks.ts:128-146 (`wrap` splits the text node, `clearFindMarks` unwraps but never re-joins)
- Claim: In the uncoloured branch (`<span className="code-line">{line}{"\n"}</span>`) the line text is a React-managed text node. `wrap` splits it with `splitText` and moves the matched part into a `<mark>`, so React's node now holds only the prefix. When the line's text later changes, React writes the whole new line into that prefix node and the old match and suffix nodes stay behind. `clearFindMarks` does not undo the split, so this happens even after the bar was closed.
- Ordinary use: the knowledge editor renders `TextLines text={content}` (no filename, so always the uncoloured branch) in the read half of split mode for a plain-text file. With the bar open on a hit, or after using it once on that mount, typing in the edit half (adding a line above a marked line is enough, since keys are line indexes) makes the preview show duplicated text such as `new firstneedle beta`. It stays wrong until remount. The edit half and the saved file are correct.
- Frequency: 2. Impact: 5 (the preview silently shows text the file does not have; recovered by reload).
- Evidence: scratch test rendering `<FindProvider><TextLines text=a filename="notes.txt"/></FindProvider>` then rerendering with b:
  - open bar, insert a line above: expected `new first\nalpha needle beta\n…`, got `new firstneedle beta\nalpha needle be…`;
  - after closing the bar, change `beta`→`gamma` on the marked line: got `alpha needle gammaneedle beta\n…`.
- Introduced (the same hazard exists for the citation mark, pre-existing, but that one is applied once from `?highlight=`).

### F2. The current-mark context test slices 20 raw characters before collapsing whitespace, so a paragraph break defeats it and the ordinal fallback marks the wrong occurrence in Markdown
- File: frontend/src/lib/findMarks.ts:54-73 (`chooseCurrentOccurrence`), with frontend/src/lib/findMarks.ts:166-169 (the rendered windows)
- Claim: Both sides take exactly `snippetBefore.length` / `snippetAfter.length` raw characters and only then collapse whitespace. The stored text separates paragraphs with `\n\n`; markdown-it's rendered body has one `\n` between `</p>` and `<p>`. The two raw windows then start at different characters, so they differ after collapsing although the text is the same, and step 1 of spec §10 never matches. Step 2 (ordinal) is then used, and in a Markdown file the ordinal is counted over the raw stored text, which includes the frontmatter (the intelligence `TextExtractor` indexes `.md` raw, `_clean_by_type` leaves it alone), while `MarkdownPreview`'s marked container holds only the body. Every occurrence of the term in `title:` / `tags:` shifts the ordinal by one, so the outline and the scroll go to a later occurrence than the row the user chose (or to the first one, for the last rows).
- Ordinary use: a knowledge note whose title or tags contain the word being searched (the usual case for a note about that word), and a hit within 20 characters of a paragraph break (the term at the start or end of a paragraph). Choosing that row in the 「検索」 tab outlines and scrolls to another occurrence.
- Frequency: 3. Impact: 5 (the wrong place is outlined and scrolled to; the user can see the snippet does not match, but nothing says so).
- Evidence: scratch test with stored `---\ntitle: needle notes\n---\nFirst para ends here.\n\nneedle starts para two.\n\nOther text needle end.`, row for 「needle starts…」 (ordinal 2, snippet/match_start built as the addon builds them), container `<p>First para ends here.</p>\n<p>needle starts para two.</p>\n<p>Other text needle end.</p>`: the current mark lands in 「Other text needle end.」. Collapsing first and then taking the last/first 20 characters makes both windows `para ends here. ` and would pick the right one.
- Note for the human: even with that fixed, any Markdown syntax inside the 20-character window (`## `, `- `, `**`, a link) also defeats step 1, and then the frontmatter-shifted ordinal is wrong by design. That part is the spec's accepted fallback (Failure cases, "The rendered text differs"), but the frontmatter shift makes it systematically wrong for notes, not occasionally. Design question, not scored.
- Introduced.

### F3. A current row beyond the rendered page is rendered but never scrolled into view in the list
- File: frontend/src/components/FileDetail/find/FindTab.tsx:46-57
- Claim: When stepping makes current a row past `shown`, the effect at :46 grows `shown`, but the effect at :53 runs in the same commit, before the re-render, so `querySelector('[data-find-current="true"]')` finds nothing. It does not run again after the re-render, because `find.currentRow` has not changed. The row is rendered, highlighted, and off screen. Spec §8 "The current row is scrolled into view in the list".
- Ordinary use: an answer with more than 200 places (a long transcript, a large PDF); Shift+Enter or 「前の箇所」 with nothing current goes to the last place, and the list stays at the top. (Stepping one by one from row 200 to 201 is usually masked: scrolling row 200 into view at the list's end already triggers the next page, which matches the R-5 observation; jumping straight past the rendered rows is not.) Also on Shift+Enter typed before the answer arrives (the pending step lands on the last row).
- Frequency: 2. Impact: 3 (the viewer itself jumps; the list just does not follow, and the user can scroll).
- Evidence: scratch test rendering `FindTab` under `FindProvider` with 300 rows, then re-rendering with `currentRow = rows[250]`: `scrollIntoView` is never called on the current button. With `rows[5]` it is.
- Test hole: nothing in FindInFile.test.tsx exercises paging or the list scroll (mutants N43 / N44 / N45 / N46, see the mutant table).
- Introduced.

### F4. On a PDF page turn the current mark is first placed in the previous page's text layer, which uses up the one scroll; the real current mark on the new page is never scrolled to
- File: frontend/src/components/PdfPreview.tsx:536-542 (`useFindMarksIn(..., (row) => row.kind === "page" && row.page === page)`) with frontend/src/hooks/useFindMarksIn.ts:29-35 (`scrolledFor`)
- Claim: Stepping to a `page` row on another page calls `goTo` → `setPage(n)`. In that commit react-pdf's `Page` still renders the old page: it resets its page proxy only in a `useEffect` (`resetPage`/`loadPage`, node_modules/react-pdf/dist/Page.js:100-112), and `TextLayer` clears its DOM only once the new text content exists (dist/Page/TextLayer.js:179-187). PdfPreview's effect runs as a parent effect in that same commit, so `getContainer()` returns the old page's `.react-pdf__Page__textContent`, while `isCurrentUnit` already answers true for the new page number. If the old page holds the term, `markFindOccurrences` puts the current outline on an old-page occurrence, scrolls to it, and sets `scrolledFor.current = row`. When the new text layer renders, `onRenderTextLayerSuccess` re-runs the effect, but `scrolledFor.current === current`, so the real current mark is outlined and not scrolled into view.
- Ordinary use: Enter / 次の箇所 through a PDF's hits in the default `fit-width` mode (a portrait page is taller than the canvas). Every step that crosses to the next page comes from a page that contained the term, so the condition holds on every page crossing. Whether the new mark is visible then depends on where it sits relative to the old occurrence's position.
- Frequency: 5 (on every page crossing while stepping; visible when the new mark is outside the old scroll position). Impact: 3 (the right page is shown and the outline is there, but off screen; the user has to look for it).
- Evidence: code reading of PdfPreview, useFindMarksIn and react-pdf 10's Page/TextLayer. Not reproduced in a browser: no stack was run for this review. No test drives a page change with a real text layer (the FindInFile test mocks `Page` as an empty div), so nothing would catch it.
- Introduced.

### F5. Pressing Cmd/Ctrl+F (or the button) while the bar is already open does not reopen the inspector or raise the sheet the viewer put away
- File: frontend/src/components/FileDetailShell.tsx:128-151 (the open/close effect returns early unless `find.open` changed) with frontend/src/components/FileDetail/find/useFindInFile.ts:261-277 (`openWithQuery` on an open bar only refocuses and re-requests the tab)
- Claim: Spec §2 Opening: "Opening, or pressing the shortcut while the bar is already open, does all of the following: … opens the desktop inspector if it is closed, or raises the phone sheet to half if it is below half". I10 repeats "by any route". The inspector override is set only on the closed→open transition. Once the viewer has closed the pane (or lowered the sheet) while the bar is open, a second press focuses the input and requests the 「検索」 tab in a pane that is not shown.
- Ordinary use: open find, close the inspector (or swipe the sheet down on a phone) to see more of the page, then press Cmd/Ctrl+F or the find button to get back to the list. Only the input takes focus; the list stays hidden until the viewer opens the inspector by hand.
- Frequency: 3. Impact: 3 (the list is one click away).
- Evidence: scratch copy of FindInFile.test.tsx with one added test. `inspector-open:<drive>=false`, open the bar, type, wait for the row 「first needle spoken」, click the inspector toggle (rows disappear), blur, `pressCtrlF()`: the key is claimed and the input focused, but the row never comes back (waitFor at the last assertion times out). The test "selects the query again on a second press" checks only focus and selection.
- Introduced.

### F6. Choosing the current row again does not bring the document back to it (Markdown, text, and a PDF row on the page already shown)
- File: frontend/src/hooks/useFindMarksIn.ts:21-35 (`scrolledFor` keyed on the row object) with frontend/src/components/FileDetail/find/useFindInFile.ts:128-135 (`makeCurrent` sets the same object)
- Claim: The scroll fires only when the current row object differs from the last one scrolled to. Clicking the current row again calls `setCurrentRow(sameRow)`, which React bails out of, and even on a re-render `scrolledFor.current === current`. For a `page` row on the page already shown, `goTo({page})` changes nothing either. So after the viewer scrolls the document away from the current place, choosing that row again (or pressing Enter when only one place is visible, which wraps to itself) does not move back to it. Media rows are not affected: they seek every time.
- Ordinary use: step to a place in a long note or text file, read on by scrolling, then click the same row in the 「検索」 tab to return to it. Nothing moves. Spec §8: "Choosing a row, or stepping to it, makes it current. … Then the page goes there".
- Frequency: 3. Impact: 3 (stepping to the next row and back works around it).
- Evidence: code reading; scratch test rendering `TextLines` under a `FindProvider` with the same current row twice records one `scrollIntoView` (in the app the second choice does not even re-render). Not run in a browser.
- Introduced.

### F7. Every MarkdownPreview on the page takes the `text` row as its own: the note's AI summary gets a second current mark and steals the scroll
- File: frontend/src/components/MarkdownPreview.tsx:432 (`useFindMarksIn(() => containerRef.current, isTextFindRow)`), frontend/src/lib/findMarks.ts:17 (`isTextFindRow` = any `text` row), frontend/src/lib/findMarks.ts:80-81 (fallback to the first occurrence always picks one)
- Claim: The unit test "is this row mine" is only `row.kind === "text"`, and the choice always lands somewhere when the container has the term (context, then ordinal, then first). Every `MarkdownPreview` under the FindProvider therefore outlines one occurrence as current and calls `scrollIntoView({block:"center", behavior:"smooth"})`. On a desktop Markdown/text document, `ShellLayout` draws `heavySummaries` (`ActiveSummaryHost` → knowledge `ActiveSummarySection`, and the intelligence `detailed-summary` slot, which renders one `MarkdownPreview` per segment) in the canvas under the editor, in the same scrolling `<main>`. Their effects run after the note's, so the last smooth scroll wins and the canvas scrolls to the summary instead of the place in the note, and two or more current outlines are on screen. I5: "exactly one occurrence in its unit carries the current mark".
- Ordinary use: find inside a note that has an active or detailed summary (a summary of a note about X mentions X). Enter / choosing a row scrolls to the summary under the note, not to the occurrence in the note.
- Frequency: 3. Impact: 5 (stepping in that note does not show the place; the user sees it fail).
- Evidence: scratch test rendering two `MarkdownPreview`s (note body, summary) under one `FindProvider` with a current `text` row: `mark.find-mark-current` count is 2 and `scrollIntoView` is called on the note's mark, then on the summary's.
- Test hole: the FindInFile tests mount exactly one `MarkdownPreview`.
- Introduced.

### F8. On a phone, the sticky find bar and the sticky player both pin to the top of the canvas, and the bar covers the top of the video once the canvas scrolls
- File: frontend/src/components/FileDetail/find/FindBarPresenter.tsx:45 (`sticky top-0 z-20`) with frontend/src/app/globals.css:1109-1115 (`[data-sheet-snap] .media-detail-player { position: sticky; top: 0; z-index: 10 }`) and frontend/src/components/FileDetail/ShellLayout.tsx:419-420 (the bar is a direct child of the scrolling `<main>`, before `MediaCanvas`)
- Claim: Both boxes are sticky at `top: 0` in the same scroller, and the bar's containing block is the whole canvas. Before scrolling, the player sits under the bar. Once the canvas scrolls by more than the bar's height (about 76 px: input row and status line), the player pins at 0 as well, and the bar (z-20) is painted over the top of the frame. The `sticky` was added in 70106834b for the PDF/text case ("the bar scrolled away"); the R-5 re-check covered a PDF at 390x844, not a video.
- Ordinary use: phone, a video or audio file with a description or companion under the player, bar open (the sheet at half), the viewer scrolls the canvas to read under the player. The top band of the video is hidden behind the bar while it plays.
- Frequency: 2. Impact: 3 (part of the picture hidden; closing the bar or scrolling back fixes it).
- Evidence: CSS and DOM reading only; not run in a browser.
- Introduced.

## Surviving mutants

Each mutant was one edit at d68d6d297, run against the seven test files above (and, for `public/epub-reader/*`, `playwright test --config=playwright-epub.config.ts findShortcut --project=chromium`), then restored. "Equivalent" means no ordinary-use behaviour changes, so there is nothing to catch. Introduced: all test holes below are in tests added by this change.

### F9. M01: latest-answer sequence guard removed (useFindInFile.ts:166) survives. Equivalent.
Every path that starts a fetch or clears the answer aborts the one in flight, and `fetchFileFind` returns `aborted` for it, so the seq check is a second guard that never decides anything. Frequency 0. Impact 1.

### F10. M14 / M15: filter reset removed from `clearAnswer` (:102) or from `runFetch` (:161), each alone, survives. Equivalent.
The other reset covers every path: a keystroke goes through both, and reopen/retry follow a close or a keystroke. Frequency 0. Impact 1.

### F11. M19: remembering the tab on every open, not only the first (useFindInFile.ts:265), survives
Defect let through: a second Cmd/Ctrl+F (or button press) while open overwrites the remembered tab with 「検索」, so closing selects nothing remembered and the inspector falls back to Info instead of the tab the viewer had (I8). No test presses twice and then closes. Frequency 3. Impact 2.

### F12. M20: a second press while open re-runs the query (`if (wasOpen) return;` removed, :272) survives
Defect let through: pressing Cmd/Ctrl+F to go back to the input would clear the current place, the filter and the marks and refetch. "selects the query again on a second press" checks only focus and selection, not that the current place survives. Frequency 3. Impact 3.

### F13. M31: an unreadable 200 body treated as "no hits" instead of a failure (fileFind.ts:77) survives
Defect let through: an addon/proxy contract break would say 「見つかりません」 instead of 「検索できませんでした」 with 再試行 (I6 "never 見つかりません" on a non-answer). No test sends a malformed body. Frequency 0. Impact 5.

### F14. M34: the pseudo-fullscreen check removed from `canTakeFindShortcut` (findShortcut.ts:11) survives
Defect let through: in the player's pseudo-fullscreen, Cmd/Ctrl+F would open the bar behind the pinned player instead of reaching the browser (I7). Only `document.fullscreenElement` is tested. On the desktop the real Fullscreen API is used, so ordinary exposure is small. Frequency 1. Impact 3.

### F15. M36: the `orderContexts` blocksLower check in `canTakeFind` removed (FileDetailShell.tsx:172-175) survives. Equivalent for the parent shortcut.
`ShortcutsProvider` never reaches a context below a `blocksLower` overlay, so the check is redundant there. The EPUB path (`openFindFromReader` → `openFindByShortcut`) does not use this check at all; no ordinary state has a `blocksLower` overlay open while the reader frame intercepts. Frequency 0. Impact 1.

### F16. M42 / M43 / M44: the phone sheet behaviour is untested
- M42: the sheet not raised to half on opening (FileDetailShell.tsx:142-147) survives.
- M43: the sheet not restored on close (:149) survives.
- M44: moving the sheet while the bar is open not marked as the viewer's change (:239-247) survives, so the close would snap the sheet back over the viewer's own choice.
Defects let through: on a phone, the list never shows on opening, or the sheet is left up or snapped back on closing (I8, I10). FindInFile.test.tsx has a phone test only for the shortcut. Frequency 3. Impact 3.

### F17. N03: the EPUB frame keeps intercepting in EPUB full screen (EpubPreview.tsx:82, `&& !fullscreen.isFullscreen` removed) survives
Defect let through: in 全画面で読む, Cmd/Ctrl+F inside the book would be swallowed by the frame (`preventDefault`) and then refused by the parent (fullscreen), so neither the bar nor the browser's find opens (I7, spec §3 "The value is true exactly when … the EPUB full screen is not open"). FindInFile.epub.test.tsx does not toggle full screen. Frequency 1. Impact 3.

### F18. N14: whitespace collapsing removed from the context test (findMarks.ts:33) survives
No test has a whitespace difference between the snippet and the rendered text, which is how F2 got through. Frequency 3. Impact 5 (see F2).

### F19. N15: folding with `toLowerCase` instead of ASCII-only (findMarks.ts:13) survives
Defect let through: marks on `É`/`Ä` etc. that the addon does not count, so marks and the count disagree (I5 "ASCII-only case folding"). No test has non-ASCII capitals. Frequency 1. Impact 2.

### F20. N18: overlapping occurrence search (findMarks.ts:164, `at + 1`) survives
Defect let through: for a term like `ーー` in `ーーー`, marks overlap and more marks than rows appear (the addon resumes at p + len). Frequency 1. Impact 1.

### F21. N20: the marks effect limited to `[term, currentRow]` (useFindMarksIn.ts:36) survives
Defect let through: marks are dropped and never re-applied when `MarkdownPreview` resets its HTML (typing in the knowledge editor's split mode) or when the PDF text layer is rebuilt (zoom, page turn). Spec §9 "Re-applying" has no test that re-renders with new HTML while the bar is open. (N24, the `bodyHtml` memo, is killed, but by a citation-mark test.) Frequency 3. Impact 3.

### F22. N21: scrolling to the current mark on every render (useFindMarksIn.ts:30, `scrolledFor` check removed) survives
Defect let through: every re-render (each keystroke in split mode, each container render on a PDF) would pull the reader back to the current place, so the document could not be scrolled away from it. No test re-renders and counts scrolls. Frequency 5. Impact 5.

### F23. N23: marking an undecorated (too large) TextLines (TextLines.tsx:93, `active` forced true) survives
Defect let through: marks in files past the decoration limits, against §9 "loaded, decorated TextLines" and the limits' purpose. Frequency 1. Impact 1.

### F24. N26 / N27 / N28: PDF marks are untested end to end
- N26: any `page` row treated as current on every page (PdfPreview.tsx:541) survives.
- N27: `onRenderTextLayerSuccess` removed (:526) survives.
- N28: the container selector broken so the PDF gets no marks at all (:539) survives.
The FindInFile test mocks react-pdf's `Page` as an empty div, so PdfPreview's marks are never exercised. findMarks.test.ts covers only `markFindOccurrences` on a hand-built layer. Defects let through: no marks on PDFs; marks lost after the text layer is rebuilt; a current outline on a page other than the row's (I5). F4 is in this gap. Frequency 5. Impact 5.

### F25. N30: the `value.open` check removed from the marks term (FindContext.tsx:55) survives. Equivalent.
Closing goes through `clearAnswer`, which sets the status to idle, so the term is null anyway. Frequency 0. Impact 1.

### F26. N34: the find term not URL-encoded in the passage link (PassageList.tsx:27) survives
Defect let through: a highlight term with `&`, `#`, `+` or `%` would open the file on a cut or altered query (I9). The tests use terms that do not need encoding. Frequency 1. Impact 3.

### F27. N40: `page` given its own category instead of 「本文」 (categories.ts:7) survives. Equivalent in practice.
One file yields one family, so a `page` row never shares an answer with `section`/`text`. Frequency 0. Impact 1.

### F28. N43 / N44 / N45 / N46: list paging and list scroll are untested
- N43: not growing the page to the current row survives.
- N44: no paging on scroll survives.
- N45: no `scrollIntoView` of the current row survives.
- N46: `PAGE_SIZE` 2000 survives.
Defects let through: a current row past 200 never rendered; the list never extends; the current row never scrolled into view; all 2000 rows rendered at once (spec §6 Paging and §10 client time). F3 is in this gap. Frequency 3. Impact 3.

### F29. E1: the Shift guard removed from the frame's `isFindShortcut` (public/epub-reader/core.js:18) survives
The e2e test sends `key: "F"` with Shift, which `event.key === "f"` already rejects, so the guard is never what decides. Defect let through: a browser that reports `key: "f"` for Cmd+Shift+F would have that chord taken inside the book. Frequency 1. Impact 2.

### F30. E3: the "other modifier" guard removed (core.js:21, `!other`) survives
The "other" case presses Ctrl alone on a Mac, never Cmd+Ctrl together. Defect let through: Cmd+Ctrl+F (macOS full-screen toggle) inside the EPUB frame would open the find bar instead. Frequency 1. Impact 3.

## Killed mutants (brief)

- useFindInFile: debounce 0 (M03), abort on keystroke (M02), Enter-while-pending starts at once (M04), last pending press wins (M05), Shift+Enter pending lands last (M06), IME change guard (M07), IME keydown guard (M08), composition commit (M09, FindBar), wrap (M10), previous-with-nothing → last (M11), step within filter (M12), URL strip on close (M16), restore only if 検索 still selected (M17), restore at all (M18), `?find=` trim (M21) and 200 cap (M22), notIndexed vs noHits (M23), retry (M24), seek (M25), page goTo (M26), section goTo (M27), hook-side suppression (M28).
- fileFind: 404 → unavailable (M29), 403 → unavailable (M30), drive header (M32).
- findShortcut: fullscreenElement (M33), aria-modal (M35).
- FileDetailShell / ShortcutsProvider: phone has no shortcut (M37), `when` dropped from the binding (M38), provider ignores `when` (M39), inspector not opened (M40), preference written on open (M41), override kept after close (M45).
- InspectorShell: select request ignored (N01), selection not reported (N02).
- EPUB parent: intercept always (N04), frame shortcut bypassing suppression (N05), `open` sends false (N06), no `set-find-intercept` (N07), `find-shortcut` ignored (N08), channel drops `find-shortcut` (N09).
- EPUB frame (Playwright): Alt guard (E2), intercept gate (E4), `open` flag ignored (E5), `set-find-intercept` ignored (E6), `isValidOpen` rejects the field (E7), `preventDefault` (E8), Mac detection (E9).
- findMarks / useFindMarksIn: no context step (N10), context ignored (N11), no ordinal step (N12), nearest-to-ordinal tie (N13), no folding (N16), first segment only, cross-node (N17), marks not cleared (N19), no scroll (N22).
- MarkdownPreview: `bodyHtml` memo (N24), no find marks (N25).
- PdfPreview: selection cleared everywhere (N29).
- PassageList longest-term rule: non-keyword passages (N31), tie → latest (N32), shortest (N33).
- Counts and chips: 「n / N+」 (N35), 「N+ 件」 (N36), filtered count (N37), chip 「+」 (N38), chips at one category (N39).
- URL: `find` in FILE_LOCATION_PARAMS (N42), `find` in CARRIED_QUERY_KEYS (N41).
- Bar and button: snippet mark (N47), select on open (N48), refocus on second press (N49), Markdown page-row button (N50), surface gate (N51).

## Not verified

- F4 and F8 are code and CSS reading; no stack was run for this review.
- Real Cmd/Ctrl+F through a hardware keyboard, and real IME composition, as decisions.md already lists as pending.
- The `ime-enter-guard.test.ts` count, which needs the addon submodules checked out.

TOTAL: 30 findings
