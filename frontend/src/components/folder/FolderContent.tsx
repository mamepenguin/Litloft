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
 * The band of folders above the files: a card grid, or a column of rows.
 *
 * Both branches are written out with literal class strings because
 * `card-grid.test.ts` builds its population by reading them out of the
 * source. A single element with a conditional `className` still renders a
 * grid but is invisible to that scan, so the grid would quietly leave the
 * set of grids the floor rule is checked against.
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
  const { ref: folderGridRef, columns } = useCardColumns();
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
        // One set of props, two shapes. The list draws folders as rows
        // so a list stays a list: a grid of cards above a column of rows
        // is two answers to "what am I looking at" on one screen.
        // Everything a folder can do — drop target, inline rename, the
        // one `FolderContextMenu` — is handed to whichever shape is
        // drawn, from here, so neither grows a second definition.
        // Two elements rather than one with a conditional `className`:
        // `card-grid.test.ts` finds every card grid by reading the literal
        // class strings in the source, and a grid hidden inside a ternary
        // drops out of that population without failing anything.
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
            // Secondary, though the spec said primary: the folder toolbar's
            // `Add` is the screen's one accent fill and it is on screen
            // here too, so a filled call to action in the empty state
            // makes two (DESIGN.md §2.2, 原則 2). The toolbar owns the
            // fill; the empty state owns the words.
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
            // Both secondary, for the same reason as the tag case above:
            // the toolbar's `Add` is already the folder screen's accent
            // fill, and it does not go away when the folder is empty.
            secondaryActions={[
              ...(onAddFiles
                ? [{ label: tEmpty("addFilesAction"), onClick: onAddFiles }]
                : []),
              ...(onCreateFile
                ? [{ label: tEmpty("createNoteAction"), onClick: onCreateFile }]
                : []),
            ]}
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
