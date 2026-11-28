# Triage: r9

## Trajectory

This run:
- claude-read: The r8 fix (fbec1054) adds no new state, prop or store. It moves the existing `visit.active` branch in useTreeVisible.toggle out of the `yieldState.filePage` block, puts it in front of that block with a `!yieldState.yielded` guard, and removes the inner `else if (visit.active)` arm. Net, this round relocates a branch and deletes one, rather than adding a branch on top of the previous round's. The earlier pattern still stands: r7's fixes added `replacesTrail`, `visitUntilLeft` with two refs, and `sidebarOverlay`, and r8's breach came from where the visit and yield/filePage states meet. This round closes that seam without adding to it. The tree-pane visibility still rests on four interacting stores (enabled, narrow-open, yield, visit), and the remaining low-impact behaviours (hidden visit kept across a new Play, re-shown after an md crossing) sit on the same visit/hidden state.

Earlier runs:
- r8 / claude-read: Each r7 fix round adds a new piece of state or a new branch to patch something the earlier rounds introduced. 0a1ba745 adds a `replacesTrail` flag to QueuePageState, splitting the queue-page trail override added earlier. 16ac5ada adds a `visitUntilLeft` prop and two refs (visitRoute, visitStarted) to the treeVisitStore visit logic added earlier, and that new state introduces F1: the toggle's filePage branch never anticipated a visit with no file. bc6be1f1 adds a `sidebarOverlay` field to LeftPaneState to gate the `extraRowWidth` adjustment added in the previous round. Only 5fe9be41 removes a branch (`onSelect` is no longer conditional on fileId). The tree-pane visibility logic is being patched: visit, yield, narrow-open and filePage are now four interacting stores/flags, and the latest fix produced a new breach where two of them meet.

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Read coverage

