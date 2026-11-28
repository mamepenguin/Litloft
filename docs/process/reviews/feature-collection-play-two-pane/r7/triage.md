# Triage: r7

## Trajectory

This run:
- none

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F7 is bucket A or BLOCKER
- open finding claude-read:F8 is bucket A or BLOCKER

## Read coverage

Product files:
- frontend/e2e-components/collection-workbench-metrics-desktop.spec.ts — full: Deleted file; whole content in the diff.
- frontend/e2e-components/document-summary-inspector-desktop.spec.ts — partial: Changed hunk only (removed collection case).
- frontend/e2e-components/file-header-row-desktop.spec.ts — partial: Changed hunks only.
- frontend/e2e-components/fixtures/app.tsx — partial: Changed hunks only (imports and arrangement map).
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
- frontend/src/app/drive/[name]/layout.tsx — full: Read the whole file.
- frontend/src/app/files/[id]/page.tsx — partial: Changed hunks in the diff.
- frontend/src/app/globals.css — partial: Changed hunk only (removed collection rule).
- frontend/src/components/ArchivePreview.tsx — partial: Changed hunks (comments only).
- frontend/src/components/AudioPlayer.tsx — partial: Changed hunks plus grep of autoPlay handling (lines 22-42,129).
- frontend/src/components/Breadcrumb.tsx — partial: Lines 60-180 read from the file plus diff hunks.
- frontend/src/components/ChromeButtons.tsx — partial: Changed hunks only.
- frontend/src/components/CollectionDetail.tsx — partial: Changed hunks in the diff.
- frontend/src/components/CollectionItemsPane.tsx — partial: Changed hunks in the diff.
- frontend/src/components/CollectionPanel.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/CollectionPicker.tsx — partial: Changed hunks only.
- frontend/src/components/FileActions.tsx — partial: Changed hunk with its enclosing handleDelete.
- frontend/src/components/FileDetail/FileDetailCanvas.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/FileDetail/FileDetailChrome.tsx — partial: Lines 40-219 read from the file.
- frontend/src/components/FileDetail/FileDetailContainer.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/FileDetailPresenter.tsx — partial: Changed hunks in the diff (most of the file).
- frontend/src/components/FileDetail/FileDetailSkeleton.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/FileNavControls.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/ShellLayout.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/hooks/useInspectorFit.ts — partial: Lines 60-150 read from the file plus diff hunks.
- frontend/src/components/FileDetail/workbench/panels.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetailFullScreen.tsx — full: Deleted file; whole content in the diff.
- frontend/src/components/FileDetailShell.tsx — partial: Changed hunks only.
- frontend/src/components/FolderBrowser.tsx — partial: Changed hunk with handlePlayAll.
- frontend/src/components/SmartFolderSaveButton.tsx — partial: Changed hunks only.
- frontend/src/components/TreeToggle.tsx — partial: Changed hunks only.
- frontend/src/components/VideoPlayer.tsx — partial: Lines 120-229 read from the file.
- frontend/src/components/folder/RightPaneFile.tsx — full: Read the whole file.
- frontend/src/components/folder/TwoPaneLayout.tsx — full: Read the whole file.
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
- frontend/src/hooks/useTreeVisible.ts — partial: Changed hunks in the diff.
- frontend/src/lib/canonicalFileUrl.ts — partial: Changed hunks in the diff.
- frontend/src/lib/collectionChanged.ts — full: New file; whole content in the diff.
- frontend/src/lib/fileDetailShell.ts — partial: Changed hunks only.
- frontend/src/lib/fileNavContext.tsx — partial: Changed hunk only.
- frontend/src/lib/leftPaneContext.ts — partial: Changed hunk only.
- frontend/src/lib/treeVisitStore.ts — full: New file; whole content in the diff.
- frontend/src/messages-core/en.json — partial: Changed hunk only.
- frontend/src/messages-core/ja.json — partial: Changed hunk only.

