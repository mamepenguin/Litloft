"use client";

import { memo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useRelativeDate } from "@/hooks/useRelativeDate";
import { getThumbnailUrl } from "@/lib/api";
import { useFileNavigationOverride } from "@/lib/fileNavigationOverride";
import { useFileCardLink } from "@/hooks/useFileCardLink";
import { formatDuration } from "@/lib/format";
import { hasKnownLength, primaryMetaText } from "@/lib/primaryMeta";
import type { FileItem, FileItemWithMatch } from "@/types";
import { OFFICE_MIMES } from "@/lib/officeFiles";

import { MoreVertical } from "lucide-react";

import { useClipboard } from "./ClipboardProvider";
import { FavoriteButton } from "./FavoriteButton";
import { FileTypeIcon } from "./FileTypeIcon";
import { MatchOverlay } from "./MatchOverlay";
import {
  ROW_FURNITURE_GROUP,
  ROW_FURNITURE_PADDING,
  ROW_OVERFLOW_BUTTON,
} from "./rowFurniture";
import { TagList } from "./TagList";
import { TextThumbnail } from "./TextThumbnail";

interface FileListRowProps {
  file: FileItemWithMatch;
  /**
   * Only the collection view passes it: elsewhere the order is a sort the
   * reader chose and can change, so a number beside each row would name a
   * position that means nothing.
   */
  ordinal?: number;
  selectable?: boolean;
  /**
   * Resolved boolean rather than an `(id) => boolean` predicate or membership
   * in a `string[]`, so `memo` below is not defeated by props whose identity
   * changes on every selection or drag.
   */
  selected?: boolean;
  isDragging?: boolean;
  draggable?: boolean;
  sortQuery?: string;
  showTypeLabel?: boolean;
  showExtensionBadge?: boolean;
  onFavoriteToggle?: (file: FileItem) => void;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  onDragStart?: (e: React.DragEvent, file: FileItem) => void;
  onDragEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent, file: FileItem) => void;
}

