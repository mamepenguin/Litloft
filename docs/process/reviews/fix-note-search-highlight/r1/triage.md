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

Note: A ?highlight= term retained by selectFile is applied to the next .md note selected, which may mark an unrelated passage through the partial-match fallbacks or scroll a note with no match to the top of its body (F1).; A note with no match for the term opens scrolled so that its frontmatter table is above the visible area (useHighlightPassage.ts:94-98); decisions.md records this as scrollTop 153 without saying it was chosen.; highlightSpent resets only on fileId and is set even when no highlight was ever present, so a new or first ?highlight= on the same mounted note after Read has been left is ignored (Editor.tsx:1276-1284). The only producer found in the code, the Ask page, is a separate page that opens the note afresh, so this needs a same-page link or a URL change on the mounted note.
- claude-read: A ?highlight= term retained by selectFile is applied to the next .md note selected, which may mark an unrelated passage through the partial-match fallbacks or scroll a note with no match to the top of its body (F1).
- claude-read: A note with no match for the term opens scrolled so that its frontmatter table is above the visible area (useHighlightPassage.ts:94-98); decisions.md records this as scrollTop 153 without saying it was chosen.
- claude-read: highlightSpent resets only on fileId and is set even when no highlight was ever present, so a new or first ?highlight= on the same mounted note after Read has been left is ignored (Editor.tsx:1276-1284). The only producer found in the code, the Ask page, is a separate page that opens the note afresh, so this needs a same-page link or a URL change on the mounted note.
- claude-verify: A Markdown note picked after a citation-opened file inherits ?highlight= from the URL; it may then be marked by a partial match or scrolled past its top when nothing matches (F1).

### unspecified_behavior

Note: A Markdown note picked after a citation-opened file inherits ?highlight= from the URL; it may then be marked by a partial match or scrolled past its top when nothing matches (F1).
- claude-read: A ?highlight= term retained by selectFile is applied to the next .md note selected, which may mark an unrelated passage through the partial-match fallbacks or scroll a note with no match to the top of its body (F1).
- claude-read: A note with no match for the term opens scrolled so that its frontmatter table is above the visible area (useHighlightPassage.ts:94-98); decisions.md records this as scrollTop 153 without saying it was chosen.
- claude-read: highlightSpent resets only on fileId and is set even when no highlight was ever present, so a new or first ?highlight= on the same mounted note after Read has been left is ignored (Editor.tsx:1276-1284). The only producer found in the code, the Ask page, is a separate page that opens the note afresh, so this needs a same-page link or a URL change on the mounted note.
- claude-verify: A Markdown note picked after a citation-opened file inherits ?highlight= from the URL; it may then be marked by a partial match or scrolled past its top when nothing matches (F1).

## Findings

A: 0
B: 3
C: 0

### claude-read:F1-stale-highlight-follows-to-next-note — bucket B, MEDIUM, open

Claim: A Markdown note picked after a citation-opened file now receives the previous file's search term, because selectFile keeps ?highlight= when the file changes and the Editor now applies it to .md files.
Impact: After following an Ask citation into the folder view, each further note picked from the list or by previous/next inherits the old phrase. If the phrase or part of it occurs in that note, an unrelated passage is marked and scrolled to. If not, the note opens smooth-scrolled to the top of its body, with its frontmatter table above the visible area. Nothing tells the user that the mark or scroll comes from an earlier citation.
Evidence: frontend/src/hooks/useSelectedFile.ts:11 lists only section, page and t as FILE_LOCATION_PARAMS, under the comment that places in one file mean nothing in the next; lines 43-45 delete only those. frontend/src/hooks/__tests__/useSelectedFile.test.tsx:77 pins file=A&highlight=x going to file=B&highlight=x. frontend/src/components/folder/RightPaneFile.tsx:90 and :123 pass the URL value on, and frontend/src/app/files/[id]/__tests__/page.test.tsx:148 shows the /files redirect carries highlight. frontend/src/components/FileDetail/ShellLayout.tsx:431 and addons/knowledge/frontend/Editor.tsx:1489-1491 now deliver it to MarkdownPreview. In frontend/src/hooks/useHighlightPassage.ts, the fallbacks at lines 280-377 accept partial matches, and lines 94-98 scroll the container when nothing matches. Editor.tsx:472 sets content to null on a file change, so the preview unmounts and the hook's scrolled flag starts fresh for the next note. The R-5 runs recorded in decisions.md moved between notes with each note's own phrase and did not press a list entry with an inherited one.
Repro: not_reproduced (read only). Predicted steps: open /files/<noteA>?highlight=<phrase in A> so that it redirects to the folder view with ?file=<A>&highlight=...; press note B in the folder list. Expected observation: the URL is ?file=<B>&highlight=<phrase>, and B either has a mark on any match or fallback match, or is scrolled to the top of its body when nothing matches.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add highlight to FILE_LOCATION_PARAMS in useSelectedFile.ts and change the test row at useSelectedFile.test.tsx:77 to expect it removed when the file changes.

