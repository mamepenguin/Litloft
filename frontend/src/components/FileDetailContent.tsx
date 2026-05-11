"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Maximize2,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import {
  dislikeFile,
  getFile,
  likeFile,
  recordFileView,
  updateFile,
} from "@/lib/api";
import { addRecentlyPlayed } from "@/lib/recentlyPlayed";
import { formatDuration, formatFileSize } from "@/lib/format";
import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";

import { markdownContentRegistry } from "@/lib/markdownContentRegistry";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ActiveSummaryHost } from "./ActiveSummaryHost";
import { AddonSlot } from "./AddonSlot";
import { CastButton } from "./CastButton";
import { CommentSection } from "./CommentSection";
import { EditableTagChips } from "./EditableTagChips";
import { ExifSection } from "./ExifSection";
import { FavoriteButton } from "./FavoriteButton";
import { FileActions } from "./FileActions";
import { FilePreview } from "./FilePreview";
import { MarkdownDocumentLayout } from "./MarkdownDocumentLayout";
import { RelatedFilesSection } from "./RelatedFilesSection";
import { useSidebar } from "./SidebarProvider";
import { usePolicy } from "@/hooks/usePolicy";

interface FileDetailContentProps {
  fileId: string;
  /**
   * Drive name passed in from the host. Both hosts (the 2-pane right
   * pane and the playlist-exception fullscreen route) already know
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
   * Forwarded to ``FilePreview``: callback when video / audio playback
   * ends. The playlist-exception fullscreen route uses this to
   * advance to the next item; the 2-pane right pane omits it (playlist
   * mode lives on the fullscreen route per §4.6).
   */
  onEnded?: () => void;
  /** Forwarded to ``FilePreview``: kick off playback on mount. */
  autoPlay?: boolean;
}

/**
 * The full per-file detail surface, sans navigation chrome.
 *
 * PR-3 of the right-pane equivalence merger
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md, §3.2):
 * extracts the body of the legacy ``/files/[id]/page.tsx`` so both
 * the 2-pane right pane and the playlist-exception fullscreen route
 * share a single rendering. Each host wraps this with its own chrome
 * (back button / TreeToggle / ImageGallery mount / PlaylistPanel /
 * useOverlaySidebar / arrow nav).
 *
 * Spec contract — what this component intentionally does **not** do
 * (§3.4):
 *   - call ``useOverlaySidebar()`` (host-side, varies by mode)
 *   - mount ``ImageGallery`` (host-side, on a callback)
 *   - mount ``PlaylistPanel`` (playlist mode lives outside the 2pane)
 *   - register arrow-key navigation (host uses ``useFileNav`` hook)
 *   - render a back button (host renders TreeToggle / ✕ / ←)
 *   - own searchParams (host extracts and passes initialTime etc.)
 */
