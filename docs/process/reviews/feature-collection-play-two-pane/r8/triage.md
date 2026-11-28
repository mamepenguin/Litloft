# Triage: r8

## Trajectory

This run:
- claude-read: Each r7 fix round adds a new piece of state or a new branch to patch something the earlier rounds introduced. 0a1ba745 adds a `replacesTrail` flag to QueuePageState, splitting the queue-page trail override added earlier. 16ac5ada adds a `visitUntilLeft` prop and two refs (visitRoute, visitStarted) to the treeVisitStore visit logic added earlier, and that new state introduces F1: the toggle's filePage branch never anticipated a visit with no file. bc6be1f1 adds a `sidebarOverlay` field to LeftPaneState to gate the `extraRowWidth` adjustment added in the previous round. Only 5fe9be41 removes a branch (`onSelect` is no longer conditional on fileId). The tree-pane visibility logic is being patched: visit, yield, narrow-open and filePage are now four interacting stores/flags, and the latest fix produced a new breach where two of them meet.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER

## Read coverage

Product files:
- frontend/e2e-components/collection-workbench-metrics-desktop.spec.ts — full: Deleted file; whole content in the diff.
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — partial: Changed hunk only.
- frontend/e2e-components/file-header-row-desktop.spec.ts — partial: Changed hunks only.
- frontend/e2e-components/fixtures/app.tsx — partial: Changed hunks only.
- frontend/e2e-components/fixtures/fileHeaderRow.tsx — partial: Changed hunks only.
- frontend/e2e-components/fixtures/focusMode.tsx — partial: Changed hunks only.
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — partial: Changed hunks only.
- frontend/e2e-components/fixtures/queuePage.tsx — full: New file; whole content in the diff, plus the r7 fix hunk.
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
- frontend/src/components/CollectionDetail.tsx — partial: Changed hunks in the diff, including the r7 fix hunks.
- frontend/src/components/CollectionItemsPane.tsx — partial: Changed hunks in the diff.
- frontend/src/components/CollectionPanel.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/CollectionPicker.tsx — partial: Changed hunks only.
- frontend/src/components/FileActions.tsx — partial: Changed hunk with enclosing handleDelete.
- frontend/src/components/FileDetail/FileDetailCanvas.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/FileDetail/FileDetailChrome.tsx — partial: Changed hunks in the diff, including the r7 replacesTrail fix.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Changed hunks in the diff.
- frontend/src/components/FileDetail/FileDetailSkeleton.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/FileNavControls.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/hooks/useInspectorFit.ts — partial: Changed hunks only.
- frontend/src/components/FileDetail/workbench/panels.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetailFullScreen.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/FileDetailShell.tsx — partial: Changed hunks, including the r7 extraRowWidth fix.
- frontend/src/components/FolderBrowser.tsx — partial: Changed hunk with handlePlayAll.
- frontend/src/components/SmartFolderSaveButton.tsx — partial: Changed hunks only.
- frontend/src/components/TreeToggle.tsx — partial: Changed hunks plus lines 30-54 read from the file.
- frontend/src/components/VideoPlayer.tsx — partial: Changed hunks only.
- frontend/src/components/folder/RightPaneFile.tsx — partial: Changed hunks in the diff.
- frontend/src/components/folder/TwoPaneLayout.tsx — partial: Lines 60-259 read from the file, plus diff hunks.
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
- frontend/src/hooks/useTreeVisible.ts — partial: Diff hunks plus lines 55-94 read from the file.
- frontend/src/lib/canonicalFileUrl.ts — partial: Changed hunks in the diff.
- frontend/src/lib/collectionChanged.ts — full: New file; whole content in the diff.
- frontend/src/lib/fileDetailShell.ts — partial: Changed hunks only.
- frontend/src/lib/fileNavContext.tsx — partial: Changed hunk only.
- frontend/src/lib/leftPaneContext.ts — partial: Changed hunks, including the sidebarOverlay field.
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
- frontend/src/components/FileDetail/__tests__/FileDetailChrome.test.tsx — partial: Changed hunks only (new trail cases).
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
- frontend/src/components/__tests__/CollectionDetail.queue.test.tsx — full: New file; content in the diff, including the r7 additions.
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
- frontend/src/components/folder/__tests__/TwoPaneLayout.queuePane.test.tsx — full: New file; content in the diff.
- frontend/src/components/queue/__tests__/queue.test.ts — full: New file; content in the diff.
- frontend/src/hooks/__tests__/useFileNav.test.tsx — partial: Changed hunks only.
- frontend/src/hooks/__tests__/useSelectedFile.test.tsx — partial: Changed hunk only.
- frontend/src/lib/__tests__/fileDetailShell.test.ts — partial: Changed hunks only.

## Unspecified behavior, recorded

- claude-read: On a collection page with the tree setting off, opening any file (a grid card or a link, not only Play or a row) starts the visit, and the item pane then stays shown on the collection list until the page is left.
  - F3 × I2 = 6, claude-read: `visitStarted` is set by any `queuePane && hasFile`, so a card click with the tree off leaves the pane on the list afterwards.
  - F4 × I2 = 8, claude-verify: With the tree setting off, opening any file on a collection page from a grid card or link sets queuePane (CollectionDetail.tsx:445) and starts the visit, so the item pane then stays on the collection list. This is consistent with a collection being a queue page and is mostly harmless.