Test files:
- frontend/src/__tests__/section-rows.test.tsx — partial: Changed hunk only.
- frontend/src/app/__tests__/mediaDetailTheaterCss.test.ts — full: Deleted file; content in the diff.
- frontend/src/app/drive/[name]/__tests__/layout.queue.test.tsx — full: New file; content in the diff.
- frontend/src/app/files/[id]/__tests__/page.smartCollection.test.tsx — partial: Changed hunks only.
- frontend/src/app/files/[id]/__tests__/page.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/DocumentSideSlot.test.tsx — partial: Changed hunks only.
- frontend/src/components/FileDetail/__tests__/FileDetailCanvas.test.tsx — full: Deleted file; content in the diff (skimmed).
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
- frontend/src/components/folder/__tests__/TwoPaneLayout.queuePane.test.tsx — full: New file; content in the diff.
- frontend/src/components/queue/__tests__/queue.test.ts — full: New file; content in the diff.
- frontend/src/hooks/__tests__/useFileNav.test.tsx — partial: Changed hunks only.
- frontend/src/hooks/__tests__/useSelectedFile.test.tsx — partial: Changed hunk only.
- frontend/src/lib/__tests__/fileDetailShell.test.ts — partial: Changed hunks only.

## Unspecified behavior, recorded

- claude-read: Ending a folder queue (× or a choice outside the queue, or clearFile) removes `sort` and `order` from the URL even when they were the listing's own sort rather than ones Play all added, including on a Smart queue page.
  - F2 × I3 = 6, claude-read: A user who sorted the listing via URL then plays and closes the queue sees the listing fall back to its stored sort.
  - F2 × I3 = 6, claude-verify: After Play all on a folder the user had already sorted in the URL, × or a choice outside the queue drops that sort too, and the listing returns to its default order.
- claude-read: With the tree setting off, opening a collection file by a plain link or grid card (not a queue start) also shows the queue pane for the visit.
  - F3 × I2 = 6, claude-read: Any ?file= on a collection page at md+ triggers treeVisitStore.show, not only Play or a row choice.
  - F3 × I2 = 6, claude-verify: With the tree off, opening any collection file (even from a grid card) shows the item pane beside it, which matches the spirit of step 3 and is harmless.
- claude-read: On a collection page with no file open, choosing a row in the item pane selects the file without a play intent, so it starts only when Autoplay is on.
  - F4 × I3 = 12, claude-read: onSelect is undefined until a file is open, so the first row choice is not treated as a queue action.
  - F3 × I3 = 9, claude-verify: With Autoplay off, choosing a row in the collection pane before any file is open does not start playback, so the user must press play, which contradicts the expectation that a queue action starts it.
- claude-read: While a cold Smart queue's Smart Collection list is pending or fails, the page row's trail draws an empty crumb linking to the drive root.
  - F1 × I2 = 2, claude-read: name is "" and trailHref falls back to folderQueueHref(drive, "").
  - F1 × I2 = 2, claude-verify: Only for a cold Smart queue URL while the smart-folders read is pending or failed: the trail briefly shows an empty crumb linking to the drive root.
- claude-read: Hiding a visit-shown pane with the button is forgotten when the viewport crosses md and back, or when the file is cleared and reopened, because show() resets hidden to false.
  - F1 × I2 = 2, claude-read: The layout effect clears and re-shows the visit on those transitions.
  - F1 × I2 = 2, claude-verify: A user who hid the visit-shown pane sees it come back after resizing across md or reopening a file, and must hide it again.
- claude-read: A play intent left pending by a selection that the navigation guard cancels is consumed by the next arrival at that same file by any route, which then autoplays regardless of the preference.
  - F1 × I2 = 2, claude-read: playIntent.ts holds the id until takePlayIntent matches it.
  - F1 × I2 = 2, claude-verify: Only after a navigation guard cancels a queue selection: a later arrival at the same file autoplays once regardless of the preference.

## Findings

A: 2
B: 6
C: 0

### claude-read:F7 — bucket A, MEDIUM, open

