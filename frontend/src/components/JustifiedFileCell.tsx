"use client";

import { memo } from "react";
import type { FileItem } from "@/types";
import { getThumbnailUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { OFFICE_MIMES } from "@/lib/officeFiles";
import { justifiedRatio } from "@/lib/justifiedGrid";
import { useFileCardLink } from "@/hooks/useFileCardLink";
import { useClipboard } from "./ClipboardProvider";
import { FavoriteButton } from "./FavoriteButton";
import { FileTypeIcon } from "./FileTypeIcon";
import { TextThumbnail } from "./TextThumbnail";
import { VideoPreview } from "./VideoPreview";

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
  // The same three-way answer `FileCard` gives. A justified listing is
  // at least 90% measurable images by construction, but the other 10%
  // is real: a `notes.txt` and a `receipt.pdf` in a photo folder both
  // have no thumbnail, and drawing the shared placeholder for each made
  // them the same picture.
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
      // The ratio is per file, so it cannot live in a stylesheet. The
      // row geometry that reads it is `.justified-grid` in globals.css.
      style={{ "--jg-ratio": ratio } as React.CSSProperties}
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
            // Empty: the name is already in the caption band below,
            // inside this same link, so a filled `alt` makes the
            // accessible name say it twice.
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
        {file.file_type === "video" && <VideoPreview fileId={file.id} />}
        {(file.file_type === "video" || file.file_type === "audio") &&
          file.duration != null && (
            <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
              {formatDuration(file.duration)}
            </span>
          )}
        {/*
          The name is the only meta a justified cell carries, and it is
          hidden until asked for: the cells are unequal widths, so a
          caption band under each one would not line up into a column
          the way the card grid's meta row does. `pointer: coarse` has
          no hover to ask with, so there it stays visible — see the
          `.justified-grid-name` rule in globals.css.
        */}
        <span className="justified-grid-name">{file.title}</span>
        {onFavoriteToggle && (
          <div
            className={`absolute top-2 right-2 ${file.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"} transition-opacity`}
          >
            <FavoriteButton
              fileId={file.id}
              isFavorite={file.is_favorite}
              onToggle={onFavoriteToggle}
            />
          </div>
        )}
      </Wrapper>
    </div>
  );
}

/**
 * One cell of a justified thumbnail row — the image at its real
 * proportions, and nothing else. See `DESIGN.md` §8.5 "Justified
 * thumbnail rows".
 *
 * Memoized on the same terms as `FileCard`: every prop is a per-file
 * primitive or a referentially stable callback, because a folder that
 * reaches this component is a folder with hundreds of rows in it.
 */
export const JustifiedFileCell = memo(JustifiedFileCellImpl);
