"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { DocumentCaptureController } from "@/lib/documentCapture";
import { playerKind } from "@/lib/playerKind";
import {
  ridesFileDetailShell,
  usesDocumentShell,
  type FileDetailSurface,
} from "@/lib/fileDetailShell";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePolicy } from "@/hooks/usePolicy";
import { useAddonSlots } from "../AddonSlotsProvider";
import { MarkdownAwareTagChips } from "../MarkdownAwareTagChips";
import { FileDetailPresenter } from "./FileDetailPresenter";
import { FileMetaBlock } from "./FileMetaBlock";
import { useCompanionMetrics } from "./hooks/useCompanionMetrics";
import { useFileDetailData } from "./hooks/useFileDetailData";

export interface FileDetailContentProps {
  fileId: string;
  /**
   * Drive name passed in from the host. Both hosts (the 2-pane right
   * pane and the collection-exception fullscreen route) already know
   * the drive — passing it as a prop avoids waiting for ``getFile``
   * to resolve before AddonSlot / EditableTagChips can render. The
   * resolved file's ``drive`` matches this prop in practice (the API
   * returns the file's drive), so they stay in sync.
   */
  drive: string;
  /** Forwarded to ``FilePreview`` for media seek-on-mount. */
  initialTime?: number;
  /** Forwarded to ``FilePreview`` for PDF page anchor. */
  initialPage?: number;
  /** Forwarded to ``FilePreview`` for text/Markdown citation jump. */
  highlight?: string;
  /**
   * Notified upward whenever the active media controller changes.
   * Hosts that care about citation jump etc. supply a stable setter.
   */
  onMediaController?: (mc: MediaController | null) => void;
  /**
   * IntersectionObserver root for the mini player. The 2-pane host
   * passes its scroll container ref; the fullscreen host omits it
   * (document scroll, viewport root). Forwarded through ``FilePreview``
   * to ``MiniPlayerContainer``.
   */
  miniPlayerRoot?: Element | null;
  /**
   * Called when the user taps the image-gallery launcher. The host
   * (RightPaneFile / FileDetailFullScreen) owns the actual
   * ``<ImageGallery>`` mount + open state, so this component stays
   * agnostic of how the gallery should open.
   */
  onRequestImageGallery?: () => void;
  /**
   * Called when the host should refetch its own neighbors / navigate
   * away after a delete. Optional because the 2-pane host can fall
   * back to clearing ``?file=``.
   */
  onAfterDelete?: () => void;
  /**
   * Overrides the page row's back control. Supplied by a host where
   * "back" is not "up one folder" — collection playback, where it is
   * the collection being played. Reaches the row whether it is drawn by
   * the host or by ``FileDetailShell``, so the two surfaces cannot
   * disagree about it.
   */
  onBack?: () => void;
  /**
   * Forwarded to ``FilePreview``: callback when video / audio playback
   * ends. The collection-exception fullscreen route uses this to
   * advance to the next item; the 2-pane right pane omits it
   * (collection mode lives on the fullscreen route per §4.6).
   */
  onEnded?: () => void;
  /** Forwarded to ``FilePreview``: kick off playback on mount. */
  autoPlay?: boolean;
  /**
   * Which file-detail surface this is. Defaults to the canonical URL,
   * which is where every host but the collection-playback route sits.
   * See ``lib/fileDetailShell.ts`` for why the two differ.
   */
  surface?: FileDetailSurface;
}

/**
 * The full per-file detail surface, sans navigation chrome.
 *
 * PR-3 of the right-pane equivalence merger
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md, §3.2):
 * extracts the body of the legacy ``/files/[id]/page.tsx`` so both
 * the 2-pane right pane and the collection-exception fullscreen route
 * share a single rendering. Each host wraps this with its own chrome
 * (back button / TreeToggle / ImageGallery mount / CollectionPanel /
 * useOverlaySidebar / arrow nav).
 *
 * Spec contract — what this component intentionally does **not** do
 * (§3.4):
 *   - call ``useOverlaySidebar()`` (host-side, varies by mode)
 *   - mount ``ImageGallery`` (host-side, on a callback)
 *   - mount ``CollectionPanel`` (collection mode lives outside the 2pane)
 *   - register arrow-key navigation (host uses ``useFileNav`` hook)
 *   - own searchParams (host extracts and passes initialTime etc.)
 *
 * This file is the container half of the Container/Presenter split
 * (`frontend-conventions.md`): state, data, and the derived facts about
 * the file. Everything about *where* things are drawn lives in
 * `FileDetailPresenter` and below.
 */