Claim: On folder and Smart queue pages, the page row's trail is replaced by drive / queue name / file title, and the narrow heading's line 1 by the queue name, although the revised SPEC-CORE-094 I5 allows a different trail only on a collection page.
Impact: On a Smart queue (drive root route) the trail no longer shows the file's own folders and its crumb points to the saved search (or to the drive root, with an empty label, while the Smart Collection list is pending); on a nested folder queue the intermediate ancestors disappear. The row differs from the same file reached from its folder in more than I7 permits.
Evidence: FileDetailChrome.tsx:70-81 uses queuePage.name/href for parentName/parentHref whenever a QueuePage is provided; FileDetailChrome.tsx:195-205 passes folderPath undefined and the queue as the only ancestor. FolderQueueHost provides a QueuePage for queue=folder and queue=smart:… with name = folder leaf or Smart name ("" before getSmartFolders answers for a cold queue) and href = trailHref (falls back to folderQueueHref(drive, "")).
Repro: not_reproduced. Open /drive/main/a/b/c?file=v&queue=folder → trail reads main / c / title instead of main / a / b / c / title. Open /drive/main?file=v&queue=smart:7 for a file in movies/2026 → trail reads main / <Smart name> / title.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Only replace the trail when the queue is a collection; keep folderPath for folder and Smart queues.

</details>

### claude-read:F8 — bucket A, MEDIUM, open

Claim: On a collection page with the tree setting off, the pane shown for the visit ends as soon as ?file= is cleared, so the collection list (no file open) shows no pane although the visit is supposed to last until the page is left.
Impact: After Play with the tree off, pressing the collection crumb or the pane's collection name (which clear ?file=) makes the item pane disappear from the collection page; the user loses the list they just came from.
Evidence: TwoPaneLayout.tsx:125-131 calls treeVisitStore.clear(drive) whenever `queuePane && hasFile` is false; CollectionDetail passes queuePane={fileId !== null}. With visit cleared and the setting off, useTreeVisible returns visible=false and the aside gets w-0 (TwoPaneLayout.tsx:180-185).
Repro: not_reproduced. tree:enabled off, md+ width, open /drive/main/collections/c1, press Play (pane shows for the visit), press the collection name in the pane → ?file= cleared → aside width 0.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> On a collection page, keep the visit active until TwoPaneLayout unmounts or the route changes, not until the file is cleared.

</details>

### claude-read:F3 — bucket B, HIGH, open

Claim: On any file page where the sidebar stays inline (tree setting off, sidebar open, not a phone), the inspector-fit measurement adds the sidebar's 240px to the row's width even though the sidebar is not going away, so the form is decided for a row wider than the one on screen.
Impact: With the tree off and the sidebar open at laptop widths (e.g. a 1100px window: host ≈ 860px < 968px threshold), a player file that used to go to `stacked` now goes to `beside`, leaving the player column narrower than PLAYER_MIN_REM; the layout is silently wrong on ordinary folder file pages that have nothing to do with a queue.
Evidence: TwoPaneLayout.tsx:174 makes the sidebar overlay only when `treeBeside || yielded`, so with the tree off the sidebar remains inline and the content keeps its pl-60. FileDetailShell `inlineSidebarWidth` returns that padding unconditionally, and useInspectorFit.ts:100-116 computes `fits = rowWidth + paneWidth >= threshold` with it. INSPECTOR_BESIDE_MIN_REM = 60.5rem (layoutSizes.ts:15-16). The only test of the new path (TreeYield.test.tsx 'the sidebar still holds its inline width') checks the yield with the tree on, not the form with the tree off.
Repro: not_reproduced (read only). Mental mutation: tree:enabled off, sidebar-open true, 1100×800, open a video on /drive/x?file=v → host.clientWidth 860 + padding 240 = 1100 ≥ 968 → form 'beside' instead of 'stacked'.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Count the sidebar padding only while the sidebar is transitioning to its overlay form (e.g. when the page has a left pane shown beside or yielded), not unconditionally.

</details>

### claude-read:F2 — bucket B, MEDIUM, open

Claim: frontend/src/components/FileDetail/hooks/useInspectorFit.ts is changed (new `extraRowWidth` input) and FileDetailShell feeds it the inline sidebar's padding, but useInspectorFit.ts is not in the touch-point list.
Impact: The inspector form decision (beside / stacked / overlay) and the yield decision for every file page, not only queue pages, now depend on this change.
Evidence: useInspectorFit.ts:23-28 and 100-105 add the extra width to `rowWidth`, which drives `fits`, `narrow` and the form; FileDetailShell.tsx `inlineSidebarWidth` reads `main.parentElement`'s padding-left and passes it as `extraRowWidth`.
Repro: Compare the diff's file list with the spec's Touch points: useInspectorFit.ts is absent.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> List useInspectorFit.ts in the touch points, or keep the adjustment inside the queue page.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: frontend/src/components/Breadcrumb.tsx is changed (new `ancestorSegments` prop) but is not in the touch-point list.
Impact: Breadcrumb is shared by every folder listing and file page trail; a change there is outside the reviewed scope, and readers of the spec are not pointed at it.
Evidence: Breadcrumb.tsx:50-54 adds `ancestorSegments`; Breadcrumb.tsx:89-93 appends them to the trail items, keyed by href. Used by FileDetailChrome.tsx:198-202 and QueueTrail.tsx.
Repro: Compare the diff's file list with the spec's Touch points: Breadcrumb.tsx is absent.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add Breadcrumb.tsx to the spec's touch points.

