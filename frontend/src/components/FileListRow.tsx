"use client";

import { memo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useRelativeDate } from "@/hooks/useRelativeDate";
import { getThumbnailUrl } from "@/lib/api";
import { useFileNavigationOverride } from "@/lib/fileNavigationOverride";
import { formatDuration, formatFileSize } from "@/lib/format";
import type { FileItem, FileItemWithMatch } from "@/types";
import { OFFICE_MIMES } from "@/lib/officeFiles";

import { MoreVertical } from "lucide-react";

import { useClipboard } from "./ClipboardProvider";
import { FavoriteButton } from "./FavoriteButton";
import { FileTypeIcon } from "./FileTypeIcon";
import { MatchOverlay } from "./MatchOverlay";
import { TagList } from "./TagList";
import { TextThumbnail } from "./TextThumbnail";

interface FileListRowProps {
  file: FileItemWithMatch;
  /**
   * The row's position in the listing, 1-based, drawn ahead of the
   * thumbnail. Only the collection view passes it: elsewhere the order
   * is a sort the reader chose and can change, so a number beside each
   * row would name a position that means nothing.
   *
   * A per-row primitive, like `selected` and `isDragging` — see the
   * prop-shape note below.
   */
  ordinal?: number;
  selectable?: boolean;
  /**
   * Resolved boolean rather than an `(id) => boolean` predicate, and a
   * boolean rather than membership in a `string[]` for `isDragging` —
   * both so `memo` below is not defeated by props whose identity
   * changes on every selection or drag (spec
   * `2026-08-21-file-list-deep-scroll-cost` §6.3).
   */
  selected?: boolean;
  isDragging?: boolean;
  draggable?: boolean;
  sortQuery?: string;
  /**
   * Whether this listing's type / extension columns say anything. Both
   * are resolved once by the list and passed down as plain booleans —
   * see `lib/listMeta.ts` for the rule, and the memo note below for why
   * they arrive as primitives rather than as the derived object.
   */
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

  const hasThumbnail =
    file.has_thumbnail || file.file_type === "video" || file.file_type === "image";
  const isTextPreviewable =
    !hasThumbnail &&
    file.file_type === "document" &&
    ((file.mime_type?.startsWith("text/") ?? false) ||
      OFFICE_MIMES.has(file.mime_type ?? ""));
  const hasDuration =
    (file.file_type === "video" || file.file_type === "audio") && file.duration != null;
  const isCutFile = clipboard.isCut(file.id);

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
        <span className="w-6 flex-shrink-0 text-right text-xs tabular-nums text-text-muted">
          {String(ordinal).padStart(2, "0")}
        </span>
      )}
      <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-bg-elevated sm:h-14 sm:w-24">
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
          row would shrink the hover band and the click target with it,
          leaving a lit strip floating in the middle of a wide window.
          DESIGN.md §3.6. */}
      <div className="min-w-0 max-w-list-row flex-1">
        <div className="flex items-center gap-2">
          {/* Not a heading, for the reason the cards are not (D-5):
              thirty sibling names in a listing are not thirty
              sections, and list mode is one click from grid mode in
              the same folder. The name is the row's link's. */}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
            {file.title}
          </span>
          <span className="hidden flex-shrink-0 text-xs tabular-nums text-text-muted sm:inline">
            {formatFileSize(file.file_size)}
          </span>
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
          <span className="flex-shrink-0 sm:hidden">{formatFileSize(file.file_size)}</span>
          <span className="flex-shrink-0 opacity-40 sm:hidden">·</span>
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
      className={`group flex items-center gap-3 bg-bg-card p-2.5 sm:p-2 border-b border-bg-border last:border-b-0 transition-colors hover:bg-bg-elevated${
        draggable ? " select-none" : selectable ? " cursor-pointer select-none" : ""
      } ${selected ? "ring-2 ring-accent ring-inset" : ""}${
        isDragging ? " opacity-40" : ""
      }${isCutFile ? " opacity-50" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, file) : undefined}
      onDragEnd={onDragEnd}
      // onClick intentionally omitted from the drag-surface div;
      // in selectable mode it lives on the inner click-area wrapper
      // so the browser can distinguish drag from click (same-element
      // conflict confuses drag-intent detection per FolderTreeRow comment).
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
      ) : fileNavigationOverride ? (
        // Override host (currently CollectionDetail) absorbs the
        // click into a local ?file= selection so the user stays
        // on the current page instead of being redirected to
        // the file's containing folder.
        <div
          role="button"
          tabIndex={0}
          className="flex flex-1 cursor-pointer items-center gap-3 min-w-0"
          onClick={(e: React.MouseEvent) => {
            if ((e.metaKey || e.ctrlKey) && onMetaSelect) {
              e.preventDefault();
              onMetaSelect(file.id);
              return;
            }
            e.preventDefault();
            fileNavigationOverride(file.id);
          }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileNavigationOverride(file.id);
            }
          }}
        >{content}</div>
      ) : (
        <Link
          href={`/files/${file.id}${sortQuery || ""}`}
          className="flex flex-1 items-center gap-3 min-w-0"
          onClick={(e: React.MouseEvent) => {
            if ((e.metaKey || e.ctrlKey) && onMetaSelect) {
              e.preventDefault();
              onMetaSelect(file.id);
            }
          }}
        >{content}</Link>
      )}
      {onFavoriteToggle && (
        <FavoriteButton
          fileId={file.id}
          isFavorite={file.is_favorite}
          onToggle={onFavoriteToggle}
          entityName={file.title}
        />
      )}
      {/* Rename, move, copy and trash were reachable only by
          right-click, so a keyboard could not get to them at all. The
          button holds its place with `opacity-0` rather than appearing
          on hover, so the row does not reflow under the pointer; it
          shows on focus for the keyboard and stays put on touch, where
          there is no hover to reveal it.
          Sized past its 16px glyph to a 24px target (hako
          `Prwd_iaXmCjWfY24KjFz2`), and 44px where the pointer is a
          finger (`00-basis.md`, mobile sizing). */}
      {!selectable && onContextMenu && (
        <button
          type="button"
          aria-label={t("actionsFor", { name: file.title })}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Enter and Space on a button produce a click with no
            // pointer, so `clientX/clientY` are 0 and the menu opens
            // clamped to the top-left of the window — forty rows away
            // from the row it belongs to. Anchor it to the button
            // instead, which is where a pointer click would have put it
            // anyway.
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
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-text-muted opacity-0 transition-opacity hover:bg-bg-elevated hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100"
        >
          <MoreVertical size={16} />
        </button>
      )}
    </div>
  );
}

/** See the prop-shape note above — every prop here is per-file or stable. */
export const FileListRow = memo(FileListRowImpl);
