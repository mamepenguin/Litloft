"use client";

import type { ReactNode } from "react";

import { ChaptersPanel } from "../ChaptersPanel";
import { FileDescription } from "./FileDescription";
import { MediaPlayerBlock, type MediaPlayerBlockProps } from "./MediaPlayerBlock";
import { mediaHostStyle } from "./mediaHostStyle";
import type { CompanionMetrics } from "./hooks/useCompanionMetrics";
import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";

interface MediaCanvasProps
  extends Omit<MediaPlayerBlockProps, "playerWrapperRef" | "framed" | "layoutToggle"> {
  file: FileItem;
  fileId: string;
  metrics: CompanionMetrics;
  framed: boolean;
  isTimedMedia: boolean;
  showDescription: boolean;
  mediaController: MediaController | null;
  /**
   * `null` means they are inspector tabs instead. The distinction is
   * made once by the layout and passed down, because chapters and the
   * transcript must be mounted in exactly one of the two places — the
   * transcript fetches, follows the playback clock and holds a scroll
   * position, none of which survives being drawn twice.
   */
  companion: {
    chaptersPresent: boolean;
    occupied: boolean;
    slots: ReactNode;
  } | null;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  /**
   * Detailed summary and the active-summary host, which need canvas
   * width. `null` on a phone, where the Bottom Sheet takes them —
   * drawing them in both places mounts `ActiveSummaryHost` twice.
   */
  heavySummaries: ReactNode;
}

export function MediaCanvas({
  file,
  fileId,
  metrics,
  framed,
  isTimedMedia,
  showDescription,
  mediaController,
  companion,
  chaptersVersion,
  onChaptersResolved,
  heavySummaries,
  addonSlotProps,
  miniPlayerRoot,
  ...playerProps
}: MediaCanvasProps) {
  return (
    <div
      className="media-detail-host w-full space-y-4 p-4"
      style={mediaHostStyle(metrics, miniPlayerRoot)}
    >
      <MediaPlayerBlock
        {...playerProps}
        file={file}
        addonSlotProps={addonSlotProps}
        miniPlayerRoot={miniPlayerRoot}
        playerWrapperRef={metrics.playerWrapperRef}
        framed={framed}
        // The shell puts the beside/below toggle in the page row, where
        // the confirmed layout has it — a control that decides what the
        // whole page looks like reads as chrome, not as a player action.
        layoutToggle={null}
      />

      {/* Left-aligned rather than centred, unlike the player above it.
          The player is centred because its width is a function of the
          height budget, so it is narrower than the column it sits in;
          everything below it is a reading column and lines up with the
          companion box under it. */}
      {showDescription && (
        <FileDescription
          file={file}
          isTimedMedia={isTimedMedia}
          mediaController={mediaController}
          className="reading-measure"
        />
      )}

      {companion && (
        // `data-occupied="false"` hides the box in CSS rather than
        // dropping it, and that is the whole mechanism: its occupants
        // are what report whether they have anything, so a box removed
        // because they had nothing yet would remove the reporters and
        // leave the answer stuck at its first guess.
        <div
          className="media-detail-below"
          data-occupied={companion.occupied ? "true" : "false"}
        >
          {companion.chaptersPresent && (
            <ChaptersPanel
              fileId={fileId}
              mediaController={mediaController}
              refreshToken={chaptersVersion}
              onResolved={onChaptersResolved}
              className="media-detail-below-index"
            />
          )}
          <div className="media-detail-below-body">{companion.slots}</div>
        </div>
      )}

      {/* `empty:hidden` because both occupants render nothing until the
          file has a summary, and an empty bordered strip above the
          bottom of the canvas is a rule with nothing under it. */}
      <div className="space-y-6 border-t border-bg-border pt-6 empty:hidden">
        {heavySummaries}
      </div>
    </div>
  );
}