</details>

### claude-read:F4 — bucket B, LOW, open

Claim: A new store frontend/src/lib/treeVisitStore.ts is added outside the queue module and is not in the touch-point list, which names only treeNarrowOpenStore and treeYieldStore as the tree-pane stores.
Impact: A new piece of global tree-pane state (the 'shown for the visit' flag read by useTreeVisible and TwoPaneLayout) exists that the spec's §4 'tree-pane stores' list does not mention.
Evidence: treeVisitStore.ts (new); read by useTreeVisible.ts (visitVisible, toggle) and TwoPaneLayout.tsx:117-133,156.
Repro: Compare the diff with the spec's Touch points and §4 browser-storage list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add treeVisitStore.ts to the touch points.

</details>

### claude-read:F5 — bucket B, INFO, open

Claim: Five e2e files are changed that the touch-point list does not name: document-summary-inspector-desktop.spec.ts, file-header-row-desktop.spec.ts, focus-mode-desktop.spec.ts, header-row-crowding.spec.ts and scenes-scroll-list.cases.ts; queuePage.tsx is a new fixture not named either.
Impact: Collection-route cases of SPEC-CORE-131 I1, SPEC-CORE-098 I1/I3/I5/I10, SPEC-CORE-094 D2 and SPEC-CORE-128 §1.1/§1.3 are deleted without the spec recording where those citations now live.
Evidence: document-summary-inspector-desktop.spec.ts removes the 'collection route PDF 80vh' case; file-header-row-desktop.spec.ts removes six header-row-collection cases; focus-mode-desktop.spec.ts removes two /files/{id} cases; header-row-crowding.spec.ts removes the file-detail-chrome-collection case; scenes-scroll-list.cases.ts drops COLLECTION.
Repro: Compare the diff's e2e paths with the spec's 'e2e files that draw or assert the collection surface' list.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Add these files to the touch-point list.

</details>

### claude-read:F6 — bucket B, INFO, open

Claim: Unit tests outside the touch-point list are changed or added: FileNavControls.test.tsx, WorkbenchPendingEntry.test.tsx, TreeYield.test.tsx, TreeToggle.test.tsx, componentFixtureParity.test.tsx, useFileNav.test.tsx, useSelectedFile.test.tsx, and new layout.queue, CollectionDetail.queue/queueState, FolderBrowser.playAll, QueueMediaSession, queueStrings, TwoPaneLayout.queueOverlay/queuePane and queue.test.
Impact: Minor: the spec lists rewritten and removed tests but not these; TreeYield.test.tsx in particular changes its harness (sidebar state, main/padding wrapper) for the new measurement in F3.
Evidence: Diff headers for each file.
Repro: Compare the diff with the spec's test lists.
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-read: I did not run any test or build; all claims are from reading.
- claude-read: I did not read SidebarProvider or AppShell to confirm the content frame's padding equals the sidebar width while inline (F3 relies on TreeYield.test's comment and TwoPaneLayout.tsx:174).
- claude-read: I did not read ShellLayout, FileDetailShell, FileDetailContainer, MarkdownDocumentLayout, CollectionItemsPane, ChromeButtons, TreeToggle beyond the diff hunks.
- claude-read: I did not verify watch-progress recording on end (I1) in usePlaybackProgress.
- claude-read: I did not check iOS/native shell media session behaviour.
- claude-verify: The base side of the diff (origin/develop): I could not confirm which of the F5/F6 files were modified rather than newly added.
- claude-verify: Did not run any test or e2e; F3's mis-measured form is derived from reading the code, not observed in a browser.
- claude-verify: Did not verify that intermediate ancestors are absent from QueueTrail on phone widths.

TOTAL: 8 findings
