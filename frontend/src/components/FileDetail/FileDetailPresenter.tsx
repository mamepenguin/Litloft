"use client";

import type { ReactNode, RefObject } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import { ActiveSummaryHost } from "../ActiveSummaryHost";
import { AddonSlot } from "../AddonSlot";
import { CommentSection } from "../CommentSection";
import { ExifSection } from "../ExifSection";
import { RelatedFilesSection } from "../RelatedFilesSection";
import { FileDetailCanvas } from "./FileDetailCanvas";
import { RelatedGroup } from "./inspector/RelatedGroup";
import { ShellLayout } from "./ShellLayout";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";
import type { SlotAvailability } from "./hooks/useSlotAvailability";

export interface FileDetailPresenterProps {
  file: FileItem;
  fileId: string;
  drive: string;
  isMobile: boolean;
  ridesShell: boolean;
  isHtmlPreview: boolean;
  companionKind: string | null;
  hasPlayer: boolean;
  usesCanvasViewer: boolean;
  descriptionInCanvas: boolean;
  playerFramed: boolean;
  railEligible: boolean;
  companionMountable: boolean;
  companionOccupied: boolean;
  slotAvailability: SlotAvailability;
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

/**
 * The legacy vertical stack survives on the collection-playback route. It
 * is not dead code waiting to be deleted; it is that surface's layout.
 */
export function FileDetailPresenter({
  file,
  fileId,
  drive,
  isMobile,
  ridesShell,
  isHtmlPreview,
  companionKind,
  hasPlayer,
  usesCanvasViewer,
  descriptionInCanvas,
  playerFramed,
  railEligible,
  companionMountable,
  companionOccupied,
  slotAvailability,
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
}: FileDetailPresenterProps) {
  if (ridesShell) {
    return (
      <ShellLayout
        file={file}
        fileId={fileId}
        drive={drive}
        isMobile={isMobile}
        isHtmlPreview={isHtmlPreview}
        hasPlayer={hasPlayer}
        usesCanvasViewer={usesCanvasViewer}
        descriptionInCanvas={descriptionInCanvas}
        companionMountable={companionMountable}
        companionOccupied={companionOccupied}
        slotAvailability={slotAvailability}
        playerFramed={playerFramed}
        isTimedMedia={isTimedMedia}
        chaptersPresent={chaptersPresent}
        chaptersVersion={chaptersVersion}
        onChaptersResolved={onChaptersResolved}
        metrics={metrics}
        addonSlotProps={addonSlotProps}
        mediaController={mediaController}
        onMediaController={onMediaController}
        onDocumentCaptureController={onDocumentCaptureController}
        videoRef={videoRef}
        initialTime={initialTime}
        initialPage={initialPage}
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
        <ActiveSummaryHost fileId={fileId} drive={drive} />
        {/* Here because an addon publishing to `file-relations` has
            *moved* its entry out of `file-detail-sections` — the slot below
            no longer reaches it — so this column would otherwise lose the
            section outright. */}
        <RelatedGroup>
          <RelatedFilesSection fileId={fileId} />
          <AddonSlot id="file-relations" layout="stack" props={addonSlotProps} />
        </RelatedGroup>
        <ExifSection fileId={fileId} fileType={file.file_type} />
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          props={addonSlotProps}
        />
      </div>

      <CommentSection fileId={fileId} />
    </>
  );

  return (
    <FileDetailCanvas
      file={file}
      fileId={fileId}
      videoRef={videoRef}
      initialTime={initialTime}
      initialPage={initialPage}
      highlight={highlight}
      onMediaController={onMediaController}
      onDocumentCaptureController={onDocumentCaptureController}
      markdownReloadKey={markdownReloadKey}
      onMarkdownTagsSaved={onMarkdownTagsSaved}
      miniPlayerRoot={miniPlayerRoot}
      onEnded={onEnded}
      autoPlay={autoPlay}
      metrics={metrics}
      addonSlotProps={addonSlotProps}
      mediaController={mediaController}
      chaptersPresent={chaptersPresent}
      chaptersVersion={chaptersVersion}
      onChaptersResolved={onChaptersResolved}
      companionKind={companionKind}
      railEligible={railEligible}
      playerFramed={playerFramed}
      // The legacy stack keeps the mountable question: it has no split
      // between mounting an occupant and drawing chrome around it, so
      // gating the mount on availability would unmount the occupant
      // that reports it and freeze the answer at its first guess.
      companionMountable={companionMountable}
      rest={rest}
    />
  );
}