</details>

### claude-read:F2-spent-state-lost-after-note-to-note-move — bucket B, LOW, rejected

Claim: After moving from one note to another in the same mounted Editor, the rule that the search term is marked only on the first Read no longer holds for the second note, because readShownRef is cleared and not set again while the preview stays shown.
Impact: On a note reached by a note-to-note move with ?highlight=, Read, Edit, Read draws the mark again and scrolls to it again, including after the user has edited the text. The same steps on a directly opened note give no mark and no scroll, so returning to Read can pull the user away from where they were.
Evidence: addons/knowledge/frontend/Editor.tsx:1276-1279 sets readShownRef to false on a fileId change. Lines 1281-1284 depend only on previewShown, which stays true across the move, so the ref stays false. The later Read to Edit change takes the else branch at line 1283, where readShownRef is false, so highlightSpent is never set. Editor.tsx:1489-1491 then passes highlight again on return. In frontend/src/hooks/useHighlightPassage.ts:67-69 the quote going from undefined back to the phrase resets scrolledRef, so it scrolls again. KnowledgeEditSection.tsx:91 renders Editor with no key, and no key on file id was found in the FileDetail components searched, so I read the instance as reused; the test at Editor.highlight.test.tsx:170 rerenders with a new fileId and no key in the same way. The test at Editor.highlight.test.tsx:191 covers only a single file.
Repro: not_reproduced (read only). Predicted mutation-free test: in Editor.highlight.test.tsx, render fileId f1 in preview with a highlight, rerender with f2, wait for the mark, then go('edit'), go('preview'). Expected: the mark reappears and scrollIntoView is called again, where the single-file test expects 0 marks.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Include fileId in the dependencies of the previewShown effect at Editor.tsx:1281-1284, placed after the reset effect, so the ref is set again for the new file when the preview is already shown; add the two-file Read, Edit, Read test.

</details>

### claude-read:F3-no-touch-point-list — bucket B, INFO, open

Claim: No invariants file declares a touch-point list for this change, so the first-review question cannot be answered as a difference against a list and every place the diff reaches is undeclared.
Impact: No direct user effect. A reader has no planned scope to compare against, including for the indirect reach that the diff text does not show.
Evidence: docs/process/reviews/fix-note-search-highlight/ holds decisions.md and r1/ only, with no invariants.md. Places reached in the diff: addons/knowledge pin (frontend/Editor.tsx and its new test), docs/developer-guide/known-issues.md, frontend/src/components/FileDetail/ShellLayout.tsx and PlainTextDocument.test.tsx, frontend/src/hooks/useHighlightPassage.ts and its test. Places reached but not shown: frontend/src/components/MarkdownPreview.tsx:426 and frontend/src/components/TextLines.tsx:86 (every core consumer of the hook gets the new scroll timing), addons/knowledge/frontend/KnowledgeEditSection.tsx:100 (now receives highlight for .md), frontend/src/hooks/useSelectedFile.ts:11 (see F1).
Repro: not_reproduced; observed by listing the review directory.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: No test or application was run, because this reviewer has read-only tools; F1 and F2 are predictions from reading the code.
- claude-read: I did not run the mutations described under test_coverage; those outcomes are reasoned from the test code.
- claude-read: I did not check whether addonSlotProps ever carries its own highlight value, which the new prop in ShellLayout would override.
- claude-read: I did not trace every caller of selectFile, or whether the Knowledge notes page path uses useSelectedFile.
- claude-read: I did not check how useDocumentCapturePublisher behaves with marks in a note's preview.
- claude-read: I did not verify React's re-application of dangerouslySetInnerHTML in the repository's React version; I relied on the comments in the test file and the run record in decisions.md.
- claude-read: The R-5 scripts, logs and screenshots named in decisions.md were not opened.
- claude-verify: Nothing was executed: no tests, no browser and no running app. All three records rest on reading the code.
- claude-verify: The diff against origin/develop was not read directly. The reached paths come from r1/classification.json and the claimed pre-change behaviour of ShellLayout.tsx comes from decisions.md.
- claude-verify: The working tree was read and assumed to match commit 4782d625b; head.txt was not compared.
- claude-verify: The pinned addons/knowledge checkout was read as present in the worktree; its pin was not compared with commit f12e5ad0f.
- claude-verify: The list rows in FolderBrowser and the tree's call into onSelectFile were not traced; the F1 path was followed from TwoPaneLayout.tsx and RightPaneFile.tsx.
- claude-verify: docs/specs/citation-quote-anchor.md and the older review records that mention the hook were not opened.

TOTAL: 3 findings