- claude-read: Ending a folder queue (×, a choice outside the queue, or clearFile) removes `sort` and `order` even when they were the listing's own URL sort.
  - F2 × I3 = 6, claude-read: The user sorts by URL, plays, and closes the queue. The listing falls back to its stored sort.
  - F2 × I3 = 6, claude-verify: A reader who had a URL sort on the folder listing before pressing Play all finds the listing back in its default sort after ending the queue, and has to pick the sort again.
- claude-read: A play intent left pending by a selection that the navigation guard cancelled is consumed by the next arrival at that file by any route, which then autoplays.
  - F1 × I2 = 2, claude-read: playIntent.ts holds the id until takePlayIntent matches it.
  - F1 × I3 = 3, claude-verify: It needs a queue selection cancelled by the unsaved-changes guard, followed by a later arrival at the same file. That file then starts playing despite Autoplay being off, which is surprising but easy to pause.
- claude-read: A visit-shown pane that the reader hid comes back after the viewport crosses md and returns, because the visit is cleared below md and shown again above it.
  - F1 × I2 = 2, claude-read: TwoPaneLayout clears the visit when besideViewport is false and calls show() again with hidden=false.
  - F1 × I2 = 2, claude-verify: Resizing or rotating across md brings a visit pane the reader hid back into view, and one press hides it again.

## Findings

A: 1
B: 1
C: 0

### claude-read:F1 — bucket A, MEDIUM, open

Claim: On a collection page's list, with the tree setting off and the item pane kept for the visit after `?file=` is cleared, the tree button writes `tree:enabled:{drive}` on every press and cannot hide the pane.
Impact: After Play with the tree off, the user returns to the collection list (collection crumb or pane name) and presses the pane button to hide the pane. The press stores `true`. The next press stores `false`, and the visit immediately re-shows the pane. The pane never hides, and the stored tree setting changes for every later page of the drive. This happens silently in ordinary use.
Evidence: TwoPaneLayout.tsx:172-175 clears treeYieldStore (filePage=false) whenever no file is open. TwoPaneLayout.tsx:141-152, added by 16ac5adaf, keeps treeVisitStore active on the list through `visitUntilLeft && visitStarted.current`. useTreeVisible.ts:66 sends the press to the visit toggle only when `yieldState.filePage`. Otherwise useTreeVisible.ts:83-85 runs `setEnabled(!enabled)`, which writes storage. visible = visitVisible || … (useTreeVisible.ts:58-59) stays true. Once enabled is false again, TwoPaneLayout.tsx:143-152 calls show() again. TreeToggle.tsx:46 calls this toggle, and routeHidesTree does not hide the button on a collection route (driveViews.ts:74-91).
Repro: not_reproduced (read only). Steps: tree:enabled:main=false, md+ width. Open /drive/main/collections/c1, press Play, then press the pane's collection name (?file= cleared, pane stays shown). Press the tree toggle: localStorage tree:enabled:main becomes 'true' and the pane stays. Press again: it becomes 'false', the visit re-shows, and the pane stays. Mutation check: the new test in CollectionDetail.queue.test.tsx ('keeps the item pane when the collection name clears ?file=') never presses the toggle on the list and mocks TreeToggle to null, so it would not catch this.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Route the press to treeVisitStore.toggle whenever the visit is active, not only on a file page. For example, check `visit.active && besideViewport` before the `yieldState.filePage` branch.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The test added for the r7 F8 fix covers only the pane's visibility after `?file=` is cleared. No test covers the tree button on that list, and none covers the hidden state across that transition.
Impact: F1 passed the suite. The test file mocks TreeToggle to null (CollectionDetail.queue.test.tsx), so no interaction with the kept visit is exercised.
Evidence: CollectionDetail.queue.test.tsx mocks '@/components/TreeToggle' to `() => null`. TwoPaneLayout.queuePane.test.tsx exercises the toggle only with a file open (route params 'file=f1').
Repro: Mutation: delete the `visitUntilLeft` condition's interplay with useTreeVisible.toggle, or swap the branch order in useTreeVisible.toggle. No existing test changes outcome.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add a case to TwoPaneLayout.queuePane.test.tsx that renders with `visitUntilLeft`, opens a file, clears it, presses the toggle and asserts that localStorage is untouched and the pane hides.

</details>

## Not verified

- claude-read: I did not run any test, build or browser. F1 comes from reading the code.
- claude-read: I did not read AppShell or SidebarProvider to confirm the timing of the padding transition for the sidebarOverlay fix.
- claude-read: I did not re-read ShellLayout, MarkdownDocumentLayout, RightPaneFile or the players beyond the diff for this round.
- claude-read: I did not verify I1 (the watch record on end) in the player progress hooks.
- claude-read: I did not check whether another control on the collection list (e.g. ChromeButtons' DriveTreeToggle) shares the same toggle path.
- claude-verify: I did not run any test or the app. F1 was traced by reading the code only.
- claude-verify: I did not check whether ChromeButtons or another host renders TreeToggle at md and wider on the collection route beyond TreeToggle's own guards.
- claude-verify: I did not trace the play-intent consumption path (unspecified entry 2) in the queue module.

TOTAL: 2 findings