export function FileDetailContent({
  fileId,
  drive,
  initialTime,
  initialPage,
  highlight,
  onMediaController,
  miniPlayerRoot,
  onRequestImageGallery,
  onAfterDelete,
  onEnded,
  autoPlay,
}: FileDetailContentProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const { requestRefresh: refreshSidebar } = useSidebar();
  const isMobile = useIsMobile();

  const [file, setFile] = useState<FileItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  // Bumped after every tag save (from either the outer File.tags chip
  // row or the .md Properties Panel chip row). The .md MarkdownFileViewer
  // watches this to refetch ``source`` so its frontmatter display
  // matches the server-projected state. For non-.md files this is
  // unused but harmless.
  const [tagSaveVersion, setTagSaveVersion] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Mirrors the published controller locally so children that need
  // it (FileActions for casting, addon slots for citation jump) can
  // pick it up.
  const [mediaController, setMediaController] =
    useState<MediaController | null>(null);

  const handleMediaController = useCallback(
    (mc: MediaController | null) => {
      setMediaController(mc);
      onMediaController?.(mc);
    },
    [onMediaController],
  );

  useEffect(() => {
    setFile(null);
    setEditing(false);
    let cancelled = false;
    getFile(fileId)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        setEditTitle(f.title);
        setEditDesc(f.description);
      })
      .catch(() => {
        // Host renders the loading / not-found UI when ``file`` is
        // null below, so swallow the error here.
      });
    addRecentlyPlayed(fileId);
    // Server-side mirror of the localStorage record so personal_history
    // (Ask Stage B) can find non-media files. Fire-and-forget. Per
    // spec §4.5 / Phase 1 acceptance: must fire exactly once per
    // mounted fileId.
    recordFileView(fileId);
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const handleTagsSaved = useCallback(() => {
    getFile(fileId)
      .then(setFile)
      .catch(() => {
        // Optimistic state stays correct; the next navigation refetches.
      });
    setTagSaveVersion((v) => v + 1);
    refreshSidebar();
  }, [fileId, refreshSidebar]);

  // Phase 3 follow-up (hako 0RnZ1KdtomAfIJPLAGIHA): in content-mode the
  // inspector chip group does not own the save path, so its
  // `onSaveSuccess` was unwired. Subscribe to the registry's
  // save-success channel instead — the editor signals after every
  // successful PUT, and we refetch `file.tags` so the file detail UI
  // does not sit on a stale array if the user navigates away
  // immediately after editing chips.
  useEffect(() => {
    const dispose = markdownContentRegistry.subscribeSaved(fileId, () => {
      handleTagsSaved();
    });
    return dispose;
  }, [fileId, handleTagsSaved]);

  const handleLike = useCallback(async () => {
    if (!file) return;
    const updated = await likeFile(file.id);
    setFile(updated);
  }, [file]);

  const handleDislike = useCallback(async () => {
    if (!file) return;
    const updated = await dislikeFile(file.id);
    setFile(updated);
  }, [file]);

  const handleSave = useCallback(async () => {
    if (!file) return;
    setSaving(true);
    const updated = await updateFile(file.id, {
      title: editTitle,
      description: editDesc,
    });
    setFile(updated);
    setEditing(false);
    setSaving(false);
  }, [file, editTitle, editDesc]);

  // Drive-scope policy lookup for the Knowledge editor. The DocumentLayout
  // fork below only takes effect when the policy resolved to enabled,
  // which prevents a layout flicker on first paint (during loading the
  // hook reports `enabled=true / isLoading=true`; we explicitly require
  // `!isLoading` so we never speculatively swap layouts based on the
  // fail-open default).
  const knowledgeEditorPolicy = usePolicy(drive, "knowledge", "editor");

  // Phase 3.5 (spec 2026-05-10 §D2 / hako ZWLqXgdTwt9le4dAI3U8C):
  // subscribe to the markdown content registry so the inspector's
  // EditableTagChips can run in content-mode against the editor's
  // shared `content` state. Re-renders on register/unregister AND
  // on every editor content pulse, so the chip always sees the
  // freshest snapshot at click time (closing the etag race that
  // Phase 3 inherited from the standalone two-writer design).
  useSyncExternalStore(
    markdownContentRegistry.subscribe,
    () => markdownContentRegistry.lookup(fileId)?.getContent() ?? null,
    () => null,
  );
  const mdEntry = markdownContentRegistry.lookup(fileId);

  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const hasDuration =
    (file.file_type === "video" || file.file_type === "audio") &&
    file.duration != null;

  // DocumentLayout fork: only when the file is Markdown, the policy
  // resolved (not loading), and the policy says editor=true. Computed
  // before ``metadataNode`` so the inspector chip group can pick
  // content-mode (Phase 3.5) when the registry has an entry for the
  // file. Anything else falls through to the legacy vertical stack.
  const useDocumentLayout =
    file.mime_type === "text/markdown" &&
    !knowledgeEditorPolicy.isLoading &&
    knowledgeEditorPolicy.enabled;

  // Wire the inspector's EditableTagChips through the editor's shared
  // content state when both (a) we're in the DocumentLayout fork and
  // (b) the editor has registered an entry. Falls back to standalone
  // mode otherwise — non-Markdown files have no editor, and a brief
  // gap before the editor mounts must not leave the chip group
  // unable to save.
  const useChipContentMode = useDocumentLayout && mdEntry !== null;
  const tagChipNode = useChipContentMode ? (
    <EditableTagChips
      file={file}
      content={mdEntry!.getContent()}
      onContentChange={mdEntry!.setContent}
    />
  ) : (
    <EditableTagChips
      file={file}
      initialTags={file.tags}
      onTagsChange={(nextTags) => {
        // Optimistic local update only — the sidebar refresh waits
        // until the debounced save lands.
        setFile((prev) => (prev ? { ...prev, tags: nextTags } : prev));
      }}
      onSaveSuccess={handleTagsSaved}
    />
  );

  const metadataNode = (
    <div className="mt-4">
      {editing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full rounded-2xl bg-bg-card px-3 py-2 text-lg font-bold text-text-primary outline-none focus:ring-2 focus:ring-focus-ring"
          />
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder={t("addDescription")}
            rows={3}
            className="w-full rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-focus-ring"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 rounded-2xl bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <Check size={14} />
              {tc("save")}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEditTitle(file.title);
                setEditDesc(file.description);
              }}
              className="flex items-center gap-1 rounded-lg bg-bg-card px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
            >
              <X size={14} />
              {tc("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {file.title}
          </h1>
          {(hasDuration || file.description) && (
            <div className="mt-1 text-xs text-text-muted">
              {hasDuration && <span>{formatDuration(file.duration)} · </span>}
              <span>{formatFileSize(file.file_size)}</span>
              {file.description && (
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  {file.description}
                </p>
              )}
            </div>
          )}
          {!hasDuration && !file.description && (
            <p className="mt-1 text-xs text-text-muted">
              {formatFileSize(file.file_size)}
            </p>
          )}
          <div className="mt-2 flex items-center gap-1">
            <div className="flex items-center overflow-hidden rounded-full bg-bg-card">
              <button
                onClick={handleLike}
                className="px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
                aria-label="Like"
              >
                <ThumbsUp size={16} />
              </button>
              <span className="min-w-[1.5rem] text-center text-sm text-text-muted">
                {file.likes}
              </span>
              <button
                onClick={handleDislike}
                className="px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
                aria-label="Dislike"
              >
                <ThumbsDown size={16} />
              </button>
            </div>
            <FavoriteButton
              fileId={file.id}
              isFavorite={file.is_favorite}
              onToggle={setFile}
              showLabel
            />
            {file.file_type === "image" && onRequestImageGallery && (
              <button
                onClick={onRequestImageGallery}
                className="rounded-lg p-2 text-text-muted hover:bg-bg-card hover:text-text-primary"
                aria-label={t("galleryMode")}
              >
                <Maximize2 size={16} />
              </button>
            )}
            {file.file_type === "video" && (
              <CastButton mediaRef={videoRef} />
            )}
            <FileActions
              file={file}
              onUpdate={() => getFile(fileId).then(setFile)}
              onDelete={() => onAfterDelete?.()}
              onEdit={() => setEditing(true)}
            />
          </div>
          <div className="mt-3">{tagChipNode}</div>
        </div>
      )}
    </div>
  );

  // Shared addon slot props. Same shape regardless of layout fork so
  // every slot entry receives an identical context.
  const addonSlotProps = {
    fileId,
    drive,
    videoRef,
    mediaController,
    subtitles: file.subtitles,
  };

  if (useDocumentLayout) {
    // 2026-05-12 inspector consolidation:
    //
    // - The Inspector (and the mobile Bottom Sheet) hosts every
    //   section that fits comfortably in a ~300px column: file meta,
    //   tags, related files, exif, similar-files, comments, plus
    //   residual addon sections (everything except `knowledge-edit`
    //   and `detailed-summary`).
    // - The canvas footer keeps only the **table-/structure-heavy**
    //   summary surface — `ActiveSummaryHost` + intelligence's
    //   `detailed-summary` slot. Both can carry markdown tables that
    //   need canvas width to render without horizontal scroll.
    // - On mobile, the canvas footer is suppressed entirely and the
    //   heavy summaries move into the Bottom Sheet as well: the
    //   90vh × viewport-width drawer is wide enough that tables
    //   degrade gracefully (or scroll horizontally inside the drawer)
    //   without the narrow-inspector problem. This avoids the
    //   "long markdown body keeps the user from finding metadata"
    //   pattern the previous canvas-footer layout had on phones.
    const inspectorSections = (
      <>
        {metadataNode}
        <RelatedFilesSection fileId={fileId} />
        <ExifSection fileId={fileId} fileType={file.file_type} />
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          excludeIds={["knowledge-edit", "detailed-summary"]}
          props={addonSlotProps}
        />
        <CommentSection fileId={fileId} />
      </>
    );

    const heavySummarySections = (
      <>
        <ActiveSummaryHost fileId={fileId} drive={drive} />
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          includeIds={["detailed-summary"]}
          props={addonSlotProps}
        />
      </>
    );

    const inspectorPaneContent = (
      <div className="space-y-4 p-4">{inspectorSections}</div>
    );

    // Mobile Bottom Sheet content: inspector + heavy summaries inline.
    // Built only when actually on mobile so the underlying AddonSlot /
    // CommentSection components mount exactly once across the two
    // surfaces (desktop pane *or* mobile sheet, never both).
    const mobileSheetContent = isMobile ? (
      <div className="space-y-4 p-4">
        {inspectorSections}
        {heavySummarySections}
      </div>
    ) : undefined;

    return (
      <MarkdownDocumentLayout
        drive={drive}
        title={file.title || file.filename}
        inspector={inspectorPaneContent}
        mobileSheet={mobileSheetContent}
        resetKey={fileId}
      >
        <div className="flex flex-col">
          <div className="relative isolate flex flex-col bg-bg-primary">
            <AddonSlot
              id="file-detail-sections"
              layout="stack"
              includeIds={["knowledge-edit"]}
              props={{ ...addonSlotProps, fillHeight: true }}
            />
          </div>
          {/* Canvas footer carries the table-heavy summaries on
              desktop only; on mobile the same sections live in the
              Bottom Sheet so the user does not have to scroll past a
              long note to reach them. */}
          {!isMobile && (
            <div className="relative isolate space-y-6 border-t border-bg-border bg-bg-primary px-6 py-8">
              {heavySummarySections}
            </div>
          )}
        </div>
      </MarkdownDocumentLayout>
    );
  }

  // Legacy vertical stack — preserved verbatim for non-Markdown files
  // and for drives where the Knowledge editor is policy-disabled.
  return (
    <div className="w-full">
      <FilePreview
        file={file}
        videoRef={videoRef}
        initialTime={initialTime}
        initialPage={initialPage}
        highlight={highlight}
        onMediaController={handleMediaController}
        markdownReloadKey={tagSaveVersion}
        onMarkdownTagsSaved={handleTagsSaved}
        miniPlayerRoot={miniPlayerRoot}
        onEnded={onEnded}
        autoPlay={autoPlay}
      />

      {metadataNode}

      <div className="mt-4 space-y-4">
        <ActiveSummaryHost fileId={fileId} drive={drive} />
        <RelatedFilesSection fileId={fileId} />
        <ExifSection fileId={fileId} fileType={file.file_type} />
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          props={addonSlotProps}
        />
      </div>

      <CommentSection fileId={fileId} />
    </div>
  );
}
