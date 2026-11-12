"use client";

import type { ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { DocumentController } from "@/lib/documentController";
import { ActiveSummaryHost } from "../ActiveSummaryHost";
import { AddonSlot } from "../AddonSlot";
import { useAddonSlots } from "../AddonSlotsProvider";
import { CommentSection } from "../CommentSection";
import { ExifSection } from "../ExifSection";
import { FileDetailCanvas } from "./FileDetailCanvas";
import { RelatedStack } from "./related/RelatedStack";
import { ShellLayout } from "./ShellLayout";
import { MediaPlayerBlock } from "./MediaPlayerBlock";
import { mediaHostStyle } from "./mediaHostStyle";
import { Workbench } from "./workbench/Workbench";
import {
  buildWorkbenchPanels,
  type WorkbenchPanelItem,
} from "./workbench/panels";
import {
  closeWorkbenchPanel,
  toggleWorkbenchPanel,
  useWorkbenchPanels,
} from "@/lib/workbenchPanels";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";
import type { SlotAvailability } from "./hooks/useSlotAvailability";

export interface FileDetailPresenterProps {
  file: FileItem;
  fileId: string;
  drive: string;
  isMobile: boolean;
  ridesShell: boolean;
  findEnabled: boolean;
  isHtmlPreview: boolean;
  hasPlayer: boolean;
  usesCanvasViewer: boolean;
  plainTextDocument: boolean;
  hasInspector: boolean;
  playerFramed: boolean;
  slotAvailability: SlotAvailability;
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
  sheetPeek?: ReactNode;
}

/**
 * The legacy vertical stack survives on the collection-playback route. It
 * is not dead code waiting to be deleted; it is that surface's layout.
 */
/**
 * The collection surface's playback layout. It has no inspector, so every
 * available panel is a workbench panel at every width.
 */
function CollectionPlayerCanvas({
  file,
  fileId,
  drive,
  playerFramed,
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
  onEnded,
  autoPlay,
  markdownReloadKey,
  onMarkdownTagsSaved,
  chaptersVersion,
  onChaptersResolved,
  slotAvailability,
  rest,
}: {
  file: FileItem;
  fileId: string;
  drive: string;
  playerFramed: boolean;
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
  onEnded?: () => void;
  autoPlay?: boolean;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  slotAvailability: SlotAvailability;
  rest: ReactNode;
}) {
  const tGlobal = useTranslations();
  const { getSlotEntries, hasSlot } = useAddonSlots();
  const stored = useWorkbenchPanels();
  const items: WorkbenchPanelItem[] = buildWorkbenchPanels({
    surface: "collection",
    hasPlayer: true,
    file,
    fileId,
    drive,
    slotEntries: getSlotEntries("player-side"),
    availability: slotAvailability,
    translate: (key) => tGlobal(key),
    addonSlotProps,
    mediaController,
    chaptersVersion,
    onChaptersResolved,
  });
  const available = new Set(
    items.filter((item) => item.available).map((item) => item.id),
  );

  return (
    <div
      className="media-detail-host w-full p-4 [&>*+*]:mt-4"
      data-collection-workbench="true"
      style={mediaHostStyle(metrics)}
    >
      <MediaPlayerBlock
        file={file}
        videoRef={videoRef}
        initialTime={initialTime}
        initialPage={initialPage}
        initialSection={initialSection}
        highlight={highlight}
        onMediaController={onMediaController}
        onDocumentCaptureController={onDocumentCaptureController}
        onDocumentController={onDocumentController}
        markdownReloadKey={markdownReloadKey}
        onMarkdownTagsSaved={onMarkdownTagsSaved}
        miniPlayerRoot={miniPlayerRoot}
        onEnded={onEnded}
        autoPlay={autoPlay}
        addonSlotProps={addonSlotProps}
        playerWrapperRef={metrics.playerWrapperRef}
        framed={playerFramed}
        showPreviewActions={false}
      />
      <Workbench
        items={items}
        stored={stored}
        onToggle={(id) => toggleWorkbenchPanel(id, available)}
        onClose={closeWorkbenchPanel}
        actions={
          hasSlot("file-preview-actions") ? (
            <AddonSlot
              id="file-preview-actions"
              layout="stack"
              props={addonSlotProps}
            />
          ) : null
        }
      />
      {rest}
    </div>
  );
}

export function FileDetailPresenter({
  file,
  fileId,
  drive,
  isMobile,
  ridesShell,
  findEnabled,
  isHtmlPreview,
  hasPlayer,
  usesCanvasViewer,
  plainTextDocument,
  hasInspector,
  playerFramed,
  slotAvailability,
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
}: FileDetailPresenterProps) {
  const { getSlotEntries } = useAddonSlots();
  const playerSideIds = hasPlayer
    ? getSlotEntries("player-side").map((entry) => entry.id)
    : [];

  if (ridesShell) {
    return (
      <ShellLayout
        file={file}
        fileId={fileId}
        drive={drive}
        isMobile={isMobile}
        findEnabled={findEnabled}
        isHtmlPreview={isHtmlPreview}
        hasPlayer={hasPlayer}
        usesCanvasViewer={usesCanvasViewer}
        plainTextDocument={plainTextDocument}
        hasInspector={hasInspector}
        slotAvailability={slotAvailability}
        playerFramed={playerFramed}
        chaptersPresent={chaptersPresent}
        chaptersVersion={chaptersVersion}
        onChaptersResolved={onChaptersResolved}
        metrics={metrics}
        addonSlotProps={addonSlotProps}
        mediaController={mediaController}
        onMediaController={onMediaController}
        onDocumentCaptureController={onDocumentCaptureController}
        onDocumentController={onDocumentController}
        videoRef={videoRef}
        initialTime={initialTime}
        initialPage={initialPage}
        initialSection={initialSection}
        highlight={highlight}
        miniPlayerRoot={miniPlayerRoot}
        onScrollRootChange={onScrollRootChange}
        onEnded={onEnded}
        autoPlay={autoPlay}
        markdownReloadKey={markdownReloadKey}
        onMarkdownTagsSaved={onMarkdownTagsSaved}
        onRename={onRename}
        onBack={onBack}
        meta={meta}
        sheetPeek={sheetPeek}
      />
    );
  }

  const rest = (
    <>
      {meta}

      <div className="mt-4 space-y-4">
        {!hasPlayer && <ActiveSummaryHost fileId={fileId} drive={drive} />}
        <RelatedStack fileId={fileId} addonSlotProps={addonSlotProps} />
        <ExifSection fileId={fileId} fileType={file.file_type} />
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          excludeIds={hasPlayer ? playerSideIds : undefined}
          props={addonSlotProps}
        />
      </div>

      <CommentSection fileId={fileId} />
    </>
  );

  if (hasPlayer) {
    return (
      <CollectionPlayerCanvas
        file={file}
        fileId={fileId}
        drive={drive}
        playerFramed={playerFramed}
        metrics={metrics}
        addonSlotProps={addonSlotProps}
        mediaController={mediaController}
        onMediaController={onMediaController}
        onDocumentCaptureController={onDocumentCaptureController}
        onDocumentController={onDocumentController}
        videoRef={videoRef}
        initialTime={initialTime}
        initialPage={initialPage}
        initialSection={initialSection}
        highlight={highlight}
        miniPlayerRoot={miniPlayerRoot}
        onEnded={onEnded}
        autoPlay={autoPlay}
        markdownReloadKey={markdownReloadKey}
        onMarkdownTagsSaved={onMarkdownTagsSaved}
        chaptersVersion={chaptersVersion}
        onChaptersResolved={onChaptersResolved}
        slotAvailability={slotAvailability}
        rest={rest}
      />
    );
  }

  return (
    <FileDetailCanvas
      file={file}
      videoRef={videoRef}
      initialTime={initialTime}
      initialPage={initialPage}
      initialSection={initialSection}
      highlight={highlight}
      onMediaController={onMediaController}
      onDocumentCaptureController={onDocumentCaptureController}
      onDocumentController={onDocumentController}
      markdownReloadKey={markdownReloadKey}
      onMarkdownTagsSaved={onMarkdownTagsSaved}
      miniPlayerRoot={miniPlayerRoot}
      onEnded={onEnded}
      autoPlay={autoPlay}
      metrics={metrics}
      addonSlotProps={addonSlotProps}
      playerFramed={playerFramed}
      rest={rest}
    />
  );
}
