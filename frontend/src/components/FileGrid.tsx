"use client";

import { useState } from "react";
import type { FileItem, FileItemWithMatch } from "@/types";
import { useContextMenu } from "@/hooks/useContextMenu";
import { FileCard } from "./FileCard";
import { FileContextMenu } from "./FileContextMenu";
import { MatchOverlay } from "./MatchOverlay";

export function FileGrid({
  files,
  onFavoriteToggle,
  onRefresh,
  selectable,
  isSelected,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  sortQuery,
  draggable,
  draggedFileIds,
  onDragStart,
  onDragEnd,
}: {
  files: FileItemWithMatch[];
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
  draggable?: boolean;
  draggedFileIds?: string[];
  onDragStart?: (e: React.DragEvent, fileId: string) => void;
  onDragEnd?: () => void;
}) {
  const { menuState, close, handlers } = useContextMenu();
  const [target, setTarget] = useState<FileItem | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            onFavoriteToggle={onFavoriteToggle}
            onContextMenu={(e) => {
              setTarget(file);
              handlers.onContextMenu(e);
            }}
            onTouchStart={(e) => {
              setTarget(file);
              handlers.onTouchStart(e);
            }}
            onTouchEnd={handlers.onTouchEnd}
            onTouchMove={handlers.onTouchMove}
            selectable={selectable}
            selected={isSelected?.(file.id)}
            onSelect={onSelect}
            onMetaSelect={onMetaSelect}
            onShiftSelect={onShiftSelect}
            sortQuery={sortQuery}
            draggable={draggable}
            isDragging={draggedFileIds?.includes(file.id)}
            onDragStart={onDragStart ? (e) => onDragStart(e, file.id) : undefined}
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
