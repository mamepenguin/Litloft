"use client";

import { useState, type RefObject } from "react";
import { SearchX } from "lucide-react";
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
import { FolderListRow } from "@/components/FolderListRow";
import { FolderContextMenu } from "@/components/FolderContextMenu";

import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";

import { FilterField } from "./FilterField";
import { useFolderCardRename } from "./useFolderCardRename";
import { type WidenTagScope } from "./WidenTagScopeLink";

/**
 * Both branches are written out with literal class strings because
 * `card-grid.test.ts` builds its population by reading them out of the
 * source. A single element with a conditional `className` still renders a
 * grid but is invisible to that scan.
 */
function FolderShelf({
  list,
  gridRef,
  columns,
  children,
}: {
  list: boolean;
  gridRef: (node: HTMLElement | null) => void;
  columns: number;
  children: React.ReactNode;
}) {
  if (list) {
    return <div className="mb-6">{children}</div>;
  }
  return (
    <div
      ref={gridRef}
      className="mb-6 grid gap-3"
      style={{ gridTemplateColumns: cardGridTemplate(columns) }}
    >
      {children}
    </div>
  );
}

interface FolderContentProps {
  files: FileItemWithMatch[];
  folders: Folder[];
  driveName: string;
  viewMode: ViewMode;
  loading: boolean;
  loadingMore: boolean;
  isRecent: boolean;
  hasProfile: boolean;
  isFavorites: boolean;
  isLiked: boolean;
  isRecentAdded: boolean;
  isSearch?: boolean;
  selectable: boolean;
  sortQuery: string;
  pinnedPaths: Set<string>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  dragState: DragState;
  isDropTarget: (path: string) => boolean;
  getDropTargetProps: (path: string) => Record<string, (e: React.DragEvent) => void>;
  selectedIds: ReadonlySet<string>;
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
  widenTagScope?: WidenTagScope | null;
  onAddFiles?: () => void;
}

