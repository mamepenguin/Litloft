"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import { AddonSlot } from "../AddonSlot";
import { ChaptersPanel } from "../ChaptersPanel";
import { FilePreview } from "../FilePreview";
import { MediaLayoutToggle } from "../MediaLayoutToggle";
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
  /** Which player, if any, plays this file. `null` means none does. */
  companionKind: string | null;
  /** Whether a rail may sit beside the player at all. */
  railEligible: boolean;
  /** Whether anyone — core chapters or an addon — fills the companion. */
  companionOccupied: boolean;
  /** Meta, AI sections and comments, stacked under the player. */
  rest: ReactNode;
}

/**
 * The player and everything the legacy layout stacks under it.
 *
 * Three shapes, chosen by what can occupy the companion region rather
 * than by file type: no companion at all, a companion promoted to full
 * width under the player, or the two-column grid. The choice is made
 * here; how wide each column ends up is `globals.css` reading the
 * variables `useCompanionMetrics` publishes.
 */
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
  companionOccupied,
  rest,
}: FileDetailCanvasProps) {
  const { railAvailable, playerAvailable, playerWrapperRef, attachRailHost } =
    metrics;

  // Whether the player draws a fixed 16:9 frame, which is what makes
  // the height budget expressible as a width cap at all. Only video and
  // `.loft` do: an image sizes itself from `max-h-[70vh]` with `w-auto`,
  // and PDF, text and archive previews have no aspect ratio to invert.
  // Capping their column by `--player-avail * 16 / 9` would shrink them
  // for no reason on a short, wide window.
  //
  // The same two kinds as `railEligible` today, kept separate because
  // the two answer different questions — one is "can a rail fit beside
  // it", this is "is its height a function of its width".
  const playerHasFixedFrame = railEligible;

  const playerNode = (
    <>
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
        {/* Only rendered where a rail is possible at all; the container
            query decides whether it is visible. */}
        {railEligible && companionOccupied && <MediaLayoutToggle />}
      </div>
    </>
  );

  const playerLayoutNode = (
    <div
      ref={playerWrapperRef}
      className="media-detail-player"
      data-framed={playerHasFixedFrame ? "true" : undefined}
    >
      {playerNode}
    </div>
  );

  // Publish the existing rail variables and the new player budget on a
  // wrapper shared by every legacy layout branch. The grid path inherits
  // byte-for-byte the same rail values it used to own directly.
  const mediaDetailStyle = {
    "--rail-top": miniPlayerRoot ? "0px" : "var(--app-header-h, 0px)",
    ...(railAvailable != null ? { "--rail-avail": `${railAvailable}px` } : {}),
    ...(playerAvailable != null
      ? { "--player-avail": `${playerAvailable}px` }
      : {}),
  } as CSSProperties;

  // The companion region only exists for files a player actually
  // plays, and only when an addon has something to put in it. With no
  // occupant the grid never appears and the page is exactly as before.
  if (!companionKind || !companionOccupied) {
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
        {/* The second occupant #31 anticipated, and it stacks rather than
            sharing a tab strip. Tabs are exclusive, so they would put
            "where am I" and "what is being said" behind one another —
            seeing a coarse index and the fine text follow the same clock
            at once is the reason the rail exists. Chapters sit above
            because they are the shorter, coarser index of the two. */}
        {chaptersPresent && (
          <ChaptersPanel
            fileId={fileId}
            mediaController={mediaController}
            refreshToken={chaptersVersion}
            onResolved={onChaptersResolved}
          />
        )}
        {/* The wrapper #31 said would break the flex chain. It is here
            because the chain now has to fork — the lead sizes to its
            content while the slot takes the remainder — and it does not
            break anything as long as it is itself a flex container that
            passes the height on, which `media-detail-companion-fill`
            is. */}
        {/* fillHeight is unconditional: the host bounds this region in
            both forms, so the occupant should always fill what it is
            given. Deciding it by file kind was wrong — whether the rail
            form is in use is a container-width question answered in
            CSS, and a video in a narrow pane got the fill treatment
            with nothing bounding it, so the list ran to full length. */}
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
  // beside it would leave half the width empty. It keeps the promoted
  // position — directly below the player, full width — which is what
  // the narrow form of the grid already is.
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
