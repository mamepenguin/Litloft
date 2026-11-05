# Triage: r1

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

## Needs a human

### unspecified_behavior

Note: A PDF page turn no longer clears a document selection that lies outside the PDF viewer root (documentCapture.clearSelectionWithin).; A shortcut whose `when()` is false now lets lower shortcut contexts match the same key, rather than ending the search at that context.
- claude-read: A PDF page turn no longer clears a document selection that lies outside the PDF viewer root (documentCapture.clearSelectionWithin).
- claude-read: A shortcut whose `when()` is false now lets lower shortcut contexts match the same key, rather than ending the search at that context.

## Findings

A: 0
B: 6
C: 0

### claude-read:TP-1 — bucket B, LOW, open

Claim: The global shortcut dispatcher frontend/src/components/ShortcutsProvider.tsx is edited, but the touch-point list names only `frontend/src/lib/shortcuts.ts` and `useShortcuts`.
Impact: Every shortcut on every page goes through this dispatcher. The new `when` gate (`if (s.when && !s.when()) return false;`) changes which context matches a key: when `when()` returns false, the search falls through to lower contexts instead of stopping. This is a cross-app behaviour change in a file the plan did not name. Today the only `when` user is the find binding, so no existing shortcut changes behaviour.
Evidence: frontend/src/components/ShortcutsProvider.tsx:107 adds the `when` predicate inside the matcher. frontend/src/lib/shortcuts.ts:17 adds `when?: () => boolean`. FileDetailShell.tsx passes `when: canTakeFind` for `ctrl+f`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add ShortcutsProvider.tsx to the touch points, or move the gate into useShortcuts/shortcuts.ts.

</details>

### claude-read:TP-2 — bucket B, LOW, open

Claim: frontend/src/components/markdown/MarkdownDocumentLayout.tsx is edited to draw the FindButton in its page row and to pass `findEnabled` to FileDetailShell, but it is not in the touch-point list.
Impact: Markdown and plain-text files have their own page row. That row now holds the find button, and through `findEnabled` it decides whether the Cmd/Ctrl+F shortcut is registered for those files. So I7 and I10 depend on a host that the plan does not list as one: the list names only FileDetailChrome.tsx for the button.
Evidence: MarkdownDocumentLayout.tsx draws `{findEnabled && <FindButton />}` in chromeControls, also in the `previewOnly` branch, and passes `findEnabled={findEnabled}` to FileDetailShell. ShellLayout.tsx passes `findEnabled` into MarkdownDocumentLayout. FileDetailChrome.tsx, the listed host for the button, is not in the visible diff.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List MarkdownDocumentLayout.tsx as a host of the button and the shortcut flag.

</details>

### claude-read:TP-3 — bucket B, LOW, open

Claim: frontend/src/lib/documentCapture.ts gains `clearSelectionWithin`, and PdfPreview's page-change effect now uses it instead of `window.getSelection()?.removeAllRanges()`. Neither documentCapture.ts nor this behaviour change is in the touch points.
Impact: Turning a PDF page used to clear any selection in the document. Now it clears only a selection inside the PDF root, so a selection elsewhere on the page survives a page turn. The touch points describe the PdfPreview change only as find marks and the current mark, and the spec says selection is unchanged.
Evidence: frontend/src/lib/documentCapture.ts:102-114 (new `clearSelectionWithin`). frontend/src/components/PdfPreview.tsx:240-244 (effect on `[page, store]` now calls `clearSelectionWithin(root, window.getSelection())`).
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add documentCapture.ts and the selection-clearing scope to the touch points.

</details>

### claude-read:TP-4 — bucket B, INFO, open

Claim: New shared modules outside the declared places were added: frontend/src/hooks/useFindMarksIn.ts, frontend/src/lib/findMarks.ts and frontend/src/lib/findShortcut.ts. The plan lists only 'a new find client beside semanticSearch.ts' in lib/, which is fileFind.ts.
Impact: These modules carry the I5 mark and current-mark logic and the I7 suppression test: `aria-modal`, fullscreenElement and `data-player-fullscreen`. A reviewer working from the plan would not look for the I5/I7 logic there.
Evidence: frontend/src/hooks/useFindMarksIn.ts is imported by MarkdownPreview.tsx, TextLines.tsx and PdfPreview.tsx. frontend/src/lib/findMarks.ts holds `isTextFindRow`. frontend/src/lib/findShortcut.ts:8-14 holds `canTakeFindShortcut`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List these modules in the touch points.

</details>

### claude-read:TP-5 — bucket B, INFO, open

Claim: docs/user-guide/search.md is edited, but the docs touch points name only the file-page guide and keyboard-shortcuts.md.
Impact: Documentation only. The Passages view guide now says the link opens the file with find already searching.
Evidence: In the diff, docs/user-guide/search.md changes two bullets about 「このファイルの他の箇所 →」.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

### claude-read:TP-6 — bucket B, INFO, open

Claim: Core test and fixture files outside any declared place are edited: frontend/src/__tests__/ime-enter-guard.test.ts (the declared count goes from 19 to 20, and useFindInFile.ts is added), frontend/e2e-epub/findShortcut.spec.ts and frontend/e2e-epub/fixtures/host.html. The touch points list tests only for the addon.
Impact: A repository-wide guard test is edited to admit the new Enter handler. A reader of the plan would not expect a project-wide lint-style test to change.
Evidence: ime-enter-guard.test.ts adds 'components/FileDetail/find/useFindInFile.ts' and `toHaveLength(20)`. host.html adds `setFindIntercept` and the `find` query parameter on `open`.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: The diff was truncated at 200000 bytes. Files after PassageList.tsx were not seen in the diff: messages-core, canonicalFileUrl.ts, useSelectedFile.ts, searchPassages.ts, epubReaderChannel.ts, FileDetailContent.tsx, FileDetailChrome.tsx, pdfController/documentController, and possibly others. Any unlisted place among them is not reported.
- claude-read: The contents of the addons/intelligence submodule at 53b9e1072 were not checked for places outside the addon touch points.
- claude-read: I did not compare the single commit f5e18f786 against the branch diff. Without git, I reviewed the diff as provided.
- claude-read: Whether frontend/pnpm-lock.yaml or other config files changed.
- claude-verify: I could not run git diff against origin/develop, so the claims that these files are new or changed in this range (and the earlier removeAllRanges call) were inferred from the current content.
- claude-verify: I did not run any tests.
- claude-verify: I did not check the addon submodule.

TOTAL: 6 findings
