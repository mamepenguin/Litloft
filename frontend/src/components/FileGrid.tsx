"use client";

import { useCallback, useMemo, useState } from "react";
import type { FileItem, FileItemWithMatch } from "@/types";
import { useContextMenu } from "@/hooks/useContextMenu";
import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";
import { deriveListMeta } from "@/lib/listMeta";
import { FileCard } from "./FileCard";
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
  const { showExtensionBadge } = useMemo(() => deriveListMeta(files), [files]);

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

  return (
    <>
      <div
        ref={gridRef}
        className="grid gap-x-4 gap-y-6"
        style={{ gridTemplateColumns: cardGridTemplate(columns) }}
      >
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            onFavoriteToggle={onFavoriteToggle}
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchEnd={handlers.onTouchEnd}
            onTouchMove={handlers.onTouchMove}
            selectable={selectable}
            selected={selectedIds?.has(file.id)}
            onSelect={onSelect}
            onMetaSelect={onMetaSelect}
            onShiftSelect={onShiftSelect}
            sortQuery={sortQuery}
            showExtensionBadge={showExtensionBadge}
            draggable={draggable}
            isDragging={draggedIds?.has(file.id)}
            onDragStart={onDragStart ? handleDragStart : undefined}
            onDragEnd={onDragEnd}
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
