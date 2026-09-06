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
import { FolderContextMenu } from "@/components/FolderContextMenu";

import { cardGridColumns } from "@/lib/cardGrid";

import { FilterField } from "./FilterField";
import { useFolderCardRename } from "./useFolderCardRename";
import { type WidenTagScope } from "./WidenTagScopeLink";

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
  /**
   * Set when a folder-scoped tag filter is active. "No matches in this
   * folder" without a way to widen is a dead end, so the empty state
   * carries the drive-wide door (spec
   * 2026-08-21-folder-scoped-tag-filter §8 / §8.1).
   */
  widenTagScope?: WidenTagScope | null;
  /**
   * The same two doors the toolbar's add menu holds, for the folder that
   * has nothing in it yet. Both are optional for the same reason the menu
   * rows are: a view with no concrete folder to write into has nowhere to
   * put a file, and offers neither.
   */
  onAddFiles?: () => void;
  onCreateFile?: () => void;
}

export function FolderContent({
  files, folders, driveName, viewMode, loading, loadingMore,
  isRecent, hasProfile, isFavorites, isLiked, isRecentAdded, isSearch, selectable, sortQuery,
  pinnedPaths, sentinelRef, dragState, isDropTarget, getDropTargetProps,
  selectedIds, onSelect, onMetaSelect, onShiftSelect, onTogglePin, onFavoriteToggle, onRefresh,
  onDragStart, onDragEnd, selectedCount, isDropDisabled, onFolderDragStart,
  widenTagScope, onAddFiles, onCreateFile,
}: FolderContentProps) {
  // Show folder-card drop targets for both local drags and cross-pane
  // drags originating from the tree pane.
  const isInternalDragging = useIsInternalDragging();
  const tFilter = useTranslations("filter");
  const tToolbar = useTranslations("toolbar");
  const tEmpty = useTranslations("empty");
  const [menuTarget, setMenuTarget] = useState<Folder | null>(null);
  const { menuState: folderMenuState, close: closeFolderMenu, handlers: folderMenuHandlers } = useContextMenu();
  const filter = useFolderFilter<FileItemWithMatch>(files, folders);
  const filteredFiles = filter.files;
  const filteredFolders = filter.folders;
  const isFilterEmpty =
    filter.isActive && filteredFiles.length === 0 && filteredFolders.length === 0;

  // Inline rename. Folder cards show the real folder name, so editing
  // here edits exactly the string on screen (spec §2). File cards show
  // `file.title`, a cosmetic derivation, and keep the dialog.
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
        <div
          className="mb-6 grid gap-3"
          style={{ gridTemplateColumns: cardGridColumns }}
        >
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
                {...rename.cardProps(folder)}
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
        // In search mode the FolderContent represents only the
        // filename/metadata-text match axis. The intelligence
        // semantic-search section above is a separate result axis,
        // so showing an empty state here would contradict it when
        // semantic matches exist. Render nothing instead — the page
        // header already conveys the search context, and the
        // semantic section communicates its own emptiness.
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
            primaryAction={{
              label: tToolbar("searchWholeDrive"),
              href: widenTagScope.href,
            }}
          />
        ) : (
          <EmptyState
            variant="no-files"
            primaryAction={
              onAddFiles ? { label: tEmpty("addFilesAction"), onClick: onAddFiles } : undefined
            }
            secondaryActions={
              onCreateFile
                ? [{ label: tEmpty("createNoteAction"), onClick: onCreateFile }]
                : undefined
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
          sortQuery={sortQuery}
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
          sortQuery={sortQuery}
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