Product files:
- frontend/e2e-components/collection-workbench-metrics-desktop.spec.ts — full: Deleted file; whole content in the diff.
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — partial: Changed hunk only.
- frontend/e2e-components/file-header-row-desktop.spec.ts — partial: Changed hunks only.
- frontend/e2e-components/fixtures/app.tsx — partial: Changed hunks only.
- frontend/e2e-components/fixtures/fileHeaderRow.tsx — partial: Changed hunks only.
- frontend/e2e-components/fixtures/focusMode.tsx — partial: Changed hunks only.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: Changed hunks only.
- frontend/e2e-components/fixtures/queuePage.tsx — full: New file; whole content in the diff.
- frontend/e2e-components/focus-mode-desktop.spec.ts — partial: Changed hunks only.
- frontend/e2e-components/header-row-crowding.spec.ts — partial: Changed hunk only.
- frontend/e2e-components/player-workbench-desktop.spec.ts — partial: Changed hunks only.
- frontend/e2e-components/projects.ts — partial: Changed hunks only.
- frontend/e2e-components/queue-page-desktop.spec.ts — full: New file; whole content in the diff.
- frontend/e2e-components/queue-page-phone.spec.ts — full: New file; whole content in the diff.
- frontend/e2e-components/scenes-scroll-list-desktop.spec.ts — partial: Changed hunks only.
- frontend/e2e-components/scenes-scroll-list.cases.ts — partial: Changed hunk only.
- frontend/e2e-components/spec-viewport.spec.ts — partial: Changed hunks only.
- frontend/e2e-components/workbench-no-panel-desktop.spec.ts — partial: Changed hunks only.
- frontend/e2e-components/workbench-split-desktop.spec.ts — partial: Changed hunks only.
- frontend/e2e-layout/fixtures/no-horizontal-scroll.html — partial: Changed hunks only.
- frontend/e2e-layout/no-horizontal-scroll-states.spec.ts — full: Deleted file; whole content in the diff.
- frontend/e2e-layout/no-horizontal-scroll.spec.ts — partial: Changed hunks only.
- frontend/src/app/drive/[name]/layout.tsx — partial: Changed hunks in the diff.
- frontend/src/app/files/[id]/page.tsx — full: Whole file shown by the diff hunks with context.
- frontend/src/app/globals.css — partial: Changed hunk only.
- frontend/src/components/ArchivePreview.tsx — partial: Changed hunks (comments only).
- frontend/src/components/AudioPlayer.tsx — partial: Changed hunks only.
- frontend/src/components/Breadcrumb.tsx — partial: Changed hunks only.
- frontend/src/components/ChromeButtons.tsx — partial: Changed hunks only.
- frontend/src/components/CollectionDetail.tsx — partial: Changed hunks in the diff.
- frontend/src/components/CollectionItemsPane.tsx — partial: Changed hunks in the diff.
- frontend/src/components/CollectionPanel.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/CollectionPicker.tsx — partial: Changed hunks only.
- frontend/src/components/FileActions.tsx — partial: Changed hunk with enclosing handleDelete.
- frontend/src/components/FileDetail/FileDetailCanvas.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/FileDetail/FileDetailChrome.tsx — partial: Changed hunks in the diff.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Changed hunks in the diff.
- frontend/src/components/FileDetail/FileDetailSkeleton.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/FileNavControls.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/hooks/useInspectorFit.ts — partial: Lines 75-144 read from the file plus diff hunks.
- frontend/src/components/FileDetail/workbench/panels.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetailFullScreen.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/FileDetailShell.tsx — partial: Changed hunks plus grep of lines 194-223 (yieldable, paneToYield).
- frontend/src/components/FolderBrowser.tsx — partial: Changed hunk with handlePlayAll.
- frontend/src/components/SmartFolderSaveButton.tsx — partial: Changed hunks only.
- frontend/src/components/TreeToggle.tsx — full: Read the whole file.
- frontend/src/components/VideoPlayer.tsx — partial: Changed hunks only.
- frontend/src/components/folder/RightPaneFile.tsx — partial: Changed hunks in the diff.
- frontend/src/components/folder/TwoPaneLayout.tsx — partial: Lines 100-229 read from the file plus diff hunks.
- frontend/src/components/markdown/MarkdownDocumentLayout.tsx — partial: Changed hunks only.
- frontend/src/components/queue/FolderQueueHost.tsx — full: New file; whole content in the diff.
- frontend/src/components/queue/QueuePageContext.tsx — full: New file; whole content in the diff.
- frontend/src/components/queue/QueuePane.tsx — full: New file; whole content in the diff.
- frontend/src/components/queue/QueueRows.tsx — full: New file; whole content in the diff.
- frontend/src/components/queue/QueueTrail.tsx — full: New file; whole content in the diff.
- frontend/src/components/queue/folderQueue.ts — full: New file; whole content in the diff.
- frontend/src/components/queue/loopStorage.ts — full: New file; whole content in the diff.
- frontend/src/components/queue/playIntent.ts — full: New file; whole content in the diff.
- frontend/src/components/queue/queue.ts — full: New file; whole content in the diff.
- frontend/src/components/queue/queuePagePresence.ts — full: New file; whole content in the diff.
- frontend/src/components/queue/queueSelectionStore.ts — full: New file; whole content in the diff.
- frontend/src/components/queue/smartQueueSource.ts — full: New file; whole content in the diff.
- frontend/src/components/sidebar/SidebarCollectionsSection.tsx — partial: Changed hunks only.
- frontend/src/hooks/useFileNav.ts — partial: Changed hunks in the diff.
- frontend/src/hooks/useSelectedFile.ts — partial: Changed hunks in the diff.
- frontend/src/hooks/useTreeVisible.ts — full: Read the whole file at HEAD, including the r8 fix.
- frontend/src/lib/canonicalFileUrl.ts — partial: Changed hunks in the diff.
- frontend/src/lib/collectionChanged.ts — full: New file; whole content in the diff.
- frontend/src/lib/fileDetailShell.ts — partial: Changed hunks only.
- frontend/src/lib/fileNavContext.tsx — partial: Changed hunk only.
- frontend/src/lib/leftPaneContext.ts — partial: Changed hunks only.
- frontend/src/lib/treeVisitStore.ts — full: New file; whole content in the diff.
- frontend/src/messages-core/en.json — partial: Changed hunk only.
- frontend/src/messages-core/ja.json — partial: Changed hunk only.

