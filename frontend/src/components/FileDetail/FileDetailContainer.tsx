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
import { FileActionRow } from "./FileActionRow";
import { FileMetaBlock } from "./FileMetaBlock";
import { useCompanionMetrics } from "./hooks/useCompanionMetrics";
import { useFileDetailData } from "./hooks/useFileDetailData";
import { useSlotAvailability } from "./hooks/useSlotAvailability";

export interface FileDetailContentProps {
  fileId: string;
  drive: string;
  initialTime?: number;
  initialPage?: number;
  highlight?: string;
  onMediaController?: (mc: MediaController | null) => void;
  miniPlayerRoot?: Element | null;
  onRequestImageGallery?: () => void;
  onAfterDelete?: () => void;
  onBack?: () => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  surface?: FileDetailSurface;
}

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
  const { getSlotEntries, hasSlot } = useAddonSlots();
  const slotAvailability = useSlotAvailability(fileId);
  const isMobile = useIsMobile();
  const data = useFileDetailData(fileId);
  const { file, setFile } = data;

  const videoRef = useRef<HTMLVideoElement>(null);
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
  // `useEffect([fileId])`.
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

  const companionKind = playerKind(file);
  // Asked once and passed down. Two spellings of "does a player play
  // this" is how the description ends up rendered twice, or nowhere.
  const hasPlayer = companionKind !== null;
  const railEligible = companionKind === "video" || companionKind === "loft";
  const playerFramed = railEligible;

  // `companionMountable` is "could anyone fill it", and it is what
  // decides whether the occupants are mounted at all. It must not
  // consult availability: the occupants are what report availability, so
  // a region unmounted because nothing was available yet would take the
  // reporters down with it and freeze that answer for good.
  const companionMountable = hasSlot("player-side") || data.chaptersPresent;
  const companionOccupied =
    data.chaptersPresent ||
    getSlotEntries("player-side").some((entry) =>
      slotAvailability.isAvailable(entry.id),
    );

  const isHtmlPreview = file.mime_type === "text/html";
  // Whether the Knowledge editor is the thing in the canvas. Narrower
  // than `ridesShell`, and it must stay that way: it is what tells the
  // tag chips to run against the editor's shared content state, and a
  // PDF riding the same shell has no editor to run against.
  const useDocumentLayout = usesDocumentShell(
    file.mime_type,
    knowledgeEditorPolicy.enabled,
  );

  /**
   * The negation and not a list of kinds: everything the shell carries
   * is either the document form (a note, and the HTML preview that
   * borrows its single-scroll layout) or a viewer, so naming the viewer
   * kinds here would be a second copy of the list in
   * `ridesFileDetailShell` — and the two would drift the first time a
   * kind joined.
   */
  const usesCanvasViewer = !useDocumentLayout;

  /**
   * A video's description is its show notes, not a property of the file.
   * A PDF's is a property of the file, so it stays with the title and
   * the size where every other kind's is.
   */
  const descriptionInCanvas = ridesShell && hasPlayer;

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
      hoistDescription={descriptionInCanvas}
    />
  );

  // The 56px the Bottom Sheet rests at. Built here rather than in the
  // layout because it needs the same handlers `meta` does, and built
  // only on the surface that has a sheet so the row cannot be mounted
  // twice with the inspector's copy.
  const fileDisplayName = file.title || file.filename;
  const sheetPeek =
    ridesShell && isMobile ? (
      <>
        {/* Not a heading. The name is announced by the sheet's own
            title when it is up, and a second heading for the same file
            at a shallower level than the inspector's `h1` inverted the
            document outline inside one dialog. */}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {fileDisplayName}
        </span>
        <FileActionRow
          file={file}
          onFileChange={setFile}
          onRefetch={data.refetch}
          onStartEdit={data.startEditing}
          onAfterDelete={onAfterDelete}
          onRequestImageGallery={onRequestImageGallery}
          videoRef={videoRef}
          addonSlotProps={addonSlotProps}
          compact
        />
      </>
    ) : undefined;

  return (
    <FileDetailPresenter
      file={file}
      fileId={fileId}
      drive={drive}
      isMobile={isMobile}
      ridesShell={ridesShell}
      isHtmlPreview={isHtmlPreview}
      hasPlayer={hasPlayer}
      usesCanvasViewer={usesCanvasViewer}
      descriptionInCanvas={descriptionInCanvas}
      playerFramed={playerFramed}
      companionKind={companionKind}
      railEligible={railEligible}
      companionMountable={companionMountable}
      companionOccupied={companionOccupied}
      slotAvailability={slotAvailability}
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
      sheetPeek={sheetPeek}
    />
  );
}
