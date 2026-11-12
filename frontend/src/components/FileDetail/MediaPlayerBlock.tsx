"use client";

import type { RefObject } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import type { DocumentController } from "@/lib/documentController";
import type { PdfController } from "@/lib/pdfController";
import type { ArchiveController } from "@/lib/archiveController";
import { playerKind } from "@/lib/playerKind";
import { useAddonSlots } from "../AddonSlotsProvider";
import { AddonSlot } from "../AddonSlot";
import { FilePreview } from "../FilePreview";

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
  initialSection?: number;
  highlight?: string;
  onMediaController: (mc: MediaController | null) => void;
  onDocumentCaptureController: (c: DocumentCaptureController | null) => void;
  onPdfController?: (c: PdfController | null) => void;
  onArchiveController?: (c: ArchiveController | null) => void;
  onDocumentController?: (c: DocumentController | null) => void;
  markdownReloadKey: number;
  onMarkdownTagsSaved: () => void;
  miniPlayerRoot?: Element | null;
  onEnded?: () => void;
  autoPlay?: boolean;
  addonSlotProps: Record<string, unknown>;
  /** Attach so the player's offset can be measured for `--player-avail`. */
  playerWrapperRef: RefObject<HTMLDivElement | null>;
  framed: boolean;
  bleed?: boolean;
  /**
   * False where the shell moves the actions onto the workbench row, so they
   * are mounted once there instead of here.
   */
  showPreviewActions?: boolean;
  /**
   * False where the file page draws the panel itself, in the inspector's
   * Info tab, so the entry is mounted once.
   */
  showMetadataAside?: boolean;
}

export function MediaPlayerBlock({
  file,
  videoRef,
  initialTime,
  initialPage,
  initialSection,
  highlight,
  onMediaController,
  onDocumentCaptureController,
  onPdfController,
  onArchiveController,
  onDocumentController,
  markdownReloadKey,
  onMarkdownTagsSaved,
  miniPlayerRoot,
  onEnded,
  autoPlay,
  addonSlotProps,
  playerWrapperRef,
  framed,
  bleed = false,
  showPreviewActions = true,
  showMetadataAside = true,
}: MediaPlayerBlockProps) {
  const { hasSlot } = useAddonSlots();
  const aside =
    showMetadataAside && playerKind(file) === "loft" && hasSlot(MEDIA_ASIDE_SLOT);
  return (
    <>
      <div
        ref={playerWrapperRef}
        className="media-detail-player"
        data-framed={framed ? "true" : undefined}
        data-bleed={bleed ? "true" : undefined}
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
          initialSection={initialSection}
          highlight={highlight}
          onMediaController={onMediaController}
          onDocumentCaptureController={onDocumentCaptureController}
          onPdfController={onPdfController}
          onArchiveController={onArchiveController}
          onDocumentController={onDocumentController}
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
        <div
          data-preview-actions="true"
          className="flex items-center justify-end gap-2 px-3 pt-2 empty:hidden"
        >
          {showPreviewActions && (
            <AddonSlot
              id="file-preview-actions"
              layout="stack"
              props={addonSlotProps}
            />
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
