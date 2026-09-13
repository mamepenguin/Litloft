"use client";

import { useCallback, useState, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { PdfController } from "@/lib/pdfController";
import type { ArchiveController } from "@/lib/archiveController";
import { PdfPagesTab } from "./pdf/PdfPagesTab";
import { usePdfState } from "./pdf/usePdfState";
import { ArchivePagesPanel } from "./archive/ArchivePagesPanel";
import { useArchiveState } from "./archive/useArchiveState";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import { useMediaLayoutPreference } from "@/lib/mediaLayout";
import { sortSlotEntries } from "@/lib/addons";
import { viewerTakesCanvasFloor } from "@/lib/fileDetailShell";
import { slotEntryLabel } from "@/lib/slotLabel";
import { ActiveSummaryHost } from "../ActiveSummaryHost";
import { AddonSlot, SlotEntryRenderer } from "../AddonSlot";
import { useAddonSlots } from "../AddonSlotsProvider";
import { ChaptersPanel } from "../ChaptersPanel";
import { CommentSection } from "../CommentSection";
import { ExifSection } from "../ExifSection";
import { FileDetailShell } from "../FileDetailShell";
import { FilePreview } from "../FilePreview";
import { MediaLayoutToggle } from "../MediaLayoutToggle";
import { RelatedFilesSection } from "../RelatedFilesSection";
import { MarkdownDocumentLayout } from "../markdown/MarkdownDocumentLayout";
import { FileNavControls } from "./FileNavControls";
import { MediaCanvas } from "./MediaCanvas";
import { InspectorShell } from "./inspector/InspectorShell";
import { RelatedGroup } from "./inspector/RelatedGroup";
import { buildInspectorTabs } from "./inspector/tabs";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";
import type { SlotAvailability } from "./hooks/useSlotAvailability";
import { useSheetHalfSnap } from "./hooks/useSheetHalfSnap";

export interface ShellLayoutProps {
  file: FileItem;
  fileId: string;
  drive: string;
  isMobile: boolean;
  isHtmlPreview: boolean;
  hasPlayer: boolean;
  usesCanvasViewer: boolean;
  descriptionInCanvas: boolean;
  companionMountable: boolean;
  companionOccupied: boolean;
  slotAvailability: SlotAvailability;
  playerFramed: boolean;
  isTimedMedia: boolean;
  chaptersPresent: boolean;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  metrics: CompanionMetrics;
  addonSlotProps: Record<string, unknown>;
  mediaController: MediaController | null;
  onMediaController: (mc: MediaController | null) => void;
  onDocumentCaptureController: (c: DocumentCaptureController | null) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  initialTime?: number;
  initialPage?: number;
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
  sheetPeek?: ReactNode;
}

export function ShellLayout({
  file,
  fileId,
  drive,
  isMobile,
  isHtmlPreview,
  hasPlayer,
  usesCanvasViewer,
  descriptionInCanvas,
  companionMountable,
  companionOccupied,
  slotAvailability,
  playerFramed,
  isTimedMedia,
  chaptersPresent,
  chaptersVersion,
  onChaptersResolved,
  metrics,
  addonSlotProps,
  mediaController,
  onMediaController,
  onDocumentCaptureController,
  videoRef,
  initialTime,
  initialPage,
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
  const { getSlotEntries } = useAddonSlots();
  const [mediaLayout] = useMediaLayoutPreference();
  // Writing to the store the shell's own toggle reads, rather than
  // holding a second copy of the state: choosing "beside" has to be able
  // to reveal where it just put the panel. The store rather than
  // `useInspectorOpen`, because this only ever writes — subscribing
  // would re-render this whole subtree on every open and close for a
  // value it does not read.
  const setInspectorOpen = useCallback(
    (next: boolean) => inspectorOpenStore.set(drive, next),
    [drive],
  );

  /**
   * The tab list and the canvas must not both claim them: the transcript
   * fetches, subscribes to the playback clock and holds a scroll position,
   * so a second copy is not a duplicate render but a second, competing
   * reader of the same file.
   *
   * On a phone there is no beside — the inspector is a sheet — so the
   * tabs are where they go regardless of the stored preference.
   */
  const companionInTabs = isMobile || mediaLayout === "beside";

  const playerSideEntries = hasPlayer ? getSlotEntries("player-side") : [];

  const playerSideProps = (entryId: string, labelledByHost: boolean) => ({
    ...addonSlotProps,
    fillHeight: true,
    labelledByHost,
    onAvailability: slotAvailability.reporterFor(entryId),
  });

  /**
   * Built here rather than by `AddonSlot` inside the canvas because the
   * availability callback is per entry, and `AddonSlot` hands one props
   * object to all of them.
   */
  const playerSideNodes = sortSlotEntries(playerSideEntries).map((entry) => (
    <SlotEntryRenderer
      key={entry.id}
      entry={entry}
      props={playerSideProps(entry.id, false)}
    />
  ));

  /**
   * The inspector excludes exactly these, so a section lands in one
   * column or the other and never in both.
   *
   * Do not add a third: the general answer is a slot of its own, the
   * way `file-relations` is, not another id core has to know.
   */
  const canvasSlotIds = usesCanvasViewer
    ? ["detailed-summary"]
    : ["knowledge-edit", "detailed-summary"];

  // Built twice deliberately: the desktop inspector and the mobile sheet
  // are never mounted at the same time (the pane is desktop-only and the
  // sheet renders nothing while closed), and the sheet takes the
  // table-heavy summaries the desktop canvas keeps — a 90vh drawer at
  // viewport width has room for them, a 384px column does not.
  const heavySummaries = (
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
      {/* The addon half arrives through a slot rather than by id: core
          naming `similar-files` here would be exactly the core-to-addon
          dependency the rules forbid. */}
      <RelatedGroup>
        <RelatedFilesSection fileId={fileId} />
        <AddonSlot id="file-relations" layout="stack" props={addonSlotProps} />
      </RelatedGroup>
      <ExifSection fileId={fileId} fileType={file.file_type} />
      {!isHtmlPreview && (
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          excludeIds={canvasSlotIds}
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
          content:
            companionInTabs && chaptersPresent ? (
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
      addonTabs: companionInTabs
        ? playerSideEntries.map((entry) => ({
            entry,
            label: slotEntryLabel(entry, tGlobal),
            available: slotAvailability.isAvailable(entry.id),
            // In the desktop pane (`buildTabs(false)`) the panel is the
            // height budget, so this continues the flex chain and the
            // occupant fills it and scrolls inside itself. Without it the
            // chain stops here and a transcript lays itself out at full
            // length inside a bounded box, which clips it silently.
            // `fillHeight` stays `true` on both — on this path it tells
            // the occupant about a budget it does not have, and it is
            // still the right value, because `false` would give
            // `TranscriptSection` a `max-h-80` and put a second scroller
            // back inside the sheet.
            content: (
              <div className="flex h-full min-h-0 flex-col">
                <SlotEntryRenderer
                  entry={entry}
                  props={playerSideProps(entry.id, true)}
                />
              </div>
            ),
          }))
        : [],
    });

  const inspector = (
    <InspectorShell header={meta} tabs={buildTabs(false)} resetKey={fileId} />
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
    />
  ) : undefined;

  if (usesCanvasViewer) {
    return (
      <FileDetailShell
        drive={drive}
        folderPath={file.folder_path}
        title={file.title || file.filename}
        onBack={onBack}
        onScrollRootChange={onScrollRootChange}
        canvasFloor={viewerTakesCanvasFloor(file.file_type, file.mime_type)}
        chromeControls={
          <>
            {/* `!isMobile` is not only about space: `onBeside` opens the
                desktop pane, and a phone's sheet is `FileDetailShell`'s own
                state, not this store. Rendering the toggle on a phone would
                write a preference and open nothing. */}
            {!isMobile && hasPlayer && companionOccupied && (
              <MediaLayoutToggle onBeside={() => setInspectorOpen(true)} />
            )}
            {/* Images only. The arrow keys walk the folder for archives,
                PDFs and text as well, but those are surfaces for reading
                into a file, and a pair of arrows in their page row reads
                as the viewer's own paging instead. */}
            {file.file_type === "image" && <FileNavControls />}
          </>
        }
        inspector={inspector}
        mobileSheet={mobileSheet}
        sheetPeek={sheetPeek}
        halfSnap={sheetHalfSnap}
        resetKey={fileId}
      >
        <MediaCanvas
          showDescription={descriptionInCanvas}
          file={file}
          fileId={fileId}
          metrics={metrics}
          framed={playerFramed}
          isTimedMedia={isTimedMedia}
          mediaController={mediaController}
          companion={
            companionInTabs || !hasPlayer || !companionMountable
              ? null
              : {
                  chaptersPresent,
                  occupied: companionOccupied,
                  slots: playerSideNodes,
                }
          }
          chaptersVersion={chaptersVersion}
          onChaptersResolved={onChaptersResolved}
          // On a phone the sheet takes them instead: a 90vh drawer at
          // viewport width has room for a markdown table and a 384px
          // column does not, and drawing them in both places mounts
          // `ActiveSummaryHost` twice — two fetches for one file.
          heavySummaries={isMobile ? null : heavySummaries}
          videoRef={videoRef}
          initialTime={initialTime}
          initialPage={initialPage}
          highlight={highlight}
          onMediaController={onMediaController}
          onDocumentCaptureController={onDocumentCaptureController}
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
      onRename={isHtmlPreview ? undefined : onRename}
      onBack={onBack}
      onScrollRootChange={onScrollRootChange}
      inspector={inspector}
      mobileSheet={mobileSheet}
      sheetPeek={sheetPeek}
      resetKey={fileId}
      previewOnly={isHtmlPreview}
    >
      {/* The canvas is at least as tall as the scroll viewport (`flex-1`
          against the layout's scrolling <main>), and the editor region
          takes whatever the footer leaves. Without this, a short note
          ended at its own content height and the sections under it
          floated in the middle of the screen with dead space below. */}
      <div className="flex flex-1 flex-col">
        <div className="relative isolate flex flex-1 flex-col bg-bg-primary">
          {isHtmlPreview ? (
            <FilePreview file={file} />
          ) : (
            <AddonSlot
              id="file-detail-sections"
              layout="stack"
              includeIds={["knowledge-edit"]}
              props={{ ...addonSlotProps, fillHeight: true }}
            />
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
