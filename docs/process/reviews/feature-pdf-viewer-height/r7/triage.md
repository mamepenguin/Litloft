# Triage: r7

## Trajectory

This run:
- claude-read: Yes, the design is being patched: each fix round adds state or a branch on top of one the previous round added. In core, the earlier round added a lifted `tabRequest` state with a sequence counter so that `select()` could reach a shell that is not mounted yet. This round adds a retirement protocol on top of it (`onSelectRequestTaken`, `retireTabRequest`, `takenRef`) to undo that state's side effect, the replay on every later mount. In the add-on, the earlier round put an unconditional generating mark, availability report and `select()` inside `doRegenerate`. This round adds an `announce` parameter, a separate `handleRegenerate`, and a `data?.available &&` precondition on the confirm gate to narrow that behaviour back to the AI-menu path and to work around the dialog being drawn only in the body. Each fix is a predicate layered on the previous one, not a simplification. The round also removed two things: the unconditional `select()` on every regenerate path, and the confirmation for a never-generated summary beside an active note (which could never render).

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: HUMAN_REVIEW_REQUIRED

Reasons:
- unspecified_behavior
- unspecified_behavior

## Read coverage

Product files:
- addons/intelligence/frontend/CitationInlinePanel.tsx — partial: Diff hunks only; the fix commits do not change it.
- addons/intelligence/frontend/DetailedSummaryDocumentSide.test.tsx — full: New file, read in full in the diff, including the r7 additions.
- addons/intelligence/frontend/DetailedSummarySection.tsx — partial: Lines 120-640 (the whole component body around doRegenerate, startGenerate and the handlers, plus the render branches), the diff hunks, and a grep of onChoose/onGenerateWith call sites.
- addons/intelligence/manifest.json — partial: Diff hunk.
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — full: New file, read in full in the diff.
- frontend/e2e-components/document-summary-inspector.spec.ts — full: New file, read in full in the diff.
- frontend/e2e-components/fixtures/app.tsx — partial: Diff hunks.
- frontend/e2e-components/fixtures/focusMode.tsx — partial: Diff hunks.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: Diff hunks.
- frontend/e2e-components/projects.ts — partial: Diff hunk.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Diff hunks.
- frontend/e2e-components/stubs/addons.ts — partial: Diff hunks.
- frontend/e2e-components/stubs/documentSideSlot.tsx — full: New file, read in full in the diff.
- frontend/e2e-components/stubs/next-navigation.ts — partial: Diff hunks.
- frontend/src/app/globals.css — partial: Diff hunks.
- frontend/src/components/ArchivePreview.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Diff hunk.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/MediaCanvas.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/MediaPlayerBlock.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Lines 170-750 (every changed hunk with its enclosing function body). The import and props header were seen in the diff.
- frontend/src/components/FileDetail/hooks/useCanvasFloor.ts — full: Deleted; the whole file is in the diff.
- frontend/src/components/FileDetail/inspector/InspectorShell.tsx — full: Read the whole file at HEAD.
- frontend/src/components/FileDetail/inspector/tabs.ts — partial: Diff hunks.
- frontend/src/components/FileDetail/lowerInspector.tsx — partial: Diff hunk.
- frontend/src/components/FileDetailShell.tsx — partial: Lines 440-537 (the raise effect and the render), plus the diff hunks.
- frontend/src/components/FilePreview.tsx — partial: Diff hunks.
- frontend/src/components/InspectorPane.tsx — full: The diff shows nearly the whole file.
- frontend/src/components/PdfPreview.tsx — partial: Diff hunks.
- frontend/src/components/epub/EpubPreview.tsx — partial: Import hunk.
- frontend/src/components/epub/useFillHeight.ts — full: Deleted; the whole file is in the diff.
- frontend/src/hooks/useFillHeight.ts — full: New file, read in full in the diff.
- frontend/src/lib/addons.ts — partial: Diff hunk.
- frontend/src/lib/fileDetailShell.ts — partial: Diff hunks.
- frontend/src/lib/layoutSizes.ts — partial: Diff hunk.

Test files:
- addons/intelligence/frontend/ScenesSection/__tests__/WorkbenchManifest.test.ts — partial: Diff hunk.
- frontend/src/__tests__/i18n-keys.test.ts — partial: Diff hunks.
- frontend/src/components/FileDetail/__tests__/DocumentSideJump.test.tsx — full: New file, read in full in the diff.
- frontend/src/components/FileDetail/__tests__/DocumentSideSlot.test.tsx — full: New file, read in full in the diff, including the r7 reopen test.
- frontend/src/components/FileDetail/__tests__/FileDetailContent.test.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/__tests__/MediaShell.test.tsx — partial: Diff hunk.
- frontend/src/components/FileDetail/__tests__/ViewerShell.test.tsx — partial: Diff hunks.
- frontend/src/components/FileDetail/hooks/__tests__/useCanvasFloor.test.tsx — full: Deleted; the whole file is in the diff.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Diff hunk.
- frontend/src/components/archive/__tests__/archiveJustifiedCells.test.tsx — partial: Diff hunks.
- frontend/src/lib/__tests__/fileDetailShell.test.ts — partial: Diff hunks.

