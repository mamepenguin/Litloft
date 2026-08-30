"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
  renameFile,
  updateFile,
} from "@/lib/api";
import { addRecentlyPlayed } from "@/lib/recentlyPlayed";
import { formatDuration, formatFileSize } from "@/lib/format";
import { clearListSnapshot } from "@/lib/listSnapshot";
import {
  FILE_CHAPTERS_UPDATED_EVENT,
  type FileChaptersUpdatedDetail,
} from "@/lib/addonEvents";
import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import { playerKind } from "@/lib/playerKind";
import type { DocumentCaptureController } from "@/lib/documentCapture";

import { markdownContentRegistry } from "@/lib/markdownContentRegistry";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ActiveSummaryHost } from "./ActiveSummaryHost";
import { AddonSlot } from "./AddonSlot";
import { useAddonSlots } from "./AddonSlotsProvider";
import { CastButton } from "./CastButton";
import { ChaptersPanel } from "./ChaptersPanel";
import { CommentSection } from "./CommentSection";
import { MarkdownAwareTagChips } from "./MarkdownAwareTagChips";
import { ExifSection } from "./ExifSection";
import { FavoriteButton } from "./FavoriteButton";
import { TrustTierControl } from "./TrustTierControl";
import { FileActions } from "./FileActions";
import { FilePreview } from "./FilePreview";
import { MarkdownDocumentLayout } from "./MarkdownDocumentLayout";
import { MediaLayoutToggle } from "./MediaLayoutToggle";
import { RelatedFilesSection } from "./RelatedFilesSection";
import { SeekableDescription } from "./SeekableDescription";
import { useSidebar } from "./SidebarProvider";
import { usePolicy } from "@/hooks/usePolicy";

interface FileDetailContentProps {
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
   * Forwarded to ``FilePreview``: callback when video / audio playback
   * ends. The collection-exception fullscreen route uses this to
   * advance to the next item; the 2-pane right pane omits it
   * (collection mode lives on the fullscreen route per §4.6).
   */
  onEnded?: () => void;
  /** Forwarded to ``FilePreview``: kick off playback on mount. */
  autoPlay?: boolean;
}

const PLAYER_PEEK_PX = 48;

/**
 * Width at which the companion may sit beside the player, in rem:
 * 552px player + 384px rail + 24px gap. Kept in rem, and resolved
 * against the root font size when measured, so a viewer who scales
 * text gets the layout these numbers were chosen for. Must stay in
 * step with the `[data-media-width="wide"]` rules in `globals.css`.
 */
