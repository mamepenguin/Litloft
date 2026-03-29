"use client";

import type { RefObject } from "react";

import type { DragState } from "@/hooks/useDragAndDrop";
import type { FileItem, Folder, ViewMode } from "@/types";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { EmptyState } from "@/components/EmptyState";
import { FolderCard } from "@/components/FolderCard";

interface FolderContentProps {
  files: FileItem[];
  folders: Folder[];
  driveName: string;
  viewMode: ViewMode;
  loading: boolean;
  loadingMore: boolean;
  isRecent: boolean;
  isFavorites: boolean;
  isRecentAdded: boolean;
  selectable: boolean;
  sortQuery: string;
  pinnedPaths: Set<string>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  dragState: DragState;
  isDropTarget: (path: string) => boolean;
  getDropTargetProps: (path: string) => Record<string, (e: React.DragEvent) => void>;
  isSelected: (id: string) => boolean;
  onSelect: (id: string) => void;
  onMetaSelect: (id: string) => void;
  onShiftSelect: (id: string) => void;
  onTogglePin: (path: string) => Promise<void>;
  onFavoriteToggle: (updated: FileItem) => void;
  onRefresh: () => void;
  onDragStart: (e: React.DragEvent, fileId: string) => void;
  onDragEnd: () => void;
  selectedCount: number;
}

export function FolderContent({
  files, folders, driveName, viewMode, loading, loadingMore,
  isRecent, isFavorites, isRecentAdded, selectable, sortQuery,
  pinnedPaths, sentinelRef, dragState, isDropTarget, getDropTargetProps,
  isSelected, onSelect, onMetaSelect, onShiftSelect, onTogglePin, onFavoriteToggle, onRefresh,
  onDragStart, onDragEnd, selectedCount,
}: FolderContentProps) {
  return (
    <>
      {folders.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((folder) => (
            <FolderCard
              key={folder.path}
              folder={folder}
              driveName={driveName}
              isPinned={pinnedPaths.has(folder.path)}
              onTogglePin={() => onTogglePin(folder.path)}
              onUpdate={onRefresh}
              isDropTarget={dragState.isDragging && isDropTarget(folder.path)}
              dropTargetProps={dragState.isDragging ? getDropTargetProps(folder.path) : undefined}
            />
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : files.length === 0 && folders.length === 0 ? (
        isFavorites ? (
          <EmptyState variant="no-favorites" />
        ) : isRecent ? (
          <EmptyState variant="no-recent" />
        ) : isRecentAdded ? (
          <EmptyState variant="no-recent-added" />
        ) : (
          <EmptyState variant="no-files" />
        )
      ) : viewMode === "grid" ? (
        <FileGrid
          files={files}
          onFavoriteToggle={onFavoriteToggle}
          onRefresh={onRefresh}
          selectable={selectable}
          isSelected={isSelected}
          onSelect={onSelect}
          onMetaSelect={onMetaSelect}
          onShiftSelect={onShiftSelect}
          sortQuery={sortQuery}
          draggable={!selectable || selectedCount > 0}
          draggedFileIds={dragState.draggedFileIds}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : (
        <FileList
          files={files}
          onFavoriteToggle={onFavoriteToggle}
          onRefresh={onRefresh}
          selectable={selectable}
          isSelected={isSelected}
          onSelect={onSelect}
          onMetaSelect={onMetaSelect}
          onShiftSelect={onShiftSelect}
          sortQuery={sortQuery}
          draggable={!selectable || selectedCount > 0}
          draggedFileIds={dragState.draggedFileIds}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      )}

      {!isRecent && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore && (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
        </div>
      )}
    </>
  );
}
