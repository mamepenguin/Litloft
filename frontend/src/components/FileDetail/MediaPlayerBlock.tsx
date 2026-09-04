"use client";

import type { RefObject } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import { AddonSlot } from "../AddonSlot";
import { FilePreview } from "../FilePreview";
import { MediaLayoutToggle } from "../MediaLayoutToggle";

export interface MediaPlayerBlockProps {
  file: FileItem;
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
  addonSlotProps: Record<string, unknown>;
  /** Attach so the player's offset can be measured for `--player-avail`. */
  playerWrapperRef: RefObject<HTMLDivElement | null>;
  /** Whether the player's height is a function of its width. */
  framed: boolean;
  /**
   * Draw the beside/below toggle in the action row under the player, and
   * whether that button hides itself where a rail cannot fit.
   *
   * `null` means the toggle is not this block's to draw — the shell puts
   * it in the page row instead, where the confirmed layout has it.
   */
  layoutToggle: { railGated: boolean } | null;
}

/**
 * The player and the row of actions directly under it.
 *
 * Shared by both layouts. The legacy stack wraps it in a grid area and
 * the shell puts it at the top of the canvas, but the player itself,
 * its wrapper and the action row are the same on both — and they had
 * better be, because `--player-avail` is measured against that wrapper
 * and `data-framed` is what makes the budget expressible as a width.
 */
export function MediaPlayerBlock({
  file,
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
  addonSlotProps,
  playerWrapperRef,
  framed,
  layoutToggle,
}: MediaPlayerBlockProps) {
  return (
    <div
      ref={playerWrapperRef}
      className="media-detail-player"
      data-framed={framed ? "true" : undefined}
    >
      {/* `globals.css` decides where this sits — on a phone the wrapper
          above is stuck to the top of the canvas. Nothing here is told
          about it, because being told means re-rendering, and
          re-rendering is the one thing a player must not do. */}
      <FilePreview
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
      />

      {/* Directly below the player rather than inside its control bar:
          that bar belongs to the .loft embed and native video does not
          have one, so a button there would appear for some media and
          not others. One row so an addon action and the core's own
          layout toggle read as a single toolbar instead of stacking.
          `empty:hidden` drops the row's own padding when neither child
          renders (same trick as the heavy-summary footer). */}
      <div className="flex items-center justify-end gap-2 px-3 pt-2 empty:hidden">
        <AddonSlot
          id="file-preview-actions"
          layout="stack"
          props={addonSlotProps}
        />
        {layoutToggle && <MediaLayoutToggle railGated={layoutToggle.railGated} />}
      </div>
    </div>
  );
}