function FileListRowImpl({
  file,
  ordinal,
  selectable,
  selected,
  isDragging,
  draggable,
  sortQuery,
  showTypeLabel = true,
  showExtensionBadge = true,
  onFavoriteToggle,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: FileListRowProps) {
  const formatRelativeDate = useRelativeDate();
  const t = useTranslations("file");
  const clipboard = useClipboard();
  const fileNavigationOverride = useFileNavigationOverride();
  const { Wrapper: OpenWrapper, wrapperProps: openProps } = useFileCardLink({
    file,
    onMetaSelect,
    sortQuery,
  });

  const hasThumbnail =
    file.has_thumbnail || file.file_type === "video" || file.file_type === "image";
  const isTextPreviewable =
    !hasThumbnail &&
    file.file_type === "document" &&
    ((file.mime_type?.startsWith("text/") ?? false) ||
      OFFICE_MIMES.has(file.mime_type ?? ""));
  const hasDuration = hasKnownLength(file);
  const isCutFile = clipboard.isCut(file.id);
  const primaryText = primaryMetaText(file);

  // The row gives up its trailing padding to the group's own, so a row that
  // draws no group has to keep the padding.
  const hasRowFurniture =
    Boolean(onFavoriteToggle) || (!selectable && Boolean(onContextMenu));

  const fileTypeLabel: Record<string, string> = {
    video: t("typeVideo"),
    image: t("typeImage"),
    audio: t("typeAudio"),
    document: t("typeDocument"),
    archive: t("typeArchive"),
    other: t("typeOther"),
  };

  const content = (
    <>
      {ordinal !== undefined && (
        // `aria-hidden`: the row's accessible name is its title, and a
        // reader announced as "1, Track 1" is being read a column that
        // says what the reading order already says.
        <span
          aria-hidden
          className="w-6 flex-shrink-0 text-right text-xs tabular-nums text-text-muted"
        >
          {ordinal}
        </span>
      )}
      <div
        className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-bg-elevated sm:h-14 sm:w-24"
      >
        {hasThumbnail ? (
          <img
            src={getThumbnailUrl(file.id)}
            alt={file.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : isTextPreviewable ? (
          <TextThumbnail file={file} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileTypeIcon fileType={file.file_type} size={22} className="text-text-muted" />
          </div>
        )}
        {hasDuration && (
          <span className="absolute bottom-0.5 right-0.5 rounded-lg bg-black/70 px-1 py-0.5 text-[10px] text-white">
            {formatDuration(file.duration)}
          </span>
        )}
      </div>
      {/* The cap is on the row's contents, not on the row. Capping the
          row would shrink the hover band and the click target with it. */}
      <div className="min-w-0 max-w-list-row flex-1">
        <div className="flex items-center gap-2">
          {/* Not a heading: thirty sibling names in a listing are not
              thirty sections. */}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
            {file.title}
          </span>
          {primaryText !== null && (
            <span className="hidden flex-shrink-0 text-xs tabular-nums text-text-muted sm:inline">
              {primaryText}
            </span>
          )}
          <span className="hidden flex-shrink-0 text-xs tabular-nums text-text-muted sm:inline">
            {formatRelativeDate(file.updated_at)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted">
          {showTypeLabel && (
            <span className="flex-shrink-0">{fileTypeLabel[file.file_type] ?? file.file_type}</span>
          )}
          {showExtensionBadge && file.file_type !== "video" && file.file_type !== "audio" && file.filename.includes(".") && (
            <span className="flex-shrink-0 rounded-lg bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase text-text-muted">
              {file.filename.split(".").pop()}
            </span>
          )}
          {primaryText !== null && (
            <>
              <span className="flex-shrink-0 sm:hidden">{primaryText}</span>
              <span className="flex-shrink-0 opacity-40 sm:hidden">·</span>
            </>
          )}
          <span className="flex-shrink-0 sm:hidden">{formatRelativeDate(file.updated_at)}</span>
          {file.tags.length > 0 && (
            <>
              <span className="hidden flex-shrink-0 opacity-40 sm:inline">·</span>
              <TagList tags={file.tags} maxVisible={3} />
            </>
          )}
        </div>
        {file.match_meta && (
          <div
            className="mt-1.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <MatchOverlay match={file.match_meta} fileId={file.id} file={file} />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`group flex items-center gap-3 bg-bg-card p-2.5 sm:p-2${hasRowFurniture ? ` ${ROW_FURNITURE_PADDING}` : ""} border-b border-bg-border last:border-b-0 transition-colors hover:bg-bg-elevated${
        draggable ? " select-none" : selectable ? " cursor-pointer select-none" : ""
      } ${selected ? "ring-2 ring-accent ring-inset" : ""}${
        isDragging ? " opacity-40" : ""
      }${isCutFile ? " opacity-50" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, file) : undefined}
      onDragEnd={onDragEnd}
      // onClick intentionally omitted from the drag-surface div;
      // in selectable mode it lives on the inner click-area wrapper
      // so the browser can distinguish drag from click.
      onContextMenu={selectable || !onContextMenu ? undefined : (e) => onContextMenu(e, file)}
    >
      {selectable ? (
        // Click-area: owns onClick + checkbox so the draggable
        // outer div can remain a pure drag surface.
        <div
          className="flex flex-1 cursor-pointer items-center gap-3 min-w-0"
          onClick={(e: React.MouseEvent) => {
            if (e.shiftKey && onShiftSelect) {
              e.preventDefault();
              onShiftSelect(file.id);
            } else {
              onSelect?.(file.id);
            }
          }}
        >
          <div
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-colors pointer-events-none ${
              selected ? "border-accent bg-accent text-white" : "border-text-muted/50"
            }`}
            aria-hidden
          >
            {selected && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div className="flex flex-1 items-center gap-3 min-w-0">{content}</div>
        </div>
      ) : (
        <OpenWrapper
          {...(openProps as Record<string, unknown>)}
          className={`flex flex-1 items-center gap-3 min-w-0${
            fileNavigationOverride ? " cursor-pointer" : ""
          }`}
        >{content}</OpenWrapper>
      )}
      {hasRowFurniture && (
        <div className={ROW_FURNITURE_GROUP}>
          {onFavoriteToggle && (
            <FavoriteButton
              fileId={file.id}
              isFavorite={file.is_favorite}
              onToggle={onFavoriteToggle}
              entityName={file.title}
              rowAction
            />
          )}
          {/* The button holds its place with `opacity-0` rather than
              appearing on hover, so the row does not reflow under the
              pointer. */}
          {!selectable && onContextMenu && (
            <button
              type="button"
              aria-label={t("actionsFor", { name: file.title })}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Enter and Space on a button produce a click with no
                // pointer, so `clientX/clientY` are 0 and the menu opens
                // clamped to the top-left of the window.
                if (e.clientX === 0 && e.clientY === 0) {
                  const box = e.currentTarget.getBoundingClientRect();
                  onContextMenu(
                    {
                      ...e,
                      preventDefault: () => {},
                      stopPropagation: () => {},
                      clientX: box.left,
                      clientY: box.bottom,
                    } as unknown as React.MouseEvent,
                    file,
                  );
                  return;
                }
                onContextMenu(e, file);
              }}
              className={ROW_OVERFLOW_BUTTON}
            >
              <MoreVertical size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const FileListRow = memo(FileListRowImpl);
