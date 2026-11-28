# Triage: r6

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- artifact of claude-read is missing
- no read or mutate reviewer in the expected set

## Read coverage

Product files:
- frontend/e2e-components/collection-workbench-metrics-desktop.spec.ts — missing from coverage
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — missing from coverage
- frontend/e2e-components/file-header-row-desktop.spec.ts — missing from coverage
- frontend/e2e-components/fixtures/app.tsx — missing from coverage
- frontend/e2e-components/fixtures/fileHeaderRow.tsx — missing from coverage
- frontend/e2e-components/fixtures/focusMode.tsx — missing from coverage
- frontend/e2e-components/fixtures/inspectorResponsive.tsx — missing from coverage
- frontend/e2e-components/fixtures/queuePage.tsx — missing from coverage
- frontend/e2e-components/focus-mode-desktop.spec.ts — missing from coverage
- frontend/e2e-components/header-row-crowding.spec.ts — missing from coverage
- frontend/e2e-components/player-workbench-desktop.spec.ts — missing from coverage
- frontend/e2e-components/projects.ts — missing from coverage
- frontend/e2e-components/queue-page-desktop.spec.ts — missing from coverage
- frontend/e2e-components/queue-page-phone.spec.ts — missing from coverage
- frontend/e2e-components/scenes-scroll-list-desktop.spec.ts — missing from coverage
- frontend/e2e-components/scenes-scroll-list.cases.ts — missing from coverage
- frontend/e2e-components/spec-viewport.spec.ts — missing from coverage
- frontend/e2e-components/workbench-no-panel-desktop.spec.ts — missing from coverage
- frontend/e2e-components/workbench-split-desktop.spec.ts — missing from coverage
- frontend/e2e-layout/fixtures/no-horizontal-scroll.html — missing from coverage
- frontend/e2e-layout/no-horizontal-scroll-states.spec.ts — missing from coverage
- frontend/e2e-layout/no-horizontal-scroll.spec.ts — missing from coverage
- frontend/src/app/drive/[name]/layout.tsx — missing from coverage
- frontend/src/app/files/[id]/page.tsx — missing from coverage
- frontend/src/app/globals.css — missing from coverage
- frontend/src/components/ArchivePreview.tsx — missing from coverage
- frontend/src/components/AudioPlayer.tsx — missing from coverage
- frontend/src/components/Breadcrumb.tsx — missing from coverage
- frontend/src/components/ChromeButtons.tsx — missing from coverage
- frontend/src/components/CollectionDetail.tsx — missing from coverage
- frontend/src/components/CollectionItemsPane.tsx — missing from coverage
- frontend/src/components/CollectionPanel.tsx — missing from coverage
- frontend/src/components/CollectionPicker.tsx — missing from coverage
- frontend/src/components/FileActions.tsx — missing from coverage
- frontend/src/components/FileDetail/FileDetailCanvas.tsx — missing from coverage
- frontend/src/components/FileDetail/FileDetailChrome.tsx — missing from coverage
- frontend/src/components/FileDetail/FileDetailContainer.tsx — missing from coverage
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — missing from coverage
- frontend/src/components/FileDetail/FileDetailSkeleton.tsx — missing from coverage
- frontend/src/components/FileDetail/FileNavControls.tsx — missing from coverage
- frontend/src/components/FileDetail/ShellLayout.tsx — missing from coverage
- frontend/src/components/FileDetail/hooks/useInspectorFit.ts — missing from coverage
- frontend/src/components/FileDetail/workbench/panels.tsx — missing from coverage
- frontend/src/components/FileDetailFullScreen.tsx — missing from coverage
- frontend/src/components/FileDetailShell.tsx — missing from coverage
- frontend/src/components/FolderBrowser.tsx — missing from coverage
- frontend/src/components/SmartFolderSaveButton.tsx — missing from coverage
- frontend/src/components/TreeToggle.tsx — missing from coverage
- frontend/src/components/VideoPlayer.tsx — missing from coverage
- frontend/src/components/folder/RightPaneFile.tsx — missing from coverage
- frontend/src/components/folder/TwoPaneLayout.tsx — missing from coverage
- frontend/src/components/markdown/MarkdownDocumentLayout.tsx — missing from coverage
- frontend/src/components/queue/FolderQueueHost.tsx — missing from coverage
- frontend/src/components/queue/QueuePageContext.tsx — missing from coverage
- frontend/src/components/queue/QueuePane.tsx — missing from coverage
- frontend/src/components/queue/QueueRows.tsx — missing from coverage
- frontend/src/components/queue/QueueTrail.tsx — missing from coverage
- frontend/src/components/queue/folderQueue.ts — missing from coverage
- frontend/src/components/queue/loopStorage.ts — missing from coverage
- frontend/src/components/queue/playIntent.ts — missing from coverage
- frontend/src/components/queue/queue.ts — missing from coverage
- frontend/src/components/queue/queuePagePresence.ts — missing from coverage
- frontend/src/components/queue/queueSelectionStore.ts — missing from coverage
- frontend/src/components/queue/smartQueueSource.ts — missing from coverage
- frontend/src/components/sidebar/SidebarCollectionsSection.tsx — missing from coverage
- frontend/src/hooks/useFileNav.ts — missing from coverage
- frontend/src/hooks/useSelectedFile.ts — missing from coverage
- frontend/src/hooks/useTreeVisible.ts — missing from coverage
- frontend/src/lib/canonicalFileUrl.ts — missing from coverage
- frontend/src/lib/collectionChanged.ts — missing from coverage
- frontend/src/lib/fileDetailShell.ts — missing from coverage
- frontend/src/lib/fileNavContext.tsx — missing from coverage
- frontend/src/lib/leftPaneContext.ts — missing from coverage
- frontend/src/lib/treeVisitStore.ts — missing from coverage
- frontend/src/messages-core/en.json — missing from coverage
- frontend/src/messages-core/ja.json — missing from coverage