export function FolderContent({
  files, folders, driveName, viewMode, loading, loadingMore,
  isRecent, hasProfile, isFavorites, isLiked, isRecentAdded, isSearch, selectable, sortQuery,
  pinnedPaths, sentinelRef, dragState, isDropTarget, getDropTargetProps,
  selectedIds, onSelect, onMetaSelect, onShiftSelect, onTogglePin, onFavoriteToggle, onRefresh,
  onDragStart, onDragEnd, selectedCount, isDropDisabled, onFolderDragStart,
  widenTagScope, onAddFiles,
}: FolderContentProps) {
  const isInternalDragging = useIsInternalDragging();
  const tFilter = useTranslations("filter");
  const tToolbar = useTranslations("toolbar");
  const tEmpty = useTranslations("empty");
  const [menuTarget, setMenuTarget] = useState<Folder | null>(null);
  const { ref: folderGridRef, columns } = useCardColumns();
  const { menuState: folderMenuState, close: closeFolderMenu, handlers: folderMenuHandlers } = useContextMenu();
  const filter = useFolderFilter<FileItemWithMatch>(files, folders);
  const filteredFiles = filter.files;
  const filteredFolders = filter.folders;
  const isFilterEmpty =
    filter.isActive && filteredFiles.length === 0 && filteredFolders.length === 0;

  // The name box narrows the rows without touching the URL, and it is
  // not visible to `FolderBrowser` above — so the "this is the whole
  // folder" marker it set is withdrawn here while the box has something
  // in it.
  const rowSortQuery = filter.isActive
    ? sortQuery.replace(/([?&])nav=folder&?/, (_m, lead: string) =>
        lead === "?" ? "?" : "&",
      ).replace(/[?&]$/, "")
    : sortQuery;

  const rename = useFolderCardRename(driveName, onRefresh);

  return (
    <>
      {rename.error && (
        <div
          role="alert"
          className="mb-3 rounded-lg bg-danger px-3 py-1.5 text-xs text-white"
        >
          {rename.error}
        </div>
      )}
      <div className="mb-6">
        <FilterField
          text={filter.text}
          onTextChange={filter.setText}
          placeholder={tFilter("placeholder.folder")}
        />
      </div>

      {filteredFolders.length > 0 && (
        <FolderShelf
          list={viewMode === "list"}
          gridRef={folderGridRef}
          columns={columns}
        >
          {filteredFolders.map((folder) => {
            const disabled = isDropDisabled(folder.path);
            const dragging = dragState.isDragging || isInternalDragging;
            const folderProps = {
              folder,
              driveName,
              isDropTarget: dragging && !disabled && isDropTarget(folder.path),
              dropTargetProps:
                dragging && !disabled ? getDropTargetProps(folder.path) : undefined,
              draggable: !!onRefresh,
              isDragging: dragState.draggedFolderPath === folder.path,
              onDragStart: (e: React.DragEvent) => onFolderDragStart(e, folder.path),
              onDragEnd,
              ...rename.cardProps(folder),
              onContextMenu: (e: React.MouseEvent) => {
                setMenuTarget(folder);
                folderMenuHandlers.onContextMenu(e);
              },
              onTouchStart: (e: React.TouchEvent) => {
                setMenuTarget(folder);
                folderMenuHandlers.onTouchStart(e);
              },
              onTouchEnd: folderMenuHandlers.onTouchEnd,
              onTouchMove: folderMenuHandlers.onTouchMove,
            };
            return viewMode === "list" ? (
              <FolderListRow key={folder.path} {...folderProps} />
            ) : (
              <FolderCard key={folder.path} {...folderProps} />
            );
          })}
        </FolderShelf>
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
        onStartInlineRename={
          menuTarget ? () => rename.start(menuTarget.path) : undefined
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : isFilterEmpty ? (
        <EmptyState
          icon={SearchX}
          title={tFilter("empty.folder")}
          secondaryActions={[{ label: tFilter("clear"), onClick: filter.clear }]}
        />
      ) : files.length === 0 && folders.length === 0 ? (
        // In search mode the semantic-search section is a separate result
        // axis, so showing an empty state here would contradict it when
        // semantic matches exist.
        isSearch ? null : isFavorites ? (
          <EmptyState variant="no-favorites" />
        ) : isLiked ? (
          <EmptyState variant="no-liked" />
        ) : isRecent ? (
          <EmptyState variant={hasProfile ? "no-recent" : "no-recent-profile"} />
        ) : isRecentAdded ? (
          <EmptyState variant="no-recent-added" />
        ) : widenTagScope ? (
          <EmptyState
            variant="no-tag-matches"
            // Secondary: the folder toolbar's `Add` is the screen's one
            // accent fill and it is on screen here too.
            secondaryActions={[
              {
                label: tToolbar("searchWholeDrive"),
                href: widenTagScope.href,
              },
            ]}
          />
        ) : (
          <EmptyState
            variant="no-files"
            secondaryActions={
              onAddFiles ? [{ label: tEmpty("addFilesAction"), onClick: onAddFiles }] : []
            }
          />
        )
      ) : viewMode === "grid" ? (
        <FileGrid
          files={filteredFiles}
          onFavoriteToggle={onFavoriteToggle}
          onRefresh={onRefresh}
          selectable={selectable}
          selectedIds={selectedIds}
          onSelect={onSelect}
          onMetaSelect={onMetaSelect}
          onShiftSelect={onShiftSelect}
          sortQuery={rowSortQuery}
          draggable={!selectable || selectedCount > 0}
          draggedIds={dragState.draggedFileIdSet}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : (
        <FileList
          files={filteredFiles}
          onFavoriteToggle={onFavoriteToggle}
          onRefresh={onRefresh}
          selectable={selectable}
          selectedIds={selectedIds}
          onSelect={onSelect}
          onMetaSelect={onMetaSelect}
          onShiftSelect={onShiftSelect}
          sortQuery={rowSortQuery}
          draggable={!selectable || selectedCount > 0}
          draggedIds={dragState.draggedFileIdSet}
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
