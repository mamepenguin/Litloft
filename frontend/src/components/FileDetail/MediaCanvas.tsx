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
  > {
  file: FileItem;
  metrics: CompanionMetrics;
  framed: boolean;
  workbench?: ReactNode;
  workbenchActive: boolean;
  showPreviewActions: boolean;
  /**
   * Detailed summary and the active-summary host, on a file without a
   * player. A player file draws them through the workbench instead.
   */
  heavySummaries: ReactNode;
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
  workbench,
  workbenchActive,
  showPreviewActions,
  heavySummaries,
  addonSlotProps,
  miniPlayerRoot,
  ...playerProps
}: MediaCanvasProps) {
  return (
    <div
      className={MEDIA_HOST_CLASS}
      data-workbench={workbenchActive ? "on" : undefined}
      style={mediaHostStyle(metrics)}
    >
      <MediaPlayerBlock
        {...playerProps}
        file={file}
        addonSlotProps={addonSlotProps}
        miniPlayerRoot={miniPlayerRoot}
        playerWrapperRef={metrics.playerWrapperRef}
        framed={framed}
        bleed={isDocumentViewer(file.mime_type)}
        showPreviewActions={showPreviewActions}
      />

      {workbench}

      {/* `empty:hidden` because both occupants render nothing until the
          file has a summary, and an empty bordered strip above the
          bottom of the canvas is a rule with nothing under it. */}
      <div className="space-y-6 border-t border-bg-border pt-6 empty:hidden">
        {heavySummaries}
      </div>
    </div>
  );
}
