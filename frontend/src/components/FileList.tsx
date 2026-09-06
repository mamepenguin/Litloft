"use client";

import { useCallback, useMemo, useState } from "react";

import { deriveListMeta } from "@/lib/listMeta";
import type { FileItem, FileItemWithMatch } from "@/types";
import { FileListRow } from "./FileListRow";
import { FileContextMenu } from "./FileContextMenu";

export function FileList({
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
  showOrdinals,
}: {
  files: FileItemWithMatch[];
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
  selectable?: boolean;
  /** A set, not a predicate — see `FileListRow`'s prop-shape note. */
  selectedIds?: ReadonlySet<string>;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
  draggable?: boolean;
  draggedIds?: ReadonlySet<string>;
  onDragStart?: (e: React.DragEvent, fileId: string) => void;
  onDragEnd?: () => void;
  /**
   * Number the rows, 1-based, in the order they are given.
   *
   * Only the collection view asks for this. Everywhere else the order is
   * a sort the reader picked and can change, so a number beside each row
   * would name a position that means nothing — a collection's order is
   * the thing itself.
   */
  showOrdinals?: boolean;
}) {
  const [menuPos, setMenuPos] = useState<{ open: boolean; x: number; y: number }>({
    open: false, x: 0, y: 0,
  });
  const [target, setTarget] = useState<FileItem | null>(null);

  // Decided once for the listing rather than per row: the question is
  // about the column, not the file. Only booleans cross into the row,
  // so the memo there still holds.
  const { showTypeLabel, showExtensionBadge } = useMemo(
    () => deriveListMeta(files),
    [files],
  );

  const closeMenu = useCallback(() => {
    setMenuPos({ open: false, x: 0, y: 0 });
  }, []);

  // Stable identities so the memoized rows keep their props between
  // renders. Each row hands its own `file` back.
  const handleContextMenu = useCallback((e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setTarget(file);
    setMenuPos({ open: true, x: e.clientX, y: e.clientY });
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, file: FileItem) => {
      onDragStart?.(e, file.id);
    },
    [onDragStart],
  );

  return (
    <>
      <div className="flex flex-col">
        {files.map((file, index) => (
          <FileListRow
            key={file.id}
            file={file}
            // The array index, not `position`. Reordering rewrites the
            // stored positions densely, but **removing** an item does
            // not — `remove_collection_item` deletes the row and `add`
            // takes `max_position + 1` — and the optimistic local swap
            // in `CollectionDetail` moves an item without touching its
            // `position` at all. Either way a column of stored positions
            // reads 1, 2, 4, which is a database detail.
            // `CollectionItemsPane` derives its numbers the same way.
            ordinal={showOrdinals ? index + 1 : undefined}
            selectable={selectable}
            selected={selectedIds?.has(file.id)}
            isDragging={draggedIds?.has(file.id)}
            draggable={draggable}
            sortQuery={sortQuery}
            showTypeLabel={showTypeLabel}
            showExtensionBadge={showExtensionBadge}
            onFavoriteToggle={onFavoriteToggle}
            onSelect={onSelect}
            onMetaSelect={onMetaSelect}
            onShiftSelect={onShiftSelect}
            onDragStart={onDragStart ? handleDragStart : undefined}
            onDragEnd={onDragEnd}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      <FileContextMenu
        open={menuPos.open}
        position={{ x: menuPos.x, y: menuPos.y }}
        target={target}
        onClose={closeMenu}
        onUpdate={onRefresh}
      />
    </>
  );
}
