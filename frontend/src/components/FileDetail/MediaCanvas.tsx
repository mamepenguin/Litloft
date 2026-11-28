"use client";

import type { ReactNode } from "react";

import { MediaPlayerBlock, type MediaPlayerBlockProps } from "./MediaPlayerBlock";
import { mediaHostStyle } from "./mediaHostStyle";
import { isDocumentViewer } from "@/lib/fileDetailShell";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";
import type { FileItem } from "@/types";

interface MediaCanvasProps
  extends Omit<
    MediaPlayerBlockProps,
    | "playerWrapperRef"
    | "framed"
    | "bleed"
    | "showPreviewActions"
    | "fillCanvas"
  > {
  file: FileItem;
  metrics: CompanionMetrics;
  framed: boolean;
  playerShare: number;
  playerFocused: boolean;
  workbench?: ReactNode;
  workbenchActive: boolean;
  /**
   * Whether the player and the panels are two columns. The attribute is the
   * only thing that changes the placement: no box moves.
   */
  split?: boolean;
  splitColumnWidth?: number | null;
  showPreviewActions: boolean;
}

/**
 * The space goes above each later child, not below the earlier one as
 * `space-y` puts it: a hidden box after the player then takes no space. Not a
 * flex `gap`: a flex host moves the pinned frame in pseudo full screen.
 */
export const MEDIA_HOST_CLASS = "media-detail-host w-full p-4 [&>*+*]:mt-4";

export function MediaCanvas({
  file,
  metrics,
  framed,
  playerShare,
  playerFocused,
  workbench,
  workbenchActive,
  split = false,
  splitColumnWidth,
  showPreviewActions,
  addonSlotProps,
  ...playerProps
}: MediaCanvasProps) {
  return (
    <div
      className={MEDIA_HOST_CLASS}
      data-workbench={workbenchActive ? "on" : undefined}
      data-workbench-split={split ? "on" : undefined}
      data-player-focus={playerFocused ? "on" : undefined}
      style={mediaHostStyle(metrics, playerShare, split ? splitColumnWidth : null)}
    >
      <MediaPlayerBlock
        {...playerProps}
        file={file}
        addonSlotProps={addonSlotProps}
        playerWrapperRef={metrics.playerWrapperRef}
        framed={framed}
        bleed={isDocumentViewer(file.mime_type)}
        showPreviewActions={showPreviewActions}
        showMetadataAside={false}
        fillCanvas
      />

      {workbench}
    </div>
  );
}
