"use client";

import type { ReactNode, RefObject } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import { AddonSlot } from "../AddonSlot";
import { ChaptersPanel } from "../ChaptersPanel";
import { MediaPlayerBlock } from "./MediaPlayerBlock";
import { mediaHostStyle } from "./mediaHostStyle";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";

interface FileDetailCanvasProps {
  file: FileItem;
  fileId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  initialTime?: number;
  initialPage?: number;
  highlight?: string;
  onMediaController: (mc: MediaController | null) => void;
  onDocumentCaptureController: (c: DocumentCaptureController | null) => void;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  miniPlayerRoot?: Element | null;
  onEnded?: () => void;
  autoPlay?: boolean;
  metrics: CompanionMetrics;
  addonSlotProps: Record<string, unknown>;
  mediaController: MediaController | null;
  chaptersPresent: boolean;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  companionKind: string | null;
  railEligible: boolean;
  playerFramed: boolean;
  /**
   * Whether anyone — core chapters or an addon — *could* fill the
   * companion. Not whether they did: this route mounts the occupants
   * inside the region it gates, so an answer that depended on what they
   * found would unmount whoever was going to give it.
   */
  companionMountable: boolean;
  rest: ReactNode;
}

export function FileDetailCanvas({
  file,
  fileId,
  videoRef,
  initialTime,
  initialPage,
  highlight,
  onMediaController,
  onDocumentCaptureController,
  markdownReloadKey,
  onMarkdownTagsSaved,
  miniPlayerRoot,
  onEnded,
  autoPlay,
  metrics,
  addonSlotProps,
  mediaController,
  chaptersPresent,
  chaptersVersion,
  onChaptersResolved,
  companionKind,
  railEligible,
  playerFramed,
  companionMountable,
  rest,
}: FileDetailCanvasProps) {
  const { playerWrapperRef, attachRailHost } = metrics;

  const playerLayoutNode = (
    <MediaPlayerBlock
      file={file}
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
      addonSlotProps={addonSlotProps}
      playerWrapperRef={playerWrapperRef}
      framed={playerFramed}
      layoutToggle={
        railEligible && companionMountable ? { railGated: true } : null
      }
    />
  );

  const mediaDetailStyle = mediaHostStyle(metrics, miniPlayerRoot);

  if (!companionKind || !companionMountable) {
    return (
      <div className="media-detail-host w-full" style={mediaDetailStyle}>
        {playerLayoutNode}
        {rest}
      </div>
    );
  }

  const companionNode = (
    <div className="media-detail-companion">
      <div className="media-detail-companion-inner">
        {/* Stacks rather than sharing a tab strip. Tabs are exclusive, so
            they would put "where am I" and "what is being said" behind one
            another — seeing a coarse index and the fine text follow the same
            clock at once is the reason the rail exists. */}
        {chaptersPresent && (
          <ChaptersPanel
            fileId={fileId}
            mediaController={mediaController}
            refreshToken={chaptersVersion}
            onResolved={onChaptersResolved}
            className="media-detail-companion-lead"
          />
        )}
        {/* This wrapper does not break the flex chain as long as it is
            itself a flex container that passes the height on, which
            `media-detail-companion-fill` is. fillHeight is unconditional:
            the host bounds this region in both forms. */}
        <div className="media-detail-companion-fill">
          <AddonSlot
            id="player-side"
            layout="stack"
            props={{ ...addonSlotProps, fillHeight: true }}
          />
        </div>
      </div>
    </div>
  );

  // Audio never gets the rail: the player is ~200px tall and a column
  // beside it would leave half the width empty.
  if (!railEligible) {
    return (
      <div className="media-detail-host w-full" style={mediaDetailStyle}>
        {playerLayoutNode}
        {companionNode}
        {rest}
      </div>
    );
  }

  // `data-media-width` is set by the measuring effect above rather than
  // rendered here: absent reads as narrow, which is the layout to show
  // before anything has been measured.
  return (
    <div
      ref={attachRailHost}
      className="media-detail-host w-full"
      style={mediaDetailStyle}
    >
      <div className="media-detail-grid">
        {playerLayoutNode}
        {companionNode}
        <div className="media-detail-rest">{rest}</div>
      </div>
    </div>
  );
}