export function FileDetailContainer({
  fileId,
  drive,
  initialTime,
  initialPage,
  highlight,
  onMediaController,
  miniPlayerRoot,
  onRequestImageGallery,
  onAfterDelete,
  onBack,
  onEnded,
  autoPlay,
  surface = "canonical",
}: FileDetailContentProps) {
  const { hasSlot } = useAddonSlots();
  const isMobile = useIsMobile();
  const data = useFileDetailData(fileId);
  const { file, setFile } = data;

  const videoRef = useRef<HTMLVideoElement>(null);
  // Mirrors the published controller locally so children that need
  // it (FileActions for casting, addon slots for citation jump) can
  // pick it up.
  const [mediaController, setMediaController] =
    useState<MediaController | null>(null);
  const [documentCaptureController, setDocumentCaptureController] =
    useState<DocumentCaptureController | null>(null);

  // Drive-scope policy lookup for the Knowledge editor. `usePolicy` is
  // fail-open: during the initial load AND during the 30s-TTL background
  // refetch it returns `enabled=true / isLoading=true`. We *only* read
  // `enabled` here so the periodic refetch does not flip the layout
  // branch out from under an open Editor, which would unmount the
  // textarea, reset viewMode to "preview" and re-fire every child
  // `useEffect([fileId])` — observed as a 30-second reload while typing.
  const knowledgeEditorPolicy = usePolicy(drive, "knowledge", "editor");

  const ridesShell = ridesFileDetailShell({
    surface,
    mimeType: file?.mime_type,
    fileType: file?.file_type,
    knowledgeEditorEnabled: knowledgeEditorPolicy.enabled,
  });

  // The shell owns the element that scrolls the canvas, so on the shell
  // it — not the host's wrapper — is what the mini player observes and
  // what `--rail-avail` is measured against. The host's wrapper is
  // still there and still has a height; it just never scrolls any more,
  // so measuring it would report the whole page.
  const [shellScrollRoot, setShellScrollRoot] = useState<Element | null>(null);
  const scrollRoot = ridesShell ? shellScrollRoot : (miniPlayerRoot ?? null);

  const metrics = useCompanionMetrics(file?.id, scrollRoot);

  // The capture controller belongs to whatever viewer is mounted, and
  // the viewer is replaced when the file changes. Dropping it here
  // rather than waiting for the next viewer to publish one keeps a
  // stale controller from being handed to the addon slots of the file
  // that has just been opened.
  useEffect(() => {
    setDocumentCaptureController(null);
  }, [fileId]);

  const handleMediaController = useCallback(
    (mc: MediaController | null) => {
      setMediaController(mc);
      onMediaController?.(mc);
    },
    [onMediaController],
  );

  // Phase 3.5 (spec 2026-05-10 §D2 / hako ZWLqXgdTwt9le4dAI3U8C): the
  // inspector's tag chips need to subscribe to the markdown content
  // registry so they can run in content-mode against the editor's
  // shared `content` state. That subscription is now isolated inside
  // ``<MarkdownAwareTagChips>`` so an editor keystroke does NOT pulse
  // a re-render of this entire FileDetail tree on every typed
  // character — only the chips component re-evaluates.

  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  /**
   * Media with a timeline to seek along. Separate from ``hasDuration``
   * because a file can be playable while its length is unknown, and the
   * description's timestamps are still worth linking then — knowing the
   * length only lets us reject the ones that fall outside it.
   */
  const isTimedMedia = file.file_type === "video" || file.file_type === "audio";

  // Which player, if any, plays this file — and therefore whether a
  // companion region is possible at all and whether it may take the
  // rail form. `playerKind` owns the .loft-before-file_type ordering.
  const companionKind = playerKind(file);
  // Asked once and passed down. Two spellings of "does a player play
  // this" is how the description ends up rendered twice, or nowhere.
  const hasPlayer = companionKind !== null;
  const railEligible = companionKind === "video" || companionKind === "loft";
  /**
   * Whether the player's height is a function of its width.
   *
   * The same two kinds as `railEligible` today, and derived here rather
   * than in each layout because it was written out in both — with the
   * same paragraph explaining it twice — and they answer different
   * questions: one is "can a rail fit beside it", this is "is its
   * height expressible as a width cap". Only video and `.loft` build a
   * fixed 16:9 frame; an image sizes itself from `max-h-[70vh]`, and
   * PDF, text and archive previews have no ratio to invert.
   */
  const playerFramed = railEligible;

  // Core is an occupant of the companion region now, not just its host:
  // chapters are a core entity and `AddonSlot` can only load addon
  // components. So every question that used to be "does an addon fill
  // this?" becomes "does anyone?".
  const companionOccupied = hasSlot("player-side") || data.chaptersPresent;

  const isHtmlPreview = file.mime_type === "text/html";
  // Whether the Knowledge editor is the thing in the canvas. Narrower
  // than `ridesShell`, and it must stay that way: it is what tells the
  // tag chips to run against the editor's shared content state, and a
  // PDF riding the same shell has no editor to run against.
  const useDocumentLayout = usesDocumentShell(
    file.mime_type,
    knowledgeEditorPolicy.enabled,
  );

  // Wire the inspector's tag chips through the editor's shared content
  // state when both (a) we're in the DocumentLayout fork and (b) the
  // editor has registered an entry. Falls back to standalone mode
  // otherwise — non-Markdown files have no editor, and a brief gap
  // before the editor mounts must not leave the chip group unable to
  // save. The registry subscription lives inside this wrapper so
  // editor keystrokes don't bubble re-renders up to this component.
  const tagChipNode = (
    <MarkdownAwareTagChips
      fileId={fileId}
      file={file}
      documentLayoutActive={useDocumentLayout}
      onTagsSaved={data.onTagsSaved}
      onTagsChangeOptimistic={(nextTags: string[]) => {
        setFile((prev: FileItem | null) =>
          prev ? { ...prev, tags: nextTags } : prev,
        );
      }}
    />
  );

  // Shared addon slot props. Same shape regardless of layout fork so
  // every slot entry receives an identical context.
  const addonSlotProps = {
    fileId,
    drive,
    filename: file.filename,
    videoRef,
    mediaController,
    subtitles: file.subtitles,
    fileType: file.file_type,
    mimeType: file.mime_type,
    documentCaptureController,
    // Generic file context, same as fileType/mimeType: lets a section decide
    // whether it applies without a second round-trip for the file it is
    // already being rendered for.
    trustTier: file.trust_tier,
    trustReviewedAt: file.trust_reviewed_at,
    onFileChange: setFile,
  };

  const meta = (
    <FileMetaBlock
      file={file}
      editing={data.editing}
      editTitle={data.editTitle}
      editDesc={data.editDesc}
      saving={data.saving}
      onEditTitleChange={data.setEditTitle}
      onEditDescChange={data.setEditDesc}
      onSave={data.save}
      onCancelEdit={data.cancelEditing}
      onStartEdit={data.startEditing}
      onFileChange={setFile}
      onRefetch={data.refetch}
      onAfterDelete={onAfterDelete}
      onRequestImageGallery={onRequestImageGallery}
      isTimedMedia={isTimedMedia}
      mediaController={mediaController}
      videoRef={videoRef}
      addonSlotProps={addonSlotProps}
      tagChips={tagChipNode}
      // The confirmed layout keeps the viewer and the long things
      // belonging to it in the canvas, and for media the description is
      // one of those — a video's description is its show notes, not a
      // property of the file.
      hoistDescription={ridesShell && hasPlayer}
    />
  );

  return (
    <FileDetailPresenter
      file={file}
      fileId={fileId}
      drive={drive}
      isMobile={isMobile}
      ridesShell={ridesShell}
      isHtmlPreview={isHtmlPreview}
      hasPlayer={hasPlayer}
      playerFramed={playerFramed}
      companionKind={companionKind}
      railEligible={railEligible}
      companionOccupied={companionOccupied}
      isTimedMedia={isTimedMedia}
      chaptersPresent={data.chaptersPresent}
      chaptersVersion={data.chaptersVersion}
      onChaptersResolved={data.onChaptersResolved}
      metrics={metrics}
      addonSlotProps={addonSlotProps}
      mediaController={mediaController}
      onMediaController={handleMediaController}
      onDocumentCaptureController={setDocumentCaptureController}
      videoRef={videoRef}
      initialTime={initialTime}
      initialPage={initialPage}
      highlight={highlight}
      miniPlayerRoot={scrollRoot}
      onScrollRootChange={setShellScrollRoot}
      onEnded={onEnded}
      autoPlay={autoPlay}
      markdownReloadKey={data.tagSaveVersion}
      onMarkdownTagsSaved={data.onTagsSaved}
      onRename={data.rename}
      onBack={onBack}
      meta={meta}
    />
  );
}
