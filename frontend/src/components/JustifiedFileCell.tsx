"use client";

import { memo } from "react";
import type { FileItem } from "@/types";
import { getThumbnailUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { hasKnownLength } from "@/lib/primaryMeta";
import { OFFICE_MIMES } from "@/lib/officeFiles";
import { justifiedRatio } from "@/lib/justifiedGrid";
import { useFileCardLink } from "@/hooks/useFileCardLink";
import { useClipboard } from "./ClipboardProvider";
import { FavoriteButton } from "./FavoriteButton";
import { FileTypeIcon } from "./FileTypeIcon";
import { TextThumbnail } from "./TextThumbnail";

function JustifiedFileCellImpl({
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
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent, file: FileItem) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}) {
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
  const ratio = justifiedRatio(file);
  const hasThumbnail =
    file.has_thumbnail ||
    file.file_type === "video" ||
    file.file_type === "image";
  const isTextPreviewable =
    !hasThumbnail &&
    file.file_type === "document" &&
    ((file.mime_type?.startsWith("text/") ?? false) ||
      OFFICE_MIMES.has(file.mime_type ?? ""));

  return (
    <div
      className={`justified-grid-cell relative${isDragging ? " opacity-40" : ""}${isCutFile ? " opacity-50" : ""}${draggable ? " select-none" : ""}`}
      style={{ "--jg-ratio": ratio } as React.CSSProperties}
      data-flip-key={file.id}
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, file) : undefined}
      onDragEnd={onDragEnd}
    >
      {selectable && (
        <div className="absolute top-2 left-2 z-10">
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
        {...(wrapperProps as any)}
        aria-label={file.title}
        data-file-thumb=""
        className={`group relative block h-full w-full overflow-hidden rounded-xl bg-bg-elevated ${
          selectable ? "cursor-pointer select-none" : ""
        } ${selected ? "ring-2 ring-accent" : ""}`}
        onContextMenu={selectable || !onContextMenu ? undefined : (e: React.MouseEvent) => onContextMenu(e, file)}
        onTouchStart={selectable || !onTouchStart ? undefined : (e: React.TouchEvent) => onTouchStart(e, file)}
        onTouchEnd={selectable ? undefined : onTouchEnd}
        onTouchMove={selectable ? undefined : onTouchMove}
      >
        {hasThumbnail ? (
          <img
            src={getThumbnailUrl(file.id)}
            // Empty on purpose. The cell is named by `aria-label` on the
            // link itself — a filled `alt` would say it a second time.
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            draggable="false"
          />
        ) : isTextPreviewable ? (
          <TextThumbnail file={file} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileTypeIcon
              fileType={file.file_type}
              size={32}
              className="text-text-muted"
            />
          </div>
        )}
        {/* No `VideoPreview` here, deliberately — `.justified-grid-host`
            is a `container-type` context, and a containment context
            around a `<video>` renders its whole subtree rotated and
            spinning on iOS Safari. */}
        {hasKnownLength(file) && (
          <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
            {formatDuration(file.duration)}
          </span>
        )}
        <span className="justified-grid-name">{file.title}</span>
        {onFavoriteToggle && (
          <div
            className={`absolute top-2 right-2 ${file.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"} transition-opacity`}
          >
            <FavoriteButton
              fileId={file.id}
              isFavorite={file.is_favorite}
              onToggle={onFavoriteToggle}
              entityName={file.title}
            />
          </div>
        )}
      </Wrapper>
    </div>
  );
}

export const JustifiedFileCell = memo(JustifiedFileCellImpl);
