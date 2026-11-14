"use client";

import { useState, type ReactNode, type RefObject } from "react";
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
import { viewerTakesCanvasFloor } from "@/lib/fileDetailShell";
import { slotEntryLabel } from "@/lib/slotLabel";
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
import { buildInspectorTabs } from "./inspector/tabs";
import { useInspectorTabActive } from "./inspector/activeTab";
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
  WORKBENCH_PLAYER_FOCUS_SHARE,
  WORKBENCH_PLAYER_SHARE,
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
  sheetPeek?: SheetPeek;
}

function PanelTabBody({ item }: { item: WorkbenchPanelItem }) {
  const active = useInspectorTabActive(item.id);
  return (
    <div className="flex h-full min-h-0 flex-col">{item.render(active)}</div>
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
  sheetPeek,
}: ShellLayoutProps) {
  const tabLabels = useTranslations("inspector.tabs");
  const searchParams = useSearchParams();
  const inboxWalk = searchParams.get("nav") === "inbox";
  const find = useFind();

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

  const storedPanels = useWorkbenchPanels();
  const playerFocus = useWorkbenchPlayerFocus();
  const workbenchItems = buildWorkbenchPanels({
    surface: "canonical",
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
  const playerShare =
    playerFramed && playerFocus && shownPanels.length > 0
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
      playerFocus={
        playerFramed
          ? { pressed: playerFocus, onToggle: toggleWorkbenchPlayerFocus }
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
   * The inspector excludes exactly these, so a section lands in one
   * column or the other and never in both.
   *
   * Do not add a third kind: the general answer is a slot of its own, the
   * way `file-relations` is, not another id core has to know.
   */
  const canvasSlotIds = usesCanvasViewer
    ? ["detailed-summary"]
    : ["knowledge-edit", "detailed-summary"];
  const sectionExcludeIds = Array.from(
    new Set([
      ...canvasSlotIds,
      ...(hasPlayer ? playerSideEntries.map((entry) => entry.id) : []),
    ]),
  );

  // On a player file both are drawn by the workbench, so the canvas and
  // Info keep neither.
  const heavySummaries = hasPlayer ? null : (
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
  const infoTabContent = (withHeavySummaries: boolean) => (
    <>
      <ExifSection fileId={fileId} fileType={file.file_type} />
      {!isHtmlPreview && (
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          excludeIds={sectionExcludeIds}
          props={addonSlotProps}
        />
      )}
      <CommentSection fileId={fileId} />
      {withHeavySummaries && !isHtmlPreview && heavySummaries}
    </>
  );

  const buildTabs = (withHeavySummaries: boolean) =>
    buildInspectorTabs({
      info: {
        label: tabLabels("info"),
        content: infoTabContent(withHeavySummaries),
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

  const inspector = (
    <InspectorShell
      header={meta}
      tabs={buildTabs(stackedLayout)}
      resetKey={fileId}
      selectRequest={find.selectRequest}
      onSelect={(tabId) => find.reportTab("pane", tabId)}
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
      selectRequest={find.selectRequest}
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
        onScrollRootChange={onScrollRootChange}
        findEnabled={findEnabled}
        canvasFloor={viewerTakesCanvasFloor(file.file_type, file.mime_type)}
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
        resetKey={fileId}
      >
        {findEnabled && find.open && <FindBar />}
        <MediaCanvas
          file={file}
          metrics={metrics}
          framed={playerFramed}
          playerShare={playerShare}
          workbench={workbench ?? undefined}
          workbenchActive={workbenchWide && shownPanels.length > 0}
          showPreviewActions={!actionsInRow}
          // On a phone or in the stacked inspector the other surface takes
          // them instead: drawing them in both places mounts
          // `ActiveSummaryHost` twice — two fetches for one file.
          heavySummaries={
            isMobile || stackedLayout || awaitingForm ? null : heavySummaries
          }
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
      onScrollRootChange={onScrollRootChange}
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
            {heavySummaries}
          </div>
        )}
      </div>
    </MarkdownDocumentLayout>
  );
}
