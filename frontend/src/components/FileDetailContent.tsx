"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const metadataNode = (
    <div className="mt-4">
      {editing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full rounded-lg bg-bg-card px-3 py-2 text-lg font-bold text-text-primary outline-none focus:ring-2 focus:ring-accent"
          />
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder={t("addDescription")}
            rows={3}
            className="w-full rounded-lg bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
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
          <div className="mt-3">
            <EditableTagChips
              file={file}
              initialTags={file.tags}
              onTagsChange={(nextTags) => {
                // Optimistic local update only — the sidebar refresh
                // waits until the debounced save lands.
                setFile((prev) =>
                  prev ? { ...prev, tags: nextTags } : prev,
                );
              }}
              onSaveSuccess={handleTagsSaved}
            />
          </div>
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

  // DocumentLayout fork: only when the file is Markdown, the policy
  // resolved (not loading), and the policy says editor=true. Anything
  // else falls through to the legacy vertical stack — pixel-identical
  // to before this change.
  const useDocumentLayout =
    file.mime_type === "text/markdown" &&
    !knowledgeEditorPolicy.isLoading &&
    knowledgeEditorPolicy.enabled;

  if (useDocumentLayout) {
    // O3 split (spec §D3): heavy content (detailed summary, similar
    // files, comments) moves into the canvas footer so it scrolls
    // naturally as a continuation of the editor preview. The inspector
    // keeps the lightweight tier-1 chrome (tags via metadataNode,
    // related files, exif, residual addon sections).
    const inspectorNode = (
      <div className="space-y-4 p-4">
        {metadataNode}
        <RelatedFilesSection fileId={fileId} />
        <ExifSection fileId={fileId} fileType={file.file_type} />
        <AddonSlot
          id="file-detail-sections"
          layout="stack"
          excludeIds={[
            "knowledge-edit",
            "similar-files",
            "detailed-summary",
          ]}
          props={addonSlotProps}
        />
      </div>
    );

    // Canvas: the Knowledge editor occupies the top region (its
    // three-mode toggle owns its own preview, so FilePreview is
    // intentionally omitted to avoid double-rendering Markdown). The
    // footer below the editor carries the heavy content listed above.
    return (
      <MarkdownDocumentLayout drive={drive} inspector={inspectorNode}>
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="relative isolate flex flex-1 min-h-0 flex-col bg-bg-primary">
            <AddonSlot
              id="file-detail-sections"
              layout="stack"
              includeIds={["knowledge-edit"]}
              props={{ ...addonSlotProps, fillHeight: true }}
            />
          </div>
          <div className="relative isolate space-y-6 border-t border-bg-border bg-bg-primary px-6 py-8">
            <ActiveSummaryHost fileId={fileId} drive={drive} />
            <AddonSlot
              id="file-detail-sections"
              layout="stack"
              includeIds={["detailed-summary", "similar-files"]}
              props={addonSlotProps}
            />
            <CommentSection fileId={fileId} />
          </div>
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
