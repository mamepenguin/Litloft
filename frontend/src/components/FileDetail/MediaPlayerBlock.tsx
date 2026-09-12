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
 * The slot for what belongs under the player rather than inside it.
 *
 * **The local rule, which is all this file can hold:** content goes
 * outside `.media-detail-player`. That box is the playable surface the
 * reader must keep — `useSheetHalfSnap` solves the Bottom Sheet's `half`
 * against its bottom edge, `--player-avail` caps its width, and a phone
 * makes it `position: sticky` — so anything in it is something the sheet
 * protects and the phone pins. A description panel in there put `half`
 * below the video's bottom edge on `.loft` files and nowhere else.
 *
 * **A sibling, not a wrapper.** Sticky travels only inside its own
 * containing block, so a box drawn *around* the player takes its travel
 * away instead (`globals.css`, `.media-detail-player-aside`).
 *
 * **Drawn only when someone is in it — and "someone" is three
 * questions, asked in three different places.** The box costs whether or
 * not its occupant drew anything: it takes a named grid row, and such a
 * row is laid out empty, with `gap` on both sides of it. So an empty box
 * adds the gap twice under the player.
 *
 * - **Is the slot about this file at all?** The kind, here. Provider
 *   metadata is about a provider-hosted file.
 * - **Did anyone declare the slot?** `hasSlot`, here. That is all it
 *   answers — `AddButton` carries the same warning over the same helper:
 *   an entry that declared it may still render nothing.
 * - **Did the occupant draw anything?** `empty:hidden` on the box, and
 *   `:not(:empty)` in the rule that gives it a row (`globals.css`).
 *   Neither of the first two can answer this: the occupant decides at
 *   render time, and it has reasons that are not failures. The Media
 *   Import panel returns nothing for a `.loft` file whose provider
 *   metadata has not been fetched, with the addon installed, its policy
 *   on and the player working.
 *
 * Answering fewer than all three leaves the reader a doubled gap under
 * the video: the kind alone left every install without the addon, the
 * kind and the registry left every file whose occupant chose to draw
 * nothing.
 *
 * **The box therefore appears when `/api/addons/status` answers, not on
 * the first paint** — a declared trade. Reserving the row instead is the
 * defect above; an occupant cannot be asked before the registry says
 * there is one; and the occupant's own content waited on that request
 * already.
 *
 * What the occupant draws is the addon's to state —
 * `docs/addons/media-import.md` — and deliberately not repeated here:
 * `addons/` is a submodule whose contents this repository does not
 * track, so nothing here fails when they move.
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
  /** PDF only: the canvas viewer's page state, for the inspector's page list. */
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