Test files:
- frontend/src/__tests__/section-rows.test.tsx — partial: Changed hunk only.
- frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts — full: Deleted file; content in the diff (skimmed).
- frontend/src/app/drive/[name]/__tests__/layout.queue.test.tsx — full: New file; content in the diff.
- frontend/src/app/files/[id]/__tests__/page.smartCollection.test.tsx — partial: Changed hunks only.
- frontend/src/app/files/[id]/__tests__/page.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/DocumentSideSlot.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/FileDetailCanvas.test.tsx — full: Deleted file; content in the diff (skimmed).
- frontend/src/components/FileDetail/__tests__/FileDetailChrome.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/FileDetailContent.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/FileDetailPageRow.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/FileNavControls.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/FindInFile.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/InspectorTabsSlot.test.tsx — partial: Changed hunk only.
- frontend/src/components/FileDetail/__tests__/LoftMetadataPlacement.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/PlainTextDocument.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/WorkbenchCollection.test.tsx — full: Deleted file; content in the diff (skimmed).
- frontend/src/components/FileDetail/__tests__/WorkbenchPendingEntry.test.tsx — partial: Changed hunk only.
- frontend/src/components/FileDetail/__tests__/WorkbenchPlayerFocus.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/WorkbenchRowBeside.test.tsx — partial: Changed hunks only.
- frontend/src/components/__tests__/CollectionDetail.queue.test.tsx — full: New file; content in the diff.
- frontend/src/components/__tests__/CollectionDetail.queueState.test.tsx — full: New file; content in the diff.
- frontend/src/components/__tests__/CollectionDetail.test.tsx — partial: Changed hunks only.
- frontend/src/components/__tests__/CollectionPanel.test.tsx — full: Deleted file; content in the diff (skimmed).
- frontend/src/components/__tests__/FileDetailFullScreen.headerRow.test.tsx — full: Deleted file; content in the diff (skimmed).
- frontend/src/components/__tests__/FileDetailFullScreen.inboxNav.test.tsx — full: Deleted file; content in the diff (skimmed).
- frontend/src/components/__tests__/FileDetailFullScreen.smartCollection.test.tsx — full: Deleted file; content in the diff (skimmed).
- frontend/src/components/__tests__/FileDetailFullScreen.test.tsx — full: Deleted file; content in the diff (skimmed).
- frontend/src/components/__tests__/FolderBrowser.playAll.test.tsx — full: New file; content in the diff.
- frontend/src/components/__tests__/QueueMediaSession.test.tsx — full: New file; content in the diff.
- frontend/src/components/__tests__/SearchPage.smartCollectionPlay.test.tsx — partial: Changed hunks only.
- frontend/src/components/__tests__/TreeToggle.test.tsx — partial: Changed hunks only.
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — partial: Changed hunks only.
- frontend/src/components/__tests__/noHorizontalScrollFixtureParity.test.tsx — partial: Changed hunks only.
- frontend/src/components/__tests__/queueStrings.test.ts — full: New file; content in the diff.
- frontend/src/components/folder/__tests__/TreeYield.test.tsx — partial: Changed hunks only.
- frontend/src/components/folder/__tests__/TwoPaneLayout.queueOverlay.test.tsx — full: New file; content in the diff.
- frontend/src/components/folder/__tests__/TwoPaneLayout.queuePane.test.tsx — full: New file; content in the diff, including the r8 fix case.
- frontend/src/components/queue/__tests__/queue.test.ts — full: New file; content in the diff.
- frontend/src/hooks/__tests__/useFileNav.test.tsx — partial: Changed hunks only.
- frontend/src/hooks/__tests__/useSelectedFile.test.tsx — partial: Changed hunk only.
- frontend/src/lib/__tests__/fileDetailShell.test.ts — partial: Changed hunks only.

