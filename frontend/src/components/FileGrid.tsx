"use client";

import { useCallback, useMemo, useState } from "react";
import type { FileItem, FileItemWithMatch } from "@/types";
import { useContextMenu } from "@/hooks/useContextMenu";
import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";
import { deriveListMeta } from "@/lib/listMeta";
import { FileCard } from "./FileCard";
import { JustifiedFileCell } from "./JustifiedFileCell";
import { FileContextMenu } from "./FileContextMenu";
import { MatchOverlay } from "./MatchOverlay";

export function FileGrid({
  files,
  onFavoriteToggle,
  onRefresh,
  selectable,
  selectedIds,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  sortQuery,
  draggable,
  draggedIds,
  onDragStart,
  onDragEnd,
}: {
  files: FileItemWithMatch[];
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
  selectable?: boolean;
  /**
   * Selection is passed as a set, not as an `(id) => boolean`
   * predicate: the predicate's identity changes on every selection
   * change, which would make `FileCard`'s `memo` a no-op. Resolving it
   * to a per-card boolean here keeps the memo effective.
   */
  selectedIds?: ReadonlySet<string>;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
  draggable?: boolean;
  /** Same reasoning as `selectedIds` — a `string[]` would defeat memo. */
  draggedIds?: ReadonlySet<string>;
  onDragStart?: (e: React.DragEvent, fileId: string) => void;
  onDragEnd?: () => void;
}) {
  const { menuState, close, handlers } = useContextMenu();
  const [target, setTarget] = useState<FileItem | null>(null);
  const { ref: gridRef, columns } = useCardColumns();

  // Decided once for the listing rather than per card: the question is
  // about the column, not the file. Only the boolean crosses into the
  // card, so the memo there still holds.
  const { showExtensionBadge, justifyThumbnails } = useMemo(
    () => deriveListMeta(files),
    [files],
  );

  // Stable across renders so memoized cards don't see new props every
  // time the parent re-renders. The card hands its own `file` back.
  const { onContextMenu: openMenu, onTouchStart: startLongPress } = handlers;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: FileItem) => {
      setTarget(file);
      openMenu(e);
    },
    [openMenu],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, file: FileItem) => {
      setTarget(file);
      startLongPress(e);
    },
    [startLongPress],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, file: FileItem) => {
      onDragStart?.(e, file.id);
    },
    [onDragStart],
  );

  const cardProps = (file: FileItemWithMatch) => ({
    file,
    onFavoriteToggle,
    onContextMenu: handleContextMenu,
    onTouchStart: handleTouchStart,
    onTouchEnd: handlers.onTouchEnd,
    onTouchMove: handlers.onTouchMove,
    selectable,
    selected: selectedIds?.has(file.id),
    onSelect,
    onMetaSelect,
    onShiftSelect,
    sortQuery,
    draggable,
    isDragging: draggedIds?.has(file.id),
    onDragStart: onDragStart ? handleDragStart : undefined,
    onDragEnd,
  });

  // A search result set is not packed even when it is all photographs:
  // the match overlay is a per-row column that is saying something, and
  // a justified cell has nowhere to put it.
  const hasMatchMeta = files.some((file) => file.match_meta);

  // Same rows, packed at their own proportions rather than into equal
  // cards. Which one a folder gets is derived from the folder, not
  // chosen by the reader — `lib/listMeta.ts`.
  if (justifyThumbnails && !hasMatchMeta) {
    return (
      <>
        <div className="justified-grid-host">
          <div className="justified-grid">
            {files.map((file) => (
              <JustifiedFileCell key={file.id} {...cardProps(file)} />
            ))}
            {/* Absorbs the last line's slack. See globals.css. */}
            <div className="justified-grid-tail" aria-hidden />
          </div>
        </div>

        <FileContextMenu
          open={menuState.open}
          position={menuState.position}
          target={target}
          onClose={close}
          onUpdate={onRefresh}
        />
      </>
    );
  }

  return (
    <>
      <div
        ref={gridRef}
        className="grid gap-x-3 gap-y-6"
        style={{ gridTemplateColumns: cardGridTemplate(columns) }}
      >
        {files.map((file) => (
          <FileCard
            key={file.id}
            {...cardProps(file)}
            showExtensionBadge={showExtensionBadge}
            matchOverlay={
              file.match_meta ? (
                <MatchOverlay match={file.match_meta} fileId={file.id} file={file} />
              ) : undefined
            }
          />
        ))}
      </div>

      <FileContextMenu
        open={menuState.open}
        position={menuState.position}
        target={target}
        onClose={close}
        onUpdate={onRefresh}
      />
    </>
  );
}