Test files:
- frontend/src/__tests__/section-rows.test.tsx — missing from coverage
- frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts — missing from coverage
- frontend/src/app/drive/[name]/__tests__/layout.queue.test.tsx — missing from coverage
- frontend/src/app/files/[id]/__tests__/page.smartCollection.test.tsx — missing from coverage
- frontend/src/app/files/[id]/__tests__/page.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/DocumentSideSlot.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/FileDetailCanvas.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/FileDetailContent.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/FileDetailPageRow.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/FileNavControls.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/FindInFile.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/InspectorTabsSlot.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/LoftMetadataPlacement.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/PlainTextDocument.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/WorkbenchCollection.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/WorkbenchPendingEntry.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/WorkbenchPlayerFocus.test.tsx — missing from coverage
- frontend/src/components/FileDetail/__tests__/WorkbenchRowBeside.test.tsx — missing from coverage
- frontend/src/components/__tests__/CollectionDetail.queue.test.tsx — missing from coverage
- frontend/src/components/__tests__/CollectionDetail.queueState.test.tsx — missing from coverage
- frontend/src/components/__tests__/CollectionDetail.test.tsx — missing from coverage
- frontend/src/components/__tests__/CollectionPanel.test.tsx — missing from coverage
- frontend/src/components/__tests__/FileDetailFullScreen.headerRow.test.tsx — missing from coverage
- frontend/src/components/__tests__/FileDetailFullScreen.inboxNav.test.tsx — missing from coverage
- frontend/src/components/__tests__/FileDetailFullScreen.smartCollection.test.tsx — missing from coverage
- frontend/src/components/__tests__/FileDetailFullScreen.test.tsx — missing from coverage
- frontend/src/components/__tests__/FolderBrowser.playAll.test.tsx — missing from coverage
- frontend/src/components/__tests__/QueueMediaSession.test.tsx — missing from coverage
- frontend/src/components/__tests__/SearchPage.smartCollectionPlay.test.tsx — missing from coverage
- frontend/src/components/__tests__/TreeToggle.test.tsx — missing from coverage
- frontend/src/components/__tests__/componentFixtureParity.test.tsx — missing from coverage
- frontend/src/components/__tests__/noHorizontalScrollFixtureParity.test.tsx — missing from coverage
- frontend/src/components/__tests__/queueStrings.test.ts — missing from coverage
- frontend/src/components/folder/__tests__/TreeYield.test.tsx — missing from coverage
- frontend/src/components/folder/__tests__/TwoPaneLayout.queueOverlay.test.tsx — missing from coverage
- frontend/src/components/folder/__tests__/TwoPaneLayout.queuePane.test.tsx — missing from coverage
- frontend/src/components/queue/__tests__/queue.test.ts — missing from coverage
- frontend/src/hooks/__tests__/useFileNav.test.tsx — missing from coverage
- frontend/src/hooks/__tests__/useSelectedFile.test.tsx — missing from coverage
- frontend/src/lib/__tests__/fileDetailShell.test.ts — missing from coverage

## Needs a human

### incomplete_read