const RAIL_MIN_REM = 60;

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
  const { hasSlot } = useAddonSlots();
  const isMobile = useIsMobile();

  const [file, setFile] = useState<FileItem | null>(null);
  /**
   * Whether the companion region has chapters to show — held apart from
   * ``file`` on purpose.
   *
   * ``has_chapters`` is a detail-only field, but ``FileItem`` is also what
   * the mutation endpoints return (like / dislike / favourite / metadata /
   * rename all answer with the plain ``FileResponse``). Every one of those
   * does ``setFile(updated)``, so keeping the flag on the file object means
   * liking a video makes its chapters disappear until the next reload.
   * Separate state cannot be clobbered by a whole-object replace, now or
   * from a call site added later.
   *
   * Seeded from the detail response so the layout is decided without a
   * second round trip, then corrected by the panel once its fetch settles
   * (see ``ChaptersPanel``'s ``onResolved``).
   */
  const [chaptersPresent, setChaptersPresent] = useState(false);
  const [chaptersVersion, setChaptersVersion] = useState(0);
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
  const [documentCaptureController, setDocumentCaptureController] =
    useState<DocumentCaptureController | null>(null);

  // How tall the rail may be: the visible height of whatever scrolls.
  // Measured rather than computed, because the two hosts do not differ
  // by a knowable amount — the right pane carries its own header row on
  // top of the app header, and only it knows that.
  const [railAvailable, setRailAvailable] = useState<number | null>(null);
  const [playerAvailable, setPlayerAvailable] = useState<number | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  // Whether this host is wide enough for the rail form. Measured rather
  // than asked of a container query: `@container` establishes a
  // containment context, and on iOS Safari one wrapped around a <video>
  // or a cross-origin iframe renders the whole subtree rotated and
  // spinning. Confirmed on device 2026-08-12 by removing that one word;
  // no desktop browser shows it. hako 7bFYOh3vFZP9EEuf9Ym_5.
  //
  // A viewport breakpoint is still wrong for the same reason it always
  // was — this renders both full-width and inside the 2-pane right pane
  // — so the question stays "how wide is this element", only the way of
  // answering it changes.
  //
  // Written straight onto the node rather than held in state: the
  // layout is decided entirely in CSS from the attribute, the same way
  // `lib/mediaLayout.ts` drives `data-media-layout`. Nothing has to
  // re-render for the columns to change, so a window drag costs no
  // React work at all.
  const railHostRef = useRef<HTMLDivElement | null>(null);
  // Both budgets are recomputed on every resize frame and usually come
  // back unchanged; the guards keep an identical value from being
  // dispatched sixty times a second during a drag.
  const railAvailableRef = useRef<number | null>(null);
  const playerAvailableRef = useRef<number | null>(null);
  // Reached by the callback ref below, which runs on commits the
  // measuring effect does not.
  const railObserverRef = useRef<ResizeObserver | null>(null);
  const railMeasureRef = useRef<() => void>(() => {});

  // A callback ref rather than a dependency on "does the wrapper
  // render". The wrapper appears for several independent reasons — the
  // file resolving, an addon publishing `player-side`, chapters
  // answering, the Knowledge editor policy settling — and `getFile`
  // routinely wins the race against the addon catalogue, so the effect
  // would run while this is still null and never look again. A
  // dependency list would have to name every one of those and would
  // eventually miss one; this fires exactly when the node arrives,
  // whatever brought it.
  const attachRailHost = useCallback((node: HTMLDivElement | null) => {
    const previous = railHostRef.current;
    if (previous && railObserverRef.current) {
      railObserverRef.current.unobserve(previous);
    }
    railHostRef.current = node;
    if (!node) return;
    railObserverRef.current?.observe(node);
    // The observer reports a first size on its own, but only where one
    // exists: a fixed-height right pane may never resize again, which
    // would leave the attribute unset until the window changed.
    railMeasureRef.current();
  }, []);

  useEffect(() => {
    const pane = miniPlayerRoot ?? null;
    const publishAvailable = (value: number) => {
      if (value === railAvailableRef.current) return;
      railAvailableRef.current = value;
      setRailAvailable(value);
    };
    const publishPlayerAvailable = (value: number | null) => {
      if (value === playerAvailableRef.current) return;
      playerAvailableRef.current = value;
      setPlayerAvailable(value);
    };
    const measure = () => {
      let available: number;
      let visibleTop: number;
      if (pane) {
        available = pane.clientHeight;
        visibleTop = pane.getBoundingClientRect().top;
      } else {
        const header = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--app-header-h",
          ),
        );
        visibleTop = Number.isFinite(header) ? header : 0;
        available = window.innerHeight - visibleTop;
      }

      // Keep the C-1 rail budget unchanged. The player gets a separate
      // budget because it starts below the scroll root's visible top and
      // deliberately leaves a small peek of the title below the frame.
      publishAvailable(available);
      const player = playerWrapperRef.current;
      const scrollOffset = pane ? pane.scrollTop : window.scrollY;
      publishPlayerAvailable(
        player
          ? Math.max(
              0,
              available -
                Math.max(
                  0,
                  player.getBoundingClientRect().top -
                    visibleTop +
                    scrollOffset,
                ) -
                PLAYER_PEEK_PX,
            )
          : null,
      );

      const host = railHostRef.current;
      if (!host) return;
      const rootFontSize =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        16;
      host.dataset.mediaWidth =
        host.clientWidth >= RAIL_MIN_REM * rootFontSize ? "wide" : "narrow";
    };
    railMeasureRef.current = measure;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    railObserverRef.current = observer;
    observer.observe(pane ?? document.documentElement);
    if (playerWrapperRef.current) observer.observe(playerWrapperRef.current);
    // Safe to observe the element this callback writes an attribute to:
    // the attribute only re-columns the grid *inside* it, while the
    // wrapper itself stays full-width. Nothing it sets can change what
    // it measures, so there is no resize loop to converge.
    //
    // Attached here as well as in the callback ref: whichever of the
    // two runs second finds the other already done, and re-observing an
    // element a ResizeObserver already watches is a no-op.
    if (railHostRef.current) observer.observe(railHostRef.current);
    return () => {
      observer.disconnect();
      railObserverRef.current = null;
    };
    // `file?.id` is here for the *player* wrapper, which renders on
    // every branch as soon as there is a file, so one dependency covers
    // it exactly. The rail host does not rely on it — its callback ref
    // covers every reason that wrapper can appear, including an addon
    // publishing `player-side` after the file has already resolved.
  }, [file?.id, miniPlayerRoot]);

  const handleMediaController = useCallback(
    (mc: MediaController | null) => {
      setMediaController(mc);
      onMediaController?.(mc);
    },
    [onMediaController],
  );

  useEffect(() => {
    setFile(null);
    setChaptersPresent(false);
    setChaptersVersion(0);
    setEditing(false);
    setDocumentCaptureController(null);
    let cancelled = false;
    getFile(fileId)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        setChaptersPresent(f.has_chapters === true);
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

  useEffect(() => {
    const handleChaptersUpdated = (event: Event) => {
      const updatedFileId = (
        event as CustomEvent<Partial<FileChaptersUpdatedDetail>>
      ).detail?.fileId;
      if (updatedFileId === fileId) {
        setChaptersPresent(true);
        setChaptersVersion((version) => version + 1);
      }
    };
    window.addEventListener(
      FILE_CHAPTERS_UPDATED_EVENT,
      handleChaptersUpdated,
    );
    return () => {
      window.removeEventListener(
        FILE_CHAPTERS_UPDATED_EVENT,
        handleChaptersUpdated,
      );
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

  // Folds the region away when the list turns out to be empty or
  // unreadable. Without this the panel hides itself while the region it
  // was the only occupant of stays — an empty 24rem column with the
  // player squeezed beside it.
  const handleChaptersResolved = useCallback((count: number) => {
    setChaptersPresent(count > 0);
  }, []);

  const handleLike = useCallback(async () => {
    if (!file) return;
    try {
      const updated = await likeFile(file.id);
      setFile(updated);
    } catch (err) {
      console.error("Failed to like file:", err);
    }
  }, [file]);

  const handleDislike = useCallback(async () => {
    if (!file) return;
    try {
      const updated = await dislikeFile(file.id);
      setFile(updated);
    } catch (err) {
      console.error("Failed to dislike file:", err);
    }
  }, [file]);

  const handleSave = useCallback(async () => {
    if (!file) return;
    setSaving(true);
    try {
      const updated = await updateFile(file.id, {
        title: editTitle,
        description: editDesc,
      });
      setFile(updated);
      setEditing(false);
    } catch (err) {
      console.error("Failed to save file metadata:", err);
    } finally {
      setSaving(false);
    }
  }, [file, editTitle, editDesc]);

  const handleRename = useCallback(
    async (newFilename: string) => {
      if (!file) return;
      try {
        const updated = await renameFile(file.id, newFilename);
        setFile(updated);
        // Clear the folder-view snapshot so the FolderBrowser doesn't
        // hydrate from stale sessionStorage when it remounts. The
        // FolderBrowser is unmounted while the right-pane file detail is
        // open, so it can't receive the WS files.moved event triggered by
        // the rename — without this the old filename persists until the
        // user opens a new tab.
        clearListSnapshot();
        refreshSidebar();
      } catch (err) {
        console.error("Failed to rename file:", err);
      }
    },
    [file, refreshSidebar],
  );

  // Drive-scope policy lookup for the Knowledge editor. `usePolicy` is
  // fail-open: during the initial load AND during the 30s-TTL background
  // refetch it returns `enabled=true / isLoading=true`. We *only* read
  // `enabled` here so the periodic refetch does not flip the layout
  // branch out from under an open Editor, which would unmount the
  // textarea, reset viewMode to "preview" and re-fire every child
  // `useEffect([fileId])` — observed as a 30-second reload while typing.
  const knowledgeEditorPolicy = usePolicy(drive, "knowledge", "editor");

  // Phase 3.5 (spec 2026-05-10 §D2 / hako ZWLqXgdTwt9le4dAI3U8C): the
  // inspector's tag chips need to subscribe to the markdown content
  // registry so they can run in content-mode against the editor's
  // shared `content` state. That subscription is now isolated inside
  // ``<MarkdownAwareTagChips>`` so an editor keystroke does NOT pulse
  // a re-render of this entire FileDetailContent tree on every typed
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
  const isTimedMedia =
    file.file_type === "video" || file.file_type === "audio";
  const hasDuration = isTimedMedia && file.duration != null;

  // DocumentLayout fork: rides the Markdown-document layout shell for
  // long-form readable content. Eligible when the file is either:
  //   (a) Markdown with the per-drive Knowledge editor policy enabled,
  //       which is the original use case (inline editor + AI sections)
  //   (b) text/html, which uses the same layout for AI artifact preview
  //       and reuses the inspector but never mounts the editor slot
  // Anything else falls through to the legacy vertical stack.
  // Which player, if any, plays this file — and therefore whether a
  // companion region is possible at all and whether it may take the
  // rail form. `playerKind` owns the .loft-before-file_type ordering.
  const companionKind = playerKind(file);
  const railEligible = companionKind === "video" || companionKind === "loft";

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

  // Core is an occupant of the companion region now, not just its host:
  // chapters are a core entity and `AddonSlot` can only load addon
  // components. So every question that used to be "does an addon fill
  // this?" becomes "does anyone?".
  const companionOccupied = hasSlot("player-side") || chaptersPresent;

  const isHtmlPreview = file.mime_type === "text/html";
  const useDocumentLayout =
    isHtmlPreview ||
    (file.mime_type === "text/markdown" && knowledgeEditorPolicy.enabled);

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
      onTagsSaved={handleTagsSaved}
      onTagsChangeOptimistic={(nextTags) => {
        setFile((prev) => (prev ? { ...prev, tags: nextTags } : prev));
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
                  {isTimedMedia ? (
                    <SeekableDescription
                      text={file.description}
                      durationSeconds={file.duration}
                      mediaController={mediaController}
                    />
                  ) : (
                    file.description
                  )}
                </p>
              )}
            </div>
          )}
          {!hasDuration && !file.description && (
            <p className="mt-1 text-xs text-text-muted">
              {formatFileSize(file.file_size)}
            </p>
          )}
          {/* Wraps because this row also renders inside the 300px Markdown
              inspector and on a phone, where it cannot fit on one line. */}
          <div className="mt-2 flex flex-wrap items-center gap-1">
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
            <TrustTierControl file={file} onChange={setFile} />
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
              addonProps={addonSlotProps}
            />
          </div>
          <div className="mt-3">{tagChipNode}</div>
        </div>
      )}
    </div>
  );

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
    // HTML preview is a pure renderer: intelligence has no concept of
    // "indexing" an HTML artifact, and exposing the empty Suggested-Tags
    // / Summary / Transcript / Index-Details / CLIP-Frames placeholders
    // (plus their global keyboard hint chrome from DetailedSummarySection's
    // Verify mode) would only add noise. Skip the file-detail-sections
    // AddonSlot entirely in HTML mode — the inspector keeps the universal
    // file meta + tags + related + exif + comments stack.
    const inspectorSections = (
      <>
        {metadataNode}
        <RelatedFilesSection fileId={fileId} />
        <ExifSection fileId={fileId} fileType={file.file_type} />
        {!isHtmlPreview && (
          <AddonSlot
            id="file-detail-sections"
            layout="stack"
            excludeIds={["knowledge-edit", "detailed-summary"]}
            props={addonSlotProps}
          />
        )}
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
        {!isHtmlPreview && heavySummarySections}
      </div>
    ) : undefined;

    return (
      <MarkdownDocumentLayout
        drive={drive}
        title={file.filename}
        onRename={isHtmlPreview ? undefined : handleRename}
        inspector={inspectorPaneContent}
        mobileSheet={mobileSheetContent}
        resetKey={fileId}
        previewOnly={isHtmlPreview}
      >
        {/* The canvas is at least as tall as the scroll viewport
            (`flex-1` against the layout's scrolling <main>), and the
            editor region takes whatever the footer leaves. Without
            this, a short note ended at its own content height and the
            sections under it floated in the middle of the screen with
            dead space below. Long notes are unaffected: both boxes
            keep their automatic minimum size and the page scrolls. */}
        <div className="flex flex-1 flex-col">
          <div className="relative isolate flex flex-1 flex-col bg-bg-primary">
            {isHtmlPreview ? (
              <FilePreview file={file} />
            ) : (
              <AddonSlot
                id="file-detail-sections"
                layout="stack"
                includeIds={["knowledge-edit"]}
                props={{ ...addonSlotProps, fillHeight: true }}
              />
            )}
          </div>
          {/* Canvas footer carries the table-heavy summaries on
              desktop only; on mobile the same sections live in the
              Bottom Sheet so the user does not have to scroll past a
              long note to reach them. HTML preview skips the heavy
              summary slot — intelligence does not index HTML and the
              placeholder UI would be misleading. `empty:hidden`
              because both occupants render nothing until the file has
              a summary — the padded, top-bordered strip would
              otherwise be a visible rule floating above the bottom of
              the canvas with nothing under it. */}
          {!isMobile && !isHtmlPreview && (
            <div className="relative isolate space-y-6 border-t border-bg-border bg-bg-primary px-6 py-8 empty:hidden">
              {heavySummarySections}
            </div>
          )}
        </div>
      </MarkdownDocumentLayout>
    );
  }

  // Legacy vertical stack — preserved verbatim for non-Markdown files
  // and for drives where the Knowledge editor is policy-disabled.
  const playerNode = (
    <>
      <FilePreview
        file={file}
        videoRef={videoRef}
        initialTime={initialTime}
        initialPage={initialPage}
        highlight={highlight}
        onMediaController={handleMediaController}
        onDocumentCaptureController={setDocumentCaptureController}
        markdownReloadKey={tagSaveVersion}
        onMarkdownTagsSaved={handleTagsSaved}
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
          renders (same trick as the heavy-summary footer below). */}
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
    ...(railAvailable != null
      ? { "--rail-avail": `${railAvailable}px` }
      : {}),
    ...(playerAvailable != null
      ? { "--player-avail": `${playerAvailable}px` }
      : {}),
  } as CSSProperties;

  const restNode = (
    <>
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
    </>
  );

  // The companion region only exists for files a player actually
  // plays, and only when an addon has something to put in it. With no
  // occupant the grid never appears and the page is exactly as before.
  if (!companionKind || !companionOccupied) {
    return (
      <div className="media-detail-host w-full" style={mediaDetailStyle}>
        {playerLayoutNode}
        {restNode}
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
            onResolved={handleChaptersResolved}
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
        {restNode}
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
        <div className="media-detail-rest">{restNode}</div>
      </div>
    </div>
  );
}
