import { useRelativeDate } from "@/hooks/useRelativeDate";
import { memo, type ReactNode } from "react";
import type { FileItem, WatchProgress } from "@/types";
import { OFFICE_MIMES } from "@/lib/officeFiles";
import { formatDuration, formatFileSize } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import { useFileCardLink } from "@/hooks/useFileCardLink";
import { useClipboard } from "./ClipboardProvider";
import { FavoriteButton } from "./FavoriteButton";
import { TagList } from "./TagList";
import { FileTypeIcon } from "./FileTypeIcon";
import { VideoPreview } from "./VideoPreview";
import { TextThumbnail } from "./TextThumbnail";

function FileCardImpl({
  file,
  onFavoriteToggle,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  selectable,
  selected,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  sortQuery,
  showExtensionBadge = true,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  watchProgress,
  matchOverlay,
}: {
  file: FileItem;
  onFavoriteToggle?: (file: FileItem) => void;
  onContextMenu?: (e: React.MouseEvent, file: FileItem) => void;
  onTouchStart?: (e: React.TouchEvent, file: FileItem) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
  /**
   * Whether this listing's extension badges say anything. Resolved once
   * by the grid and handed down as a plain boolean — see
   * `lib/listMeta.ts` for the rule, and the memo note at the bottom of
   * this file for why it arrives as a primitive.
   *
   * Defaults to drawing it: the drive-home rows render cards
   * directly and are mixed by construction, so the rule would only ever
   * confirm what the default already does.
   */
  showExtensionBadge?: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent, file: FileItem) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  watchProgress?: WatchProgress;
  /**
   * Optional content rendered below the meta row inside the card body.
   * Used by addons (e.g. intelligence semantic search) to surface
   * match metadata such as timestamp pills or page references. Kept
   * generic — the core card has no awareness of its caller's domain.
   */
  matchOverlay?: ReactNode;
}) {
  const formatRelativeDate = useRelativeDate();
  const clipboard = useClipboard();
  const isCutFile = clipboard.isCut(file.id);
  const { Wrapper, wrapperProps } = useFileCardLink({
    file,
    selectable,
    onSelect,
    onMetaSelect,
    onShiftSelect,
    sortQuery,
  });
  const hasThumbnail = file.has_thumbnail || file.file_type === "video" || file.file_type === "image";
  const isTextPreviewable =
    !hasThumbnail &&
    file.file_type === "document" &&
    ((file.mime_type?.startsWith("text/") ?? false) ||
      OFFICE_MIMES.has(file.mime_type ?? ""));

  return (
    <div
      className={`relative${isDragging ? " opacity-40" : ""}${isCutFile ? " opacity-50" : ""}${draggable ? " select-none" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, file) : undefined}
      onDragEnd={onDragEnd}
    >
      {selectable && (
        <div
          className="absolute top-2 left-2 z-10 opacity-100 transition-opacity"
        >
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-lg border-2 transition-colors pointer-events-none ${
              selected
                ? "border-accent bg-accent text-white"
                : "border-text-muted/50 bg-black/40"
            }`}
            aria-hidden
          >
            {selected && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      )}
      <Wrapper
        {...wrapperProps as any}
        className={`group block rounded-2xl overflow-hidden shadow-card transition-colors duration-200 ease-out ${
          selectable ? "cursor-pointer select-none" : ""
        } ${selected ? "ring-2 ring-accent" : ""}`}
        onContextMenu={selectable || !onContextMenu ? undefined : (e: React.MouseEvent) => onContextMenu(e, file)}
        onTouchStart={selectable || !onTouchStart ? undefined : (e: React.TouchEvent) => onTouchStart(e, file)}
        onTouchEnd={selectable ? undefined : onTouchEnd}
        onTouchMove={selectable ? undefined : onTouchMove}
      >
        <div className="relative aspect-video bg-bg-elevated rounded-2xl overflow-hidden">
          {hasThumbnail ? (
            <img
              src={getThumbnailUrl(file.id)}
              alt={file.title}
              className="h-full w-full object-cover"
              loading="lazy"
              draggable="false"
            />
          ) : isTextPreviewable ? (
            <TextThumbnail file={file} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FileTypeIcon fileType={file.file_type} size={48} className="text-text-muted" />
            </div>
          )}
          {file.file_type === "video" && (
            <VideoPreview fileId={file.id} />
          )}
          {(file.file_type === "video" || file.file_type === "audio") && file.duration != null && (
            <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
              {formatDuration(file.duration)}
            </span>
          )}
          {showExtensionBadge && file.file_type !== "video" && file.file_type !== "audio" && file.filename.includes(".") && (
            <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
              {file.filename.split(".").pop()}
            </span>
          )}
          {onFavoriteToggle && (
            <div className={`absolute top-2 right-2 ${file.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
              <FavoriteButton
                fileId={file.id}
                isFavorite={file.is_favorite}
                onToggle={onFavoriteToggle}
              />
            </div>
          )}
          {watchProgress && watchProgress.duration > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min((watchProgress.position / watchProgress.duration) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-text-primary">
            {file.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted">
            <span className="tabular-nums">{formatFileSize(file.file_size)}</span>
            <span className="opacity-40">·</span>
            <span className="tabular-nums">{formatRelativeDate(file.created_at)}</span>
            {file.tags.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <TagList tags={file.tags} maxVisible={2} />
              </>
            )}
          </div>
          {matchOverlay && (
            <div
              className="mt-2 border-t border-bg-border pt-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              {matchOverlay}
            </div>
          )}
        </div>
      </Wrapper>
    </div>
  );
}

/**
 * Memoized. Every prop must therefore be either a per-file primitive or
 * a referentially stable callback — a predicate like
 * `isSelected: (id) => boolean` or a `string[]` of dragged ids defeats
 * this entirely, because its identity changes whenever the selection or
 * drag state changes and so every card's props change with it.
 * Measured 2026-08-21: re-rendering 995 unmemoized cards blocked the
 * main thread for ~142 ms (spec `2026-08-21-file-list-deep-scroll-cost`
 * §5.4, hako `v3BsEd0wEZeBvImaMUOj2`).
 */
export const FileCard = memo(FileCardImpl);
