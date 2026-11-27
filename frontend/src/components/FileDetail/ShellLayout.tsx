"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { DocumentController } from "@/lib/documentController";
import type { PdfController } from "@/lib/pdfController";
import type { ArchiveController } from "@/lib/archiveController";
import { PdfPagesTab } from "./pdf/PdfPagesTab";
import { usePdfState } from "./pdf/usePdfState";
import { ArchivePagesPanel } from "./archive/ArchivePagesPanel";
import { useArchiveState } from "./archive/useArchiveState";
import { useInspectorForm } from "@/hooks/useInspectorForm";
import { useInspectorOpen } from "@/hooks/useInspectorOpen";
import { slotEntryLabel } from "@/lib/slotLabel";
import type { SlotEntry } from "@/lib/addons";
import { ActiveSummaryHost } from "../ActiveSummaryHost";
import { AddonSlot, SlotEntryRenderer } from "../AddonSlot";
import { useAddonSlots } from "../AddonSlotsProvider";
import { ChaptersPanel } from "../ChaptersPanel";
import { CommentSection } from "../CommentSection";
import { ExifSection } from "../ExifSection";
import { FileDetailShell } from "../FileDetailShell";
import type { SheetPeek } from "../MobileInspectorSheet";
import { FilePreview } from "../FilePreview";
import { MarkdownDocumentLayout } from "../markdown/MarkdownDocumentLayout";
import { FileNavControls } from "./FileNavControls";
import { MediaCanvas } from "./MediaCanvas";
import { InspectorShell } from "./inspector/InspectorShell";
import { buildInspectorTabs, listedTabs } from "./inspector/tabs";
import { useInspectorTabActive } from "./inspector/activeTab";
import { useLowerInspector } from "./lowerInspector";
import { FindBar } from "./find/FindBar";
import { FindButton } from "./find/FindButton";
import { FindTab } from "./find/FindTab";
import { FindTextBodyProvider, useFind } from "./find/FindContext";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";
import type { SlotAvailability } from "./hooks/useSlotAvailability";
import { slotAvailabilityKey } from "./hooks/useSlotAvailability";
import { useSheetHalfSnap } from "./hooks/useSheetHalfSnap";
import { RelatedPanel } from "./related/RelatedPanel";
import { useFileRelations } from "./related/useFileRelations";
import {
  buildWorkbenchPanels,
  type WorkbenchPanelItem,
} from "./workbench/panels";
import { Workbench, shownPanelIds } from "./workbench/Workbench";
import {
  CANVAS_PADDING_REM,
  WORKBENCH_PLAYER_FOCUS_SHARE,
  WORKBENCH_PLAYER_SHARE,
  WORKBENCH_SPLIT_SHARE,
} from "@/lib/layoutSizes";
import {
  closeWorkbenchPanel,
  toggleWorkbenchPanel,
  useWorkbenchPanels,
} from "@/lib/workbenchPanels";
import {
  toggleWorkbenchPlayerFocus,
  useWorkbenchPlayerFocus,
} from "@/lib/workbenchPlayerFocus";
import {
  splitFits,
  toggleWorkbenchSplit,
  useWorkbenchSplit,
} from "@/lib/workbenchSplit";
import { TextScrollFileIdContext } from "@/lib/textScrollProgress";
import { HighlightFileContext } from "@/lib/highlightStore";


export interface ShellLayoutProps {
  file: FileItem;
  fileId: string;
  drive: string;
  isMobile: boolean;
  findEnabled: boolean;
  isHtmlPreview: boolean;
  hasPlayer: boolean;
  usesCanvasViewer: boolean;
  plainTextDocument: boolean;
  hasInspector: boolean;
  slotAvailability: SlotAvailability;
  playerFramed: boolean;
  chaptersPresent: boolean;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  metrics: CompanionMetrics;
  addonSlotProps: Record<string, unknown>;
  mediaController: MediaController | null;
  onMediaController: (mc: MediaController | null) => void;
  documentController: DocumentController | null;
  onDocumentCaptureController: (c: DocumentCaptureController | null) => void;
  onDocumentController: (c: DocumentController | null) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  initialTime?: number;
  initialPage?: number;
  initialSection?: number;
  highlight?: string;
  miniPlayerRoot?: Element | null;
  onScrollRootChange: (node: HTMLElement | null) => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  onRename: (newFilename: string) => Promise<void>;
  onBack?: () => void;
  meta: ReactNode;
  subtitlesSection: ReactNode;
  sheetPeek?: SheetPeek;
}

