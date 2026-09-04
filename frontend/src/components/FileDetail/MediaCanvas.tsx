"use client";

import type { ReactNode } from "react";

import { AddonSlot } from "../AddonSlot";
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
  /** Whether the player's height follows its width (video and `.loft`). */
  framed: boolean;
  isTimedMedia: boolean;
  mediaController: MediaController | null;
  /**
   * The companion's occupants, when this canvas is where they live.
   *
   * `null` means they are inspector tabs instead. The distinction is
   * made once by the layout and passed down, because chapters and the
   * transcript must be mounted in exactly one of the two places — the
   * transcript fetches, follows the playback clock and holds a scroll
   * position, none of which survives being drawn twice.
   */
  companion: { chaptersPresent: boolean } | null;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  /** Detailed summary and the active-summary host, which need canvas width. */
  heavySummaries: ReactNode;
}

/**
 * What a media file's detail page keeps in the canvas.
 *
 * The viewer, and the long things that belong to the viewer: the
 * description, the transcript when the reader has put it below rather
 * than beside, and the table-heavy summaries. Everything else — title,
 * tags, relations, comments, the addon sections — is in the inspector,
 * which is the whole point of the 2026-09 layout: a 190-page archive or
 * a 19-minute video used to get a strip of page for the thing it
 * actually is, with metadata stacked under it.
 */
export function MediaCanvas({
  file,
  fileId,
  metrics,
  framed,
  isTimedMedia,
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

      <FileDescription
        file={file}
        isTimedMedia={isTimedMedia}
        mediaController={mediaController}
      />

      {companion && (
        // Directly under the description, which is where the confirmed
        // layout puts it: the reader has said they want the transcript
        // below the player, so it goes below the player and not below
        // the summaries that are about it.
        <div className="media-detail-below">
          {companion.chaptersPresent && (
            <ChaptersPanel
              fileId={fileId}
              mediaController={mediaController}
              refreshToken={chaptersVersion}
              onResolved={onChaptersResolved}
              className="media-detail-below-index"
            />
          )}
          <div className="media-detail-below-body">
            <AddonSlot
              id="player-side"
              layout="stack"
              props={{ ...addonSlotProps, fillHeight: true }}
            />
          </div>
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
