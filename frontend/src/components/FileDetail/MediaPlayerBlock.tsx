"use client";

import type { RefObject } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { PdfController } from "@/lib/pdfController";
import type { ArchiveController } from "@/lib/archiveController";
import { playerKind } from "@/lib/playerKind";
import { useAddonSlots } from "../AddonSlotsProvider";
import { AddonSlot } from "../AddonSlot";
import { FilePreview } from "../FilePreview";
import { MediaLayoutToggle } from "../MediaLayoutToggle";

/**
 * Content goes outside `.media-detail-player`: that box is the playable
 * surface the reader must keep, so anything in it is something the sheet
 * protects and the phone pins.
 *
 * **A sibling, not a wrapper.** Sticky travels only inside its own
 * containing block, so a box drawn *around* the player takes its travel
 * away instead.
 */
const MEDIA_ASIDE_SLOT = "loft-metadata";

export interface MediaPlayerBlockProps {
  file: FileItem;
  videoRef: RefObject<HTMLVideoElement | null>;
  initialTime?: number;
  initialPage?: number;
  highlight?: string;
  onMediaController: (mc: MediaController | null) => void;
  onDocumentCaptureController: (c: DocumentCaptureController | null) => void;
  onPdfController?: (c: PdfController | null) => void;
  onArchiveController?: (c: ArchiveController | null) => void;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  miniPlayerRoot?: Element | null;
  onEnded?: () => void;
  autoPlay?: boolean;
  addonSlotProps: Record<string, unknown>;
  /** Attach so the player's offset can be measured for `--player-avail`. */
  playerWrapperRef: RefObject<HTMLDivElement | null>;
  framed: boolean;
  /**
   * `null` means the toggle is not this block's to draw — the shell puts
   * it in the page row instead, where the confirmed layout has it.
   */
  layoutToggle: { railGated: boolean } | null;
}

export function MediaPlayerBlock({
  file,
  videoRef,
  initialTime,
  initialPage,
  highlight,
  onMediaController,
  onDocumentCaptureController,
  onPdfController,
  onArchiveController,
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
  const { hasSlot } = useAddonSlots();
  const aside =
    playerKind(file) === "loft" && hasSlot(MEDIA_ASIDE_SLOT);
  return (
    <>
      <div
        ref={playerWrapperRef}
        className="media-detail-player"
        data-framed={framed ? "true" : undefined}
      >
        {/* `globals.css` decides where this sits — on a phone this
          wrapper is stuck to the top of the canvas. Nothing here is told
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
          onPdfController={onPdfController}
          onArchiveController={onArchiveController}
          markdownReloadKey={markdownReloadKey}
          onMarkdownTagsSaved={onMarkdownTagsSaved}
          miniPlayerRoot={miniPlayerRoot}
          onEnded={onEnded}
          autoPlay={autoPlay}
        />

        {/* Directly below the player rather than inside its control bar:
          that bar belongs to the .loft embed and native video does not
          have one, so a button there would appear for some media and
          not others. */}
        <div className="flex items-center justify-end gap-2 px-3 pt-2 empty:hidden">
          <AddonSlot
            id="file-preview-actions"
            layout="stack"
            props={addonSlotProps}
          />
          {layoutToggle && (
            <MediaLayoutToggle railGated={layoutToggle.railGated} />
          )}
        </div>
      </div>
      {aside && (
        <div className="media-detail-player-aside empty:hidden">
          <AddonSlot
            id={MEDIA_ASIDE_SLOT}
            props={{ fileId: file.id, drive: file.drive }}
          />
        </div>
      )}
    </>
  );
}