## Needs a human

### unspecified_behavior

Note: A request is retired by whichever shell takes it, even when the requested tab is not listed in that shell at that moment, so the request is dropped. Before the fix, an unlisted target was not applied later either, because the effect is keyed on seq. Behaviour is unchanged, but the retire step now makes the drop permanent.; A `tabRequest` made while no shell is mounted (for example a find request on a phone with the sheet at peek) still lingers until a shell mounts. It is not reset on a file change, so it could be applied on the next file's first shell if that tab id is listed there. Not traced through find's own open/close handling.
- claude-read: A request is retired by whichever shell takes it, even when the requested tab is not listed in that shell at that moment, so the request is dropped. Before the fix, an unlisted target was not applied later either, because the effect is keyed on seq. Behaviour is unchanged, but the retire step now makes the drop permanent.
- claude-read: A `tabRequest` made while no shell is mounted (for example a find request on a phone with the sheet at peek) still lingers until a shell mounts. It is not reset on a file change, so it could be applied on the next file's first shell if that tab id is listed there. Not traced through find's own open/close handling.
- claude-verify: The sheet's state after select() when it starts at full is not covered by I11 as written; the code keeps it at full.

### unspecified_behavior

Note: The sheet's state after select() when it starts at full is not covered by I11 as written; the code keeps it at full.
- claude-read: A request is retired by whichever shell takes it, even when the requested tab is not listed in that shell at that moment, so the request is dropped. Before the fix, an unlisted target was not applied later either, because the effect is keyed on seq. Behaviour is unchanged, but the retire step now makes the drop permanent.
- claude-read: A `tabRequest` made while no shell is mounted (for example a find request on a phone with the sheet at peek) still lingers until a shell mounts. It is not reset on a file change, so it could be applied on the next file's first shell if that tab id is listed there. Not traced through find's own open/close handling.
- claude-verify: The sheet's state after select() when it starts at full is not covered by I11 as written; the code keeps it at full.

## Findings

A: 0
B: 1
C: 0

### claude-read:R7-1 — bucket B, LOW, open

Claim: On a phone, `select()` leaves the sheet at `full` when it is already there, so I11's 'on a phone the sheet is at its half snap' does not hold if the reader starts generation from the AI button while the sheet is fully raised.
Impact: A reader who has dragged the sheet to full and starts a detailed summary from the AI menu gets the tab selected, but the sheet stays at full rather than half. The viewer stays covered. Nothing fails silently: the tab is selected and shows its generating state.
Evidence: frontend/src/components/FileDetailShell.tsx:462-470: `setSheetState(prev => isSheetExpanded(prev) ? prev : SHEET_STATE_HALF)`, and the comment there says 'At `full` it is already above that and stays'. ShellLayout.tsx:435-441 bumps `sheetRaiseRequest` from `select()`. The phone e2e test (document-summary-inspector.spec.ts, I11 phone) and DocumentSideSlot.test 'on a phone raises the sheet to its half snap' both start from the strip-raised sheet only, never from full.
Repro: not_reproduced (traced in code: sheet state full → raise effect keeps prev)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either state in I11 that a sheet already at full stays at full, or set the sheet to half unconditionally.

</details>

## Not verified

- claude-read: Did not run any unit or e2e test.
- claude-read: Did not read the jsdom harness (`__tests__/harness.tsx`) to confirm that the reopen test's entry keeps its reported availability across remount, which is what makes that test kill the missing retire.
- claude-read: Did not read MobileInspectorSheet to confirm that the sheet's InspectorShell is unmounted at peek.
- claude-read: Did not trace find's `selectRequest` producer for whether find opening on a phone raises the sheet.
- claude-read: Did not re-read EpubPreview, MediaCanvas, MediaPlayerBlock, PdfPreview or ArchivePreview beyond the diff hunks, since the r7 fix commits do not touch them.
- claude-verify: Did not run the e2e or unit tests; the verification is from static reading only.
- claude-verify: Did not confirm exactly where the intelligence AI-menu button renders on a phone, or that it is visible above the full-snap sheet; I inferred it is reachable from the 0.9 snap and modal={false}.
- claude-verify: Did not check the other invariants (I1-I10, I12, I13).

TOTAL: 1 findings
