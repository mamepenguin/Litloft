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
import { ShellLayout } from "./ShellLayout";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";

export interface FileDetailPresenterProps {
  file: FileItem;
  fileId: string;
  drive: string;
  isMobile: boolean;
  /** Whether this file, on this surface, is drawn by `FileDetailShell`. */
  ridesShell: boolean;
  isHtmlPreview: boolean;
  companionKind: string | null;
  /** Whether a player plays this file at all — `companionKind !== null`. */
  hasPlayer: boolean;
  /** Whether the player's height is a function of its width. */
  playerFramed: boolean;
  railEligible: boolean;
  companionOccupied: boolean;
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
  /** Host override for the page row's back control; see the container. */
  onBack?: () => void;
  /** Title, meta, action row and tags — placed, not built, here. */
  meta: ReactNode;
}

/**
 * Which shape this file's detail page takes, and nothing else.
 *
 * Two of them: the shell — a page row, a canvas and an inspector, worn
 * by every kind that has been moved onto it — and the legacy vertical
 * stack, which survives on the collection-playback route. That route is
 * deliberately not getting an inspector (the canonical URL is a file's
 * address, so a second one there would be work to throw away), so the
 * stack is not dead code waiting to be deleted; it is that surface's
 * layout.
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
  playerFramed,
  railEligible,
  companionOccupied,
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
        companionOccupied={companionOccupied}
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
      />
    );
  }

  // Legacy vertical stack. Everything under the player, in one column.
  const rest = (
    <>
      {meta}

      <div className="mt-4 space-y-4">
        <ActiveSummaryHost fileId={fileId} drive={drive} />
        <RelatedFilesSection fileId={fileId} />
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
      companionOccupied={companionOccupied}
      rest={rest}
    />
  );
}