## Unspecified behavior, recorded

- claude-read: A visit-shown pane that the reader hid stays hidden when a queue is started again on the same collection page (Play or a row choice).
  - F2 × I2 = 4, claude-read: show() is skipped while the visit is active, so after hiding the pane on the list and pressing Play the pane remains hidden until the button is pressed.
  - F2 × I3 = 6, claude-verify: After hiding the visit-shown pane and pressing Play or a row again on the same collection page, the user sees no queue pane until they press the tree button once.
- claude-read: On a collection page with the tree setting off, opening any file (a grid card or link) starts the visit, and the item pane then stays on the collection list until the page is left.
  - F4 × I2 = 8, claude-read: visitStarted is set by any queuePane && hasFile, so a card click leaves the pane shown on the list afterwards.
  - F4 × I2 = 8, claude-verify: With the tree setting off, opening any file of a collection (even from a grid card) shows the item pane, and the list keeps it until the user leaves the page; this is visible but harmless and can be hidden with the button.
- claude-read: Ending a folder queue removes `sort` and `order` even when they were the listing's own URL sort.
  - F2 × I3 = 6, claude-read: After a URL-sorted listing, Play all and ×, the listing falls back to its stored sort.
  - F2 × I3 = 6, claude-verify: When a folder queue ends on a listing whose URL already carried its own sort/order, the listing falls back to its default sort and the user must pick the sort again.
- claude-read: A visit-shown pane the reader hid comes back after the viewport crosses md and returns.
  - F1 × I2 = 2, claude-read: Below md the visit is cleared, and above md show() starts it again with hidden=false.
  - F1 × I2 = 2, claude-verify: Resizing or rotating across md brings back a visit pane the user hid; one press hides it again.
- claude-read: A play intent left pending by a selection that the navigation guard cancelled autoplays the next arrival at that file by any route.
  - F1 × I2 = 2, claude-read: playIntent.ts holds the id until takePlayIntent matches it.
  - F1 × I2 = 2, claude-verify: A cancelled queue selection leaves the module-level pending id (playIntent.ts:6-10), so a later arrival at that same file by any route starts playing even with Autoplay off.

## Findings

A: 0
B: 1
C: 0

### claude-read:F1 — bucket B, LOW, open

Claim: The visit's hidden flag is kept when a queue is started again on the same collection page, so after the reader hides the visit-shown pane, pressing Play or choosing a row again leaves the pane hidden with the tree setting off.
Impact: A reader who hid the pane on the collection list and then presses Play gets playback with no queue pane visible. One press of the pane button brings it back. Minor and easy to recover from.
Evidence: TwoPaneLayout.tsx:151-152 calls show() only when the visit is not active ('A pane the reader hid stays hidden until the button asks for it'). useTreeVisible.ts:48-49 hides a visit with hidden=true. CollectionDetail's playFile does not touch treeVisitStore. I13 says 'starting a queue at md or wider shows its pane'.
Repro: not_reproduced (read only). Steps: tree:enabled:main=false, md+ width. Open /drive/main/collections/c1, press Play, press the collection name (?file= cleared, pane kept), press the pane button (pane hides, nothing written), press Play. The pane stays hidden.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Decide whether Play/row choice re-shows a hidden visit pane; if so, call treeVisitStore.show on a queue start.

</details>

## Not verified

- claude-read: I did not run any test, build or browser; all claims come from reading.
- claude-read: I did not trace the yield measurement during the CSS width transition of a just-hidden pane (regression risk 2).
- claude-read: I did not re-read the players, RightPaneFile or the queue hosts beyond the diff for this round.
- claude-read: I did not verify I1 (watch record on end) in the player progress hooks.
- claude-verify: I did not run any tests or the app; every result comes from reading the code.
- claude-verify: I did not check whether FolderQueueHost or the Smart queue path handles re-starting after a hide in the same way.
- claude-verify: I did not check whether a cancelled navigation actually leaves the play intent pending (unspecified index 4).

TOTAL: 1 findings