function PanelTabBody({ item }: { item: WorkbenchPanelItem }) {
  const active = useInspectorTabActive(item.id);
  return (
    <div className="flex h-full min-h-0 flex-col">{item.render(active)}</div>
  );
}

/**
 * A `document-side` tab's body. `active` comes from the shell's context, so
 * the entry learns it without the host having to know which tab is selected
 * for every render of every entry.
 */
function DocumentSideTabBody({
  entry,
  props,
}: {
  entry: SlotEntry;
  props: Record<string, unknown>;
}) {
  const active = useInspectorTabActive(`document-side:${entry.id}`);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SlotEntryRenderer entry={entry} props={{ ...props, active }} />
    </div>
  );
}

export function ShellLayout({
  file,
  fileId,
  drive,
  isMobile,
  findEnabled,
  isHtmlPreview,
  hasPlayer,
  usesCanvasViewer,
  plainTextDocument,
  hasInspector,
  slotAvailability,
  playerFramed,
  chaptersPresent,
  chaptersVersion,
  onChaptersResolved,
  metrics,
  addonSlotProps,
  mediaController,
  onMediaController,
  documentController,
  onDocumentCaptureController,
  onDocumentController,
  videoRef,
  initialTime,
  initialPage,
  initialSection,
  highlight,
  miniPlayerRoot,
  onScrollRootChange,
  onEnded,
  autoPlay,
  markdownReloadKey,
  onMarkdownTagsSaved,
  onRename,
  onBack,
  meta,
  subtitlesSection,
  sheetPeek,
}: ShellLayoutProps) {
  const tabLabels = useTranslations("inspector.tabs");
  const searchParams = useSearchParams();
  const inboxWalk = searchParams.get("nav") === "inbox";
  const find = useFind();

  // A layout effect, not an effect: a deferred measurement paints one frame
  // with the panels still under the player.
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [measurement, setMeasurement] = useState<{
    width: number;
    rootFontSize: number;
  } | null>(null);
  const attachScrollRoot = useCallback(
    (node: HTMLElement | null) => {
      onScrollRootChange(node);
      setScrollRoot((previous) => (previous === node ? previous : node));
    },
    [onScrollRootChange],
  );

  useLayoutEffect(() => {
    if (scrollRoot == null) return;
    const measure = () => {
      const rootFontSize =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        16;
      const width =
        scrollRoot.offsetWidth - CANVAS_PADDING_REM * rootFontSize;
      setMeasurement((previous) =>
        previous != null &&
        previous.width === width &&
        previous.rootFontSize === rootFontSize
          ? previous
          : { width, rootFontSize },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scrollRoot);
    return () => observer.disconnect();
  }, [scrollRoot]);

  /**
   * On a phone the player is stuck to the top of the canvas, so a sheet
   * that took a fixed fraction of the window covered it at some viewport
   * heights and left a gap at others. Derived from the player's own
   * bottom edge instead, `half` is exactly the room under it: the video
   * stays whole and everything below goes to the tab.
   */
  const sheetHalfSnap = useSheetHalfSnap(
    metrics.playerWrapperRef,
    isMobile && hasPlayer,
  );

  const [pdfController, setPdfController] = useState<PdfController | null>(null);
  const pdfState = usePdfState(pdfController);
  const [archiveController, setArchiveController] =
    useState<ArchiveController | null>(null);
  const archiveState = useArchiveState(archiveController);
  // Global namespace: a slot entry's `i18n_key` names its own addon's.
  const tGlobal = useTranslations();
  const { getSlotEntries, hasSlot } = useAddonSlots();
  const { form, stacked: stackedLayout } = useInspectorForm(fileId);
  const relations = useFileRelations(fileId);
  const relatedListed =
    (relations?.length ?? 0) > 0 ||
    getSlotEntries("file-relations").length > 0;

  // The row has not measured this file yet. A player file off a phone waits
  // for that answer before mounting what has to land in one place only;
  // everything else renders as it always did.
  const awaitingForm = hasPlayer && !isMobile && form === "absent";

  // A player file in a row too narrow for the inspector beside it, with the
  // inspector open, is the one desktop form without a room under the player.
  const narrowForms = isMobile || stackedLayout;
  const workbenchWide =
    hasPlayer && !isMobile && !stackedLayout && !awaitingForm;

  const playerSideEntries = hasPlayer ? getSlotEntries("player-side") : [];
  // A document-side entry is a file page's inspector tab for a file the
  // canvas draws without a player. The Markdown layout and player files
  // keep their own summaries.
  const documentSideEntries =
    usesCanvasViewer && !hasPlayer
      ? getSlotEntries("document-side")
      : [];

  const storedPanels = useWorkbenchPanels();
  const playerFocus = useWorkbenchPlayerFocus();
  const workbenchItems = buildWorkbenchPanels({
    hasPlayer,
    file,
    fileId,
    drive,
    slotEntries: playerSideEntries,
    availability: slotAvailability,
    translate: (key) => tGlobal(key),
    addonSlotProps,
    mediaController,
    chaptersVersion,
    onChaptersResolved,
  });
  const availablePanelIds = new Set(
    workbenchItems.filter((item) => item.available).map((item) => item.id),
  );
  const shownPanels = shownPanelIds(workbenchItems, storedPanels);
  const hasPreviewActions = hasSlot("file-preview-actions");
  const actionsInRow = workbenchWide;
  const splitStored = useWorkbenchSplit();
  const splitEligible =
    workbenchWide &&
    playerFramed &&
    shownPanels.length > 0 &&
    measurement != null &&
    splitFits(measurement.width, measurement.rootFontSize);
  const split = splitEligible && splitStored;
  const splitColumnWidth =
    split && measurement != null
      ? WORKBENCH_SPLIT_SHARE * (measurement.width - measurement.rootFontSize)
      : null;
  const playerFocusApplies =
    !split && playerFramed && playerFocus && shownPanels.length > 0;
  const playerShare = playerFocusApplies
    ? WORKBENCH_PLAYER_FOCUS_SHARE
    : WORKBENCH_PLAYER_SHARE;
  const previewActions = (
    <AddonSlot
      id="file-preview-actions"
      layout="stack"
      props={addonSlotProps}
    />
  );
  const workbench = workbenchWide ? (
    <Workbench
      items={workbenchItems}
      stored={storedPanels}
      onToggle={(id) => toggleWorkbenchPanel(id, availablePanelIds)}
      onClose={closeWorkbenchPanel}
      actions={hasPreviewActions ? previewActions : null}
      split={split}
      splitButton={
        splitEligible
          ? { pressed: splitStored, onToggle: toggleWorkbenchSplit }
          : undefined
      }
      playerFocus={
        playerFramed
          ? {
              pressed: playerFocus,
              onToggle: toggleWorkbenchPlayerFocus,
              visibleHeight: metrics.railAvailable,
            }
          : undefined
      }
    />
  ) : null;

  const entryProps = (
    slotId: "player-side" | "inspector-tabs",
    entryId: string,
    labelledByHost: boolean,
  ) => ({
    ...addonSlotProps,
    fillHeight: true,
    labelledByHost,
    onAvailability: slotAvailability.reporterFor(
      slotAvailabilityKey(slotId, entryId),
    ),
  });

  const inspectorTabEntries = hasInspector
    ? getSlotEntries("inspector-tabs")
    : [];

  /**
   * The pane's width is a fact of the selected tab, so the selection has to
   * be known here, during render. A request is how a `select()` reaches a
   * shell that may not be mounted yet (find opening the pane, the sheet
   * rising), and one counter keeps two sources from reusing a sequence
   * number.
   *
   * The shell that takes a request retires it. A request left in place would
   * be replayed by every shell mounted after it, and the reopen, the resize
   * and the next file are where the selection is meant to start over.
   */
  const [tabRequest, setTabRequest] = useState<{
    tabId: string;
    seq: number;
  } | null>(null);
  const requestSeq = useRef(0);
  const requestTab = useCallback((tabId: string) => {
    requestSeq.current += 1;
    setTabRequest({ tabId, seq: requestSeq.current });
  }, []);
  const retireTabRequest = useCallback((seq: number) => {
    setTabRequest((request) => (request?.seq === seq ? null : request));
  }, []);
  useEffect(() => {
    if (find.selectRequest) requestTab(find.selectRequest.tabId);
  }, [find.selectRequest, requestTab]);

  const lowerInspector = useLowerInspector();
  const openInViewer = useCallback(
    (target: { fileId: string; page?: number; section?: number }) => {
      if (target.fileId !== fileId || documentController == null) return false;
      if (target.page !== undefined) {
        documentController.goTo({ page: target.page });
      } else if (target.section !== undefined) {
        documentController.goTo({ section: target.section });
      } else {
        return false;
      }
      // The sheet covers the viewer on a phone, so a jump in place has to
      // put it back to the resting strip for the page to be visible.
      if (isMobile) lowerInspector();
      return true;
    },
    [documentController, fileId, isMobile, lowerInspector],
  );

  // Availability as the entry last reported it, read at the call rather
  // than from the render's snapshot: an entry reports and selects in one
  // handler when generation starts.
  const reportedNow = useRef(new Map<string, boolean>());
  const [sheetRaiseRequest, setSheetRaiseRequest] = useState(0);
  const isMobileNow = useRef(isMobile);
  isMobileNow.current = isMobile;
  // One callback per entry for the life of the page: an entry that keys an
  // effect on `onAvailability` would report again on every render if the
  // host handed it a new function, and its first report is `false`.
  const documentSideCallbacks = useRef(
    new Map<
      string,
      {
        onAvailability: (available: boolean) => void;
        select: () => void;
      }
    >(),
  );
  const documentSideProps = (entry: SlotEntry) => {
    let callbacks = documentSideCallbacks.current.get(entry.id);
    if (!callbacks) {
      const report = slotAvailability.reporterFor(
        slotAvailabilityKey("document-side", entry.id),
      );
      callbacks = {
        onAvailability: (available: boolean) => {
          reportedNow.current.set(entry.id, available);
          report(available);
        },
        select: () => {
          if (reportedNow.current.get(entry.id) !== true) return;
          requestTab(`document-side:${entry.id}`);
          if (isMobileNow.current) {
            setSheetRaiseRequest((request) => request + 1);
          }
        },
      };
      documentSideCallbacks.current.set(entry.id, callbacks);
    }
    return {
      ...addonSlotProps,
      fillHeight: true,
      labelledByHost: true,
      onAvailability: callbacks.onAvailability,
      select: callbacks.select,
      openInViewer,
    };
  };

  /**
   * The inspector excludes exactly these, so a section lands in one column
   * or the other and never in both: a file without a player withholds its
   * `document-side` ids, and the Markdown layout the two sections it draws
   * under the text.
   *
   * Do not add a third kind: the general answer is a slot of its own, the
   * way `file-relations` is, not another id core has to know.
   */
  const canvasSlotIds = usesCanvasViewer
    ? documentSideEntries.map((entry) => entry.id)
    : ["knowledge-edit", "detailed-summary"];
  const sectionExcludeIds = Array.from(
    new Set([
      ...canvasSlotIds,
      ...(hasPlayer ? playerSideEntries.map((entry) => entry.id) : []),
    ]),
  );

  // The Markdown layout keeps the summaries under the text, and at the end
  // of Info in the sheet; a player file draws both through the workbench.
  const markdownSummaries = !usesCanvasViewer && (
    <>
      <ActiveSummaryHost fileId={fileId} drive={drive} />
      <AddonSlot
        id="file-detail-sections"
        layout="stack"
        includeIds={["detailed-summary"]}
        props={addonSlotProps}
      />
    </>
  );

  // HTML preview is a pure renderer: intelligence has no concept of
  // "indexing" an HTML artifact, so the empty Suggested-Tags / Summary /
  // Index-Details placeholders would be noise rather than affordance.
  const infoTabContent = (withFooterSummaries: boolean) => (
    <>
      {subtitlesSection}
      <ExifSection fileId={fileId} fileType={file.file_type} />
      {!isHtmlPreview && (
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          excludeIds={sectionExcludeIds}
          props={addonSlotProps}
        />
      )}
      {!hasPlayer && usesCanvasViewer && !isHtmlPreview && (
        <ActiveSummaryHost fileId={fileId} drive={drive} />
      )}
      <CommentSection fileId={fileId} />
      {withFooterSummaries && !isHtmlPreview && markdownSummaries}
    </>
  );

  const buildTabs = (withFooterSummaries: boolean) =>
    buildInspectorTabs({
      info: {
        label: tabLabels("info"),
        content: infoTabContent(withFooterSummaries),
      },
      coreTabs: [
        {
          id: "find",
          label: tabLabels("find"),
          content: find.open ? <FindTab /> : null,
        },
        {
          id: "pages",
          label: tabLabels("pages"),
          content: pdfController ? (
            pdfState.numPages > 1 || (pdfState.outline ?? []).length > 0 ? (
              <PdfPagesTab controller={pdfController} />
            ) : null
          ) : archiveController && archiveState.entries.length > 1 ? (
            <ArchivePagesPanel controller={archiveController} fileId={fileId} />
          ) : null,
        },
        {
          id: "chapters",
          label: tabLabels("chapters"),
          content: chaptersPresent ? (
            <ChaptersPanel
              fileId={fileId}
              mediaController={mediaController}
              refreshToken={chaptersVersion}
              onResolved={onChaptersResolved}
              className="h-full"
            />
          ) : null,
        },
      ],
      documentTabs: documentSideEntries.map((entry) => ({
        entry,
        label: slotEntryLabel(entry, tGlobal),
        available:
          slotAvailability.reportedValue(
            slotAvailabilityKey("document-side", entry.id),
          ) === true,
        content: (
          <DocumentSideTabBody
            entry={entry}
            props={documentSideProps(entry)}
          />
        ),
      })),
      addonTabs:
        hasPlayer && narrowForms && !awaitingForm
          ? workbenchItems.map((item) => ({
              entry: {
                id: item.id,
                label: item.label,
                priority: item.priority,
              },
              label: item.label,
              available: item.available,
              content: <PanelTabBody item={item} />,
            }))
          : [],
      postAddonTabs: [
        {
          id: "related",
          label: tabLabels("related"),
          content: relatedListed ? (
            <RelatedPanel
              relations={relations ?? []}
              addonSlotProps={addonSlotProps}
            />
          ) : null,
        },
      ],
      inspectorTabs: inspectorTabEntries.map((entry) => ({
        entry,
        label: slotEntryLabel(entry, tGlobal),
        available:
          slotAvailability.reportedValue(
            slotAvailabilityKey("inspector-tabs", entry.id),
          ) === true,
        content: (
          <div className="flex h-full min-h-0 flex-col">
            <SlotEntryRenderer
              entry={entry}
              props={entryProps("inspector-tabs", entry.id, true)}
            />
          </div>
        ),
      })),
    });

  const desktopTabs = buildTabs(stackedLayout);
  const desktopListed = listedTabs(desktopTabs);
  // What today's unmounts reset: closing the pane, crossing to the phone
  // and changing file each build a new shell, so the selection starts over.
  // The form and focus mode do not, and keep it.
  const { open: desktopOpen } = useInspectorOpen(drive, hasPlayer);
  const desktopShellKey = `${fileId}\u0000${
    isMobile ? "phone" : "desktop"
  }\u0000${desktopOpen ? "open" : "closed"}`;
  const [desktopKey, setDesktopKey] = useState(desktopShellKey);
  const [desktopWanted, setDesktopWanted] = useState<string | null>(null);
  if (desktopKey !== desktopShellKey) {
    setDesktopKey(desktopShellKey);
    setDesktopWanted(null);
  }
  const desktopActiveId =
    desktopWanted && desktopListed.some((tab) => tab.id === desktopWanted)
      ? desktopWanted
      : desktopListed[0]?.id;
  // A vanished tab does not spring back when it returns.
  if (desktopWanted !== null && desktopWanted !== desktopActiveId) {
    setDesktopWanted(desktopActiveId ?? null);
  }

  // The wide width is a fact of the selected tab in this same render, so
  // the pane is never painted at one tab's width with another's label.
  const inspectorWide =
    !isMobile &&
    form === "beside" &&
    documentSideEntries.some(
      (entry) =>
        entry.wide === true &&
        `document-side:${entry.id}` === desktopActiveId,
    );

  const inspector = (
    <InspectorShell
      header={meta}
      tabs={desktopTabs}
      resetKey={fileId}
      selectRequest={tabRequest}
      onSelectRequestTaken={retireTabRequest}
      onSelect={(tabId) => find.reportTab("pane", tabId)}
      activeId={desktopActiveId ?? "info"}
      onActiveIdChange={setDesktopWanted}
    />
  );

  // Only when actually on mobile, so the sections inside mount exactly
  // once across the two surfaces rather than once per surface.
  // `scroll="column"` is the sheet's half of the arrangement: the drawer
  // is the scroller, so the inspector inside it must not be a second one.
  const mobileSheet = isMobile ? (
    <InspectorShell
      header={meta}
      tabs={buildTabs(true)}
      resetKey={fileId}
      scroll="column"
      selectRequest={tabRequest}
      onSelectRequestTaken={retireTabRequest}
      onSelect={(tabId) => find.reportTab("sheet", tabId)}
    />
  ) : undefined;

  if (usesCanvasViewer) {
    return (
      <FileDetailShell
        drive={drive}
        folderPath={file.folder_path}
        title={file.title || file.filename}
        fileId={fileId}
        onBack={onBack}
        onScrollRootChange={attachScrollRoot}
        findEnabled={findEnabled}
        isPlayerFile={hasPlayer}
        publishesForm
        chromeControls={
          <>
            {findEnabled && <FindButton />}
            {/* Images only. The arrow keys walk the folder for archives,
                PDFs and text as well, but those are surfaces for reading
                into a file, and a pair of arrows in their page row reads
                as the viewer's own paging instead. The inbox's row is the
                exception: there every kind walks the arrivals. */}
            {file.file_type === "image" && !inboxWalk && <FileNavControls />}
          </>
        }
        inspector={inspector}
        mobileSheet={mobileSheet}
        sheetPeek={sheetPeek}
        halfSnap={sheetHalfSnap}
        raiseSheetRequest={sheetRaiseRequest}
        inspectorWide={inspectorWide}
        resetKey={fileId}
      >
        {findEnabled && find.open && <FindBar />}
        <MediaCanvas
          file={file}
          metrics={metrics}
          framed={playerFramed}
          playerShare={playerShare}
          playerFocused={playerFocusApplies}
          workbench={workbench ?? undefined}
          workbenchActive={workbenchWide && shownPanels.length > 0}
          split={split}
          splitColumnWidth={splitColumnWidth}
          showPreviewActions={!actionsInRow}
          videoRef={videoRef}
          initialTime={initialTime}
          initialPage={initialPage}
          initialSection={initialSection}
          highlight={highlight}
          onMediaController={onMediaController}
          onDocumentCaptureController={onDocumentCaptureController}
          onDocumentController={onDocumentController}
          onPdfController={setPdfController}
          onArchiveController={setArchiveController}
          markdownReloadKey={markdownReloadKey}
          onMarkdownTagsSaved={onMarkdownTagsSaved}
          miniPlayerRoot={miniPlayerRoot}
          onEnded={onEnded}
          autoPlay={autoPlay}
          addonSlotProps={addonSlotProps}
        />
      </FileDetailShell>
    );
  }

  return (
    <MarkdownDocumentLayout
      drive={drive}
      folderPath={file.folder_path}
      title={file.filename}
      fileId={fileId}
      onRename={isHtmlPreview ? undefined : onRename}
      onBack={onBack}
      onScrollRootChange={attachScrollRoot}
      inspector={inspector}
      mobileSheet={mobileSheet}
      sheetPeek={sheetPeek}
      resetKey={fileId}
      previewOnly={isHtmlPreview}
      plainText={plainTextDocument}
      findEnabled={findEnabled}
    >
      {/* The canvas is at least as tall as the scroll viewport (`flex-1`
          against the layout's scrolling <main>), and the editor region
          takes whatever the footer leaves. Without this, a short note
          ended at its own content height and the sections under it
          floated in the middle of the screen with dead space below. */}
      <div className="flex flex-1 flex-col">
        {findEnabled && find.open && <FindBar />}
        <div className="relative isolate flex flex-1 flex-col bg-bg-primary">
          {isHtmlPreview ? (
            <FilePreview file={file} />
          ) : (
            <FindTextBodyProvider>
              <TextScrollFileIdContext.Provider value={file.id}>
                <HighlightFileContext.Provider value={file.id}>
                  <AddonSlot
                    id="file-detail-sections"
                    layout="stack"
                    includeIds={["knowledge-edit"]}
                    props={{
                      ...addonSlotProps,
                      fillHeight: true,
                      highlight,
                      ...(plainTextDocument ? { plainTextDocument: true } : {}),
                    }}
                  />
                </HighlightFileContext.Provider>
              </TextScrollFileIdContext.Provider>
            </FindTextBodyProvider>
          )}
        </div>
        {!isMobile && !isHtmlPreview && (
          <div className="relative isolate space-y-6 border-t border-bg-border bg-bg-primary px-6 py-8 empty:hidden">
            {markdownSummaries}
          </div>
        )}
      </div>
    </MarkdownDocumentLayout>
  );
}
