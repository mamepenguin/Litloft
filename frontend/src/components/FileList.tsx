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
        {files.map((file) => (
          <FileListRow
            key={file.id}
            file={file}
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
