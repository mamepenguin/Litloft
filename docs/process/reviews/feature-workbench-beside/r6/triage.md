# Triage: r6

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

## Read coverage

Product files:
- frontend/e2e-components/projects.ts — full: The changed hunk (one array entry in DESKTOP_ONLY) and the array around it, read in the diff.
- frontend/e2e-components/spec-viewport.spec.ts — full: The changed hunk (one entry in AT_THE_DESKTOP_WIDTH) and the array around it, read in the diff.
- frontend/e2e-components/workbench-split-desktop.spec.ts — full: A new file. Its whole content was read in the diff.
- frontend/src/app/globals.css — partial: Read the whole new block after line 1151 in the diff and located it with Grep (lines 1163-1205). Did not read the existing workbench rules before it.
- frontend/src/components/FileDetail/MediaCanvas.tsx — full: Read the whole file.
- frontend/src/components/FileDetail/ShellLayout.tsx — full: Read the whole file.
- frontend/src/components/FileDetail/hooks/useCompanionMetrics.ts — full: Read the whole file.
- frontend/src/components/FileDetail/mediaHostStyle.ts — full: Read the whole file.
- frontend/src/components/FileDetail/workbench/Workbench.tsx — full: Read the whole file.
- frontend/src/lib/layoutSizes.ts — partial: Read lines 1-50, which include the changed hunk and the constants it derives from.
- frontend/src/lib/workbenchBeside.ts — full: The changed hunk contains the whole isRowBeside function, read in the diff.
- frontend/src/lib/workbenchSplit.ts — full: A new file. Its whole content was read in the diff.
- frontend/src/messages-core/en.json — full: Read the changed hunk (workbench.splitPanels) and its enclosing object in the diff.
- frontend/src/messages-core/ja.json — full: Read the changed hunk (workbench.splitPanels) and its enclosing object in the diff.
- frontend/src/test/setup.ts — partial: Read only the diff hunks (the import and the tail of afterEach), not the whole afterEach body.

Test files:
- frontend/src/lib/__tests__/workbenchBeside.test.ts — partial: Read the added describe block in the diff, and the earlier assertions only through Grep.
- frontend/src/lib/__tests__/workbenchSplit.test.ts — full: A new file, read in the diff.
- frontend/src/lib/__tests__/workbenchSplitMessages.test.ts — full: A new file, read in the diff.

## Findings

A: 0
B: 2
C: 0

### claude-read:R1 — bucket B, INFO, open

Claim: The W measurement added to ShellLayout (scroll-root state, a layout effect and a ResizeObserver) is wired through the wrapped `attachScrollRoot` callback into the MarkdownDocumentLayout branch as well. So it also runs on text, markdown and HTML-preview pages, which the touch-point list does not mention: it describes W only for the player canvas.
Impact: No visible effect was found. On non-player pages `splitEligible` is false because `workbenchWide` requires `hasPlayer`, so the measurement is unused. Each resize of the scroll container on a document page now causes one extra ShellLayout state update. MarkdownDocumentLayout gets a different callback identity but the same call semantics, and `setShellScrollRoot` is a stable setter, so this callback is not re-created on every render.
Evidence: frontend/src/components/FileDetail/ShellLayout.tsx:170-199 adds attachScrollRoot and the useLayoutEffect ResizeObserver. ShellLayout.tsx:560 passes `onScrollRootChange={attachScrollRoot}` to MarkdownDocumentLayout, the non-canvas branch, as well as to FileDetailShell at :491. MarkdownDocumentLayout.tsx:155 forwards it. ShellLayout.tsx:263-268 gates split on workbenchWide, which needs hasPlayer (:235-236).
Repro: not_reproduced. Found by reading: open a markdown file and the ShellLayout layout effect observes the scroll root, while `split` stays false.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Pass `attachScrollRoot` only on the `usesCanvasViewer` branch and keep `onScrollRootChange` on the MarkdownDocumentLayout branch. Alternatively, return early from the measuring effect when `!hasPlayer`.

</details>

### claude-read:R2 — bucket B, INFO, open

Claim: The new globals.css rules style MediaPlayerBlock's `.media-detail-player[data-framed="true"]` box (max-width, margin-inline, grid placement), and its `> * + *` rule also reaches the host's third child, the heavy-summaries wrapper. Neither MediaPlayerBlock.tsx nor that wrapper is a named touch point.
Impact: No user-visible defect was found. On a player file the summaries wrapper is empty and `empty:hidden`, so it takes no grid cell. The player box keeps its parent, which matches the placement mechanism. This is listed only as reach into an element whose markup the change depends on, the `media-detail-player` class and the `data-framed` attribute, without editing that file.
Evidence: globals.css new block (diff lines after 1151): `.media-detail-host[data-workbench-split="on"] > .media-detail-player[data-framed="true"] { max-width: calc(var(--player-avail, 100dvh) * 16 / 9); margin-inline: 0; }`. MediaPlayerBlock.tsx:92-93 defines `className="media-detail-player"` and `data-framed`. MediaCanvas.tsx:88-90 is the third host child.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: Did not run any test, vitest or Playwright. Every claim comes from reading the code.
- claude-read: Did not read the existing globals.css workbench rules before line 1151 to confirm specificity and order against the new block.
- claude-read: Did not read FileDetailPresenter.tsx (collection surface) beyond the grep showing it calls mediaHostStyle(metrics) without the split argument.
- claude-read: Did not verify whether the commit 7a8e9e9f2 itself touches only docs; the review was done against the diff supplied.
- claude-verify: I could not run git diff, so I did not confirm that MarkdownDocumentLayout previously received onScrollRootChange directly rather than through attachScrollRoot.
- claude-verify: I did not check any rendered geometry in a browser (I2, I3).
- claude-verify: I did not read the rest of the diff (Workbench.tsx, workbenchSplit.ts, mediaHostStyle.ts) beyond what the two findings needed.

TOTAL: 2 findings
