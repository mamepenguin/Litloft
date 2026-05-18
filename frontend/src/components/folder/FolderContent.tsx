"use client";

import { useState, type RefObject } from "react";
import { useTranslations } from "next-intl";

import { useContextMenu } from "@/hooks/useContextMenu";
import { useFolderFilter } from "@/hooks/useFolderFilter";
import { useIsInternalDragging } from "@/hooks/useIsInternalDragging";
import type { DragState } from "@/hooks/useDragAndDrop";
import type { FileItem, FileItemWithMatch, Folder, ViewMode } from "@/types";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { EmptyState } from "@/components/EmptyState";
import { FolderCard } from "@/components/FolderCard";
import { FolderContextMenu } from "@/components/FolderContextMenu";

import { FilterField } from "./FilterField";

interface FolderContentProps {
  files: FileItemWithMatch[];
  folders: Folder[];
  driveName: string;
  viewMode: ViewMode;
  loading: boolean;
  loadingMore: boolean;
  isRecent: boolean;
  isFavorites: boolean;
  isRecentAdded: boolean;
  isSearch?: boolean;
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
  isDropDisabled: (path: string) => boolean;
  onFolderDragStart: (e: React.DragEvent, folderPath: string) => void;
}

export function FolderContent({
  files, folders, driveName, viewMode, loading, loadingMore,
  isRecent, isFavorites, isRecentAdded, isSearch, selectable, sortQuery,
  pinnedPaths, sentinelRef, dragState, isDropTarget, getDropTargetProps,
  isSelected, onSelect, onMetaSelect, onShiftSelect, onTogglePin, onFavoriteToggle, onRefresh,
  onDragStart, onDragEnd, selectedCount, isDropDisabled, onFolderDragStart,
}: FolderContentProps) {
  // Show folder-card drop targets for both local drags and cross-pane
  // drags originating from the tree pane.
  const isInternalDragging = useIsInternalDragging();
  const tFilter = useTranslations("filter");
  const [menuTarget, setMenuTarget] = useState<Folder | null>(null);
  const { menuState: folderMenuState, close: closeFolderMenu, handlers: folderMenuHandlers } = useContextMenu();
  const filter = useFolderFilter<FileItemWithMatch>(files, folders);
  const filteredFiles = filter.files;
  const filteredFolders = filter.folders;
  const isFilterEmpty =
    filter.isActive && filteredFiles.length === 0 && filteredFolders.length === 0;
  return (
    <>
      <div className="mb-6">
        <FilterField
          text={filter.text}
          onTextChange={filter.setText}
          placeholder={tFilter("placeholder.folder")}
          typeFilter={filter.typeFilter}
          onTypeFilterChange={filter.setTypeFilter}
        />
      </div>

      {filteredFolders.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredFolders.map((folder) => {
            const disabled = isDropDisabled(folder.path);
            return (
              <FolderCard
                key={folder.path}
                folder={folder}
                driveName={driveName}
                isDropTarget={(dragState.isDragging || isInternalDragging) && !disabled && isDropTarget(folder.path)}
                dropTargetProps={(dragState.isDragging || isInternalDragging) && !disabled ? getDropTargetProps(folder.path) : undefined}
                draggable={!!onRefresh}
                isDragging={dragState.draggedFolderPath === folder.path}
                onDragStart={(e) => onFolderDragStart(e, folder.path)}
                onDragEnd={onDragEnd}
                onContextMenu={(e) => {
                  setMenuTarget(folder);
                  folderMenuHandlers.onContextMenu(e);
                }}
                onTouchStart={(e) => {
                  setMenuTarget(folder);
                  folderMenuHandlers.onTouchStart(e);
                }}
                onTouchEnd={folderMenuHandlers.onTouchEnd}
                onTouchMove={folderMenuHandlers.onTouchMove}
              />
            );
          })}
        </div>
      )}

      <FolderContextMenu
        open={folderMenuState.open}
        position={folderMenuState.position}
        target={menuTarget}
        drive={driveName}
        isPinned={menuTarget ? pinnedPaths.has(menuTarget.path) : false}
        onTogglePin={menuTarget ? () => onTogglePin(menuTarget.path) : undefined}
        onUpdate={onRefresh}
        onClose={closeFolderMenu}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : isFilterEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-text-muted">
          <p>{tFilter("empty.folder")}</p>
          <button
            type="button"
            onClick={filter.clear}
            className="rounded-2xl border border-bg-border bg-bg-card px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            {tFilter("clear")}
          </button>
        </div>
      ) : files.length === 0 && folders.length === 0 ? (
        // In search mode the FolderContent represents only the
        // filename/metadata-text match axis. The intelligence
        // semantic-search section above is a separate result axis,
        // so showing an empty state here would contradict it when
        // semantic matches exist. Render nothing instead — the page
        // header already conveys the search context, and the
        // semantic section communicates its own emptiness.
        isSearch ? null : isFavorites ? (
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
          files={filteredFiles}
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
          files={filteredFiles}
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
