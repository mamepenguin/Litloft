import { useRelativeDate } from "@/hooks/useRelativeDate";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FileItem, WatchProgress } from "@/types";
import { formatDuration, formatFileSize } from "@/lib/format";
import { getThumbnailUrl } from "@/lib/api";
import { useFileNavigationOverride } from "@/lib/fileNavigationOverride";
import { useClipboard } from "./ClipboardProvider";
import { FavoriteButton } from "./FavoriteButton";
import { TagList } from "./TagList";
import { FileTypeIcon } from "./FileTypeIcon";
import { VideoPreview } from "./VideoPreview";
import { TextThumbnail } from "./TextThumbnail";

export function FileCard({
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
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  watchProgress,
  matchOverlay,
}: {
  file: FileItem;
  onFavoriteToggle?: (file: FileItem) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
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
  // Optional override set by hosts that want to absorb the click into
  // a local ``?file=`` selection rather than letting the canonical
  // ``/files/{id}`` redirect take over (currently: ``CollectionDetail``
  // — see ``lib/fileNavigationOverride.tsx``). ``null`` when no provider
  // is mounted, in which case the default ``<Link>`` flow is preserved.
  const fileNavigationOverride = useFileNavigationOverride();
  const isCutFile = clipboard.isCut(file.id);
  const hasThumbnail = file.has_thumbnail || file.file_type === "video" || file.file_type === "image";
  const isTextPreviewable = !hasThumbnail && file.file_type === "document" && (
    (file.mime_type?.startsWith('text/') ?? false) ||
    file.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mime_type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );

  // ``selectable`` (multi-select mode) wins over the navigation
  // override because the user's intent is selection, not opening.
  // Cmd/Ctrl-click still escapes to ``onMetaSelect`` so power users
  // can multi-select from override hosts.
  const useOverride = !selectable && fileNavigationOverride !== null;
  const Wrapper = selectable || useOverride ? "div" : Link;
  const wrapperProps = selectable
    ? {
        onClick: (e: React.MouseEvent) => {
          if (e.shiftKey && onShiftSelect) {
            e.preventDefault();
            onShiftSelect(file.id);
          } else {
            onSelect?.(file.id);
          }
        },
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(file.id); }
        },
      }
    : useOverride
      ? {
          onClick: (e: React.MouseEvent) => {
            if ((e.metaKey || e.ctrlKey) && onMetaSelect) {
              e.preventDefault();
              onMetaSelect(file.id);
              return;
            }
            e.preventDefault();
            fileNavigationOverride!(file.id);
          },
          role: "button" as const,
          tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileNavigationOverride!(file.id);
            }
          },
          // ``cursor-pointer`` so the override host looks clickable
          // even though the underlying element is a ``<div>`` rather
          // than a ``<Link>``.
          className: "cursor-pointer",
        }
      : {
          href: `/files/${file.id}${sortQuery || ""}`,
          onClick: (e: React.MouseEvent) => {
            if ((e.metaKey || e.ctrlKey) && onMetaSelect) {
              e.preventDefault();
              onMetaSelect(file.id);
            }
          },
        };

  return (
    <div
      className={`relative${isDragging ? " opacity-40" : ""}${isCutFile ? " opacity-50" : ""}${draggable ? " select-none" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
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
        onContextMenu={selectable ? undefined : onContextMenu}
        onTouchStart={selectable ? undefined : onTouchStart}
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
          {file.file_type !== "video" && file.file_type !== "audio" && file.filename.includes(".") && (
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
            <span className="tabular-nums">{formatRelativeDate(file.updated_at)}</span>
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