Note: frontend/e2e-components/collection-workbench-metrics-desktop.spec.ts (missing), frontend/e2e-components/document-summary-inspector-desktop.spec.ts (missing), frontend/e2e-components/file-header-row-desktop.spec.ts (missing), frontend/e2e-components/fixtures/app.tsx (missing), frontend/e2e-components/fixtures/fileHeaderRow.tsx (missing), frontend/e2e-components/fixtures/focusMode.tsx (missing), frontend/e2e-components/fixtures/inspectorResponsive.tsx (missing), frontend/e2e-components/fixtures/queuePage.tsx (missing), frontend/e2e-components/focus-mode-desktop.spec.ts (missing), frontend/e2e-components/header-row-crowding.spec.ts (missing), frontend/e2e-components/player-workbench-desktop.spec.ts (missing), frontend/e2e-components/projects.ts (missing), frontend/e2e-components/queue-page-desktop.spec.ts (missing), frontend/e2e-components/queue-page-phone.spec.ts (missing), frontend/e2e-components/scenes-scroll-list-desktop.spec.ts (missing), frontend/e2e-components/scenes-scroll-list.cases.ts (missing), frontend/e2e-components/spec-viewport.spec.ts (missing), frontend/e2e-components/workbench-no-panel-desktop.spec.ts (missing), frontend/e2e-components/workbench-split-desktop.spec.ts (missing), frontend/e2e-layout/fixtures/no-horizontal-scroll.html (missing), frontend/e2e-layout/no-horizontal-scroll-states.spec.ts (missing), frontend/e2e-layout/no-horizontal-scroll.spec.ts (missing), frontend/src/app/drive/[name]/layout.tsx (missing), frontend/src/app/files/[id]/page.tsx (missing), frontend/src/app/globals.css (missing), frontend/src/components/ArchivePreview.tsx (missing), frontend/src/components/AudioPlayer.tsx (missing), frontend/src/components/Breadcrumb.tsx (missing), frontend/src/components/ChromeButtons.tsx (missing), frontend/src/components/CollectionDetail.tsx (missing), frontend/src/components/CollectionItemsPane.tsx (missing), frontend/src/components/CollectionPanel.tsx (missing), frontend/src/components/CollectionPicker.tsx (missing), frontend/src/components/FileActions.tsx (missing), frontend/src/components/FileDetail/FileDetailCanvas.tsx (missing), frontend/src/components/FileDetail/FileDetailChrome.tsx (missing), frontend/src/components/FileDetail/FileDetailContainer.tsx (missing), frontend/src/components/FileDetail/FileDetailPresenter.tsx (missing), frontend/src/components/FileDetail/FileDetailSkeleton.tsx (missing), frontend/src/components/FileDetail/FileNavControls.tsx (missing), frontend/src/components/FileDetail/ShellLayout.tsx (missing), frontend/src/components/FileDetail/hooks/useInspectorFit.ts (missing), frontend/src/components/FileDetail/workbench/panels.tsx (missing), frontend/src/components/FileDetailFullScreen.tsx (missing), frontend/src/components/FileDetailShell.tsx (missing), frontend/src/components/FolderBrowser.tsx (missing), frontend/src/components/SmartFolderSaveButton.tsx (missing), frontend/src/components/TreeToggle.tsx (missing), frontend/src/components/VideoPlayer.tsx (missing), frontend/src/components/folder/RightPaneFile.tsx (missing), frontend/src/components/folder/TwoPaneLayout.tsx (missing), frontend/src/components/markdown/MarkdownDocumentLayout.tsx (missing), frontend/src/components/queue/FolderQueueHost.tsx (missing), frontend/src/components/queue/QueuePageContext.tsx (missing), frontend/src/components/queue/QueuePane.tsx (missing), frontend/src/components/queue/QueueRows.tsx (missing), frontend/src/components/queue/QueueTrail.tsx (missing), frontend/src/components/queue/folderQueue.ts (missing), frontend/src/components/queue/loopStorage.ts (missing), frontend/src/components/queue/playIntent.ts (missing), frontend/src/components/queue/queue.ts (missing), frontend/src/components/queue/queuePagePresence.ts (missing), frontend/src/components/queue/queueSelectionStore.ts (missing), frontend/src/components/queue/smartQueueSource.ts (missing), frontend/src/components/sidebar/SidebarCollectionsSection.tsx (missing), frontend/src/hooks/useFileNav.ts (missing), frontend/src/hooks/useSelectedFile.ts (missing), frontend/src/hooks/useTreeVisible.ts (missing), frontend/src/lib/canonicalFileUrl.ts (missing), frontend/src/lib/collectionChanged.ts (missing), frontend/src/lib/fileDetailShell.ts (missing), frontend/src/lib/fileNavContext.tsx (missing), frontend/src/lib/leftPaneContext.ts (missing), frontend/src/lib/treeVisitStore.ts (missing), frontend/src/messages-core/en.json (missing), frontend/src/messages-core/ja.json (missing)
Paths:
- frontend/e2e-components/collection-workbench-metrics-desktop.spec.ts
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts
- frontend/e2e-components/file-header-row-desktop.spec.ts
- frontend/e2e-components/fixtures/app.tsx
- frontend/e2e-components/fixtures/fileHeaderRow.tsx
- frontend/e2e-components/fixtures/focusMode.tsx
- frontend/e2e-components/fixtures/inspectorResponsive.tsx
- frontend/e2e-components/fixtures/queuePage.tsx
- frontend/e2e-components/focus-mode-desktop.spec.ts
- frontend/e2e-components/header-row-crowding.spec.ts
- frontend/e2e-components/player-workbench-desktop.spec.ts
- frontend/e2e-components/projects.ts
- frontend/e2e-components/queue-page-desktop.spec.ts
- frontend/e2e-components/queue-page-phone.spec.ts
- frontend/e2e-components/scenes-scroll-list-desktop.spec.ts
- frontend/e2e-components/scenes-scroll-list.cases.ts
- frontend/e2e-components/spec-viewport.spec.ts
- frontend/e2e-components/workbench-no-panel-desktop.spec.ts
- frontend/e2e-components/workbench-split-desktop.spec.ts
- frontend/e2e-layout/fixtures/no-horizontal-scroll.html
- frontend/e2e-layout/no-horizontal-scroll-states.spec.ts
- frontend/e2e-layout/no-horizontal-scroll.spec.ts
- frontend/src/app/drive/[name]/layout.tsx
- frontend/src/app/files/[id]/page.tsx
- frontend/src/app/globals.css
- frontend/src/components/ArchivePreview.tsx
- frontend/src/components/AudioPlayer.tsx
- frontend/src/components/Breadcrumb.tsx
- frontend/src/components/ChromeButtons.tsx
- frontend/src/components/CollectionDetail.tsx
- frontend/src/components/CollectionItemsPane.tsx
- frontend/src/components/CollectionPanel.tsx
- frontend/src/components/CollectionPicker.tsx
- frontend/src/components/FileActions.tsx
- frontend/src/components/FileDetail/FileDetailCanvas.tsx
- frontend/src/components/FileDetail/FileDetailChrome.tsx
- frontend/src/components/FileDetail/FileDetailContainer.tsx
- frontend/src/components/FileDetail/FileDetailPresenter.tsx
- frontend/src/components/FileDetail/FileDetailSkeleton.tsx
- frontend/src/components/FileDetail/FileNavControls.tsx
- frontend/src/components/FileDetail/ShellLayout.tsx
- frontend/src/components/FileDetail/hooks/useInspectorFit.ts
- frontend/src/components/FileDetail/workbench/panels.tsx
- frontend/src/components/FileDetailFullScreen.tsx
- frontend/src/components/FileDetailShell.tsx
- frontend/src/components/FolderBrowser.tsx
- frontend/src/components/SmartFolderSaveButton.tsx
- frontend/src/components/TreeToggle.tsx
- frontend/src/components/VideoPlayer.tsx
- frontend/src/components/folder/RightPaneFile.tsx
- frontend/src/components/folder/TwoPaneLayout.tsx
- frontend/src/components/markdown/MarkdownDocumentLayout.tsx
- frontend/src/components/queue/FolderQueueHost.tsx
- frontend/src/components/queue/QueuePageContext.tsx
- frontend/src/components/queue/QueuePane.tsx
- frontend/src/components/queue/QueueRows.tsx
- frontend/src/components/queue/QueueTrail.tsx
- frontend/src/components/queue/folderQueue.ts
- frontend/src/components/queue/loopStorage.ts
- frontend/src/components/queue/playIntent.ts
- frontend/src/components/queue/queue.ts
- frontend/src/components/queue/queuePagePresence.ts
- frontend/src/components/queue/queueSelectionStore.ts
- frontend/src/components/queue/smartQueueSource.ts
- frontend/src/components/sidebar/SidebarCollectionsSection.tsx
- frontend/src/hooks/useFileNav.ts
- frontend/src/hooks/useSelectedFile.ts
- frontend/src/hooks/useTreeVisible.ts
- frontend/src/lib/canonicalFileUrl.ts
- frontend/src/lib/collectionChanged.ts
- frontend/src/lib/fileDetailShell.ts
- frontend/src/lib/fileNavContext.tsx
- frontend/src/lib/leftPaneContext.ts
- frontend/src/lib/treeVisitStore.ts
- frontend/src/messages-core/en.json
- frontend/src/messages-core/ja.json

## Findings

A: 0
B: 0
C: 0


## Not verified

- claude-verify: Legacy redirect behavior in frontend/src/app/files/[id]/page.tsx and canonicalFileUrl.ts (I6)
- claude-verify: Layout and measurement invariants (I8, I9, I12, SPEC-CORE-082/085/094/104/126/128/131 revisions), which need a browser
- claude-verify: Collection-page freshness and the reorder/removal paths in CollectionDetail.tsx (I4, I14 re-reads)
- claude-verify: The autoplay intent semantics in playIntent.ts and the player components (I11)
- claude-verify: The tree-setting non-write behavior in useTreeVisible and leftPaneContext (I13)
- claude-verify: How the system media session next-track is wired to the queue (I3's last bullet)

TOTAL: 0 findings
