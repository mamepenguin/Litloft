"use client";

import type { ReactNode, RefObject } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { DocumentController } from "@/lib/documentController";
import { MediaPlayerBlock } from "./MediaPlayerBlock";
import { mediaHostStyle } from "./mediaHostStyle";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";

interface FileDetailCanvasProps {
  file: FileItem;
  videoRef: RefObject<HTMLVideoElement | null>;
  initialTime?: number;
  initialPage?: number;
  initialSection?: number;
  highlight?: string;
  onMediaController: (mc: MediaController | null) => void;
  onDocumentCaptureController: (c: DocumentCaptureController | null) => void;
  onDocumentController?: (c: DocumentController | null) => void;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  miniPlayerRoot?: Element | null;
  onEnded?: () => void;
  autoPlay?: boolean;
  metrics: CompanionMetrics;
  addonSlotProps: Record<string, unknown>;
  playerFramed: boolean;
  rest: ReactNode;
}

export function FileDetailCanvas({
  file,
  videoRef,
  initialTime,
  initialPage,
  initialSection,
  highlight,
  onMediaController,
  onDocumentCaptureController,
  onDocumentController,
  markdownReloadKey,
  onMarkdownTagsSaved,
  miniPlayerRoot,
  onEnded,
  autoPlay,
  metrics,
  addonSlotProps,
  playerFramed,
  rest,
}: FileDetailCanvasProps) {
  const { playerWrapperRef } = metrics;

  return (
    <div className="media-detail-host w-full" style={mediaHostStyle(metrics)}>
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
        playerWrapperRef={playerWrapperRef}
        framed={playerFramed}
      />
      {rest}
    </div>
  );
}
