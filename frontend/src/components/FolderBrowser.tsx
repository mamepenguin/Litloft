"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { FileItem, FileType, SortField, SortOrder, ViewMode } from "@/types";
import { Breadcrumb } from "@/components/Breadcrumb";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { useSelection } from "@/hooks/useSelection";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";

import { useFolderFiles } from "@/components/folder/useFolderFiles";
import { usePinnedFolders } from "@/components/folder/usePinnedFolders";
import { useDriveScan } from "@/components/folder/useDriveScan";
import { useCreateFolder } from "@/components/folder/useCreateFolder";
import { FolderToolbar } from "@/components/folder/FolderToolbar";
import { FolderContent } from "@/components/folder/FolderContent";

interface FolderBrowserProps {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
}

export function FolderBrowser({ driveName, folderPath, view, tagFilter }: FolderBrowserProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [typeFilter, setTypeFilter] = useState<FileType | null>(null);
  const [selectable, setSelectable] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const isFavorites = view === "favorites";
  const isRecentAdded = view === "recent-added";
  const isPopular = view === "popular";
  const isAll = view === "all";
  const isSpecialView = isFavorites || view === "recent" || isRecentAdded || isPopular || isAll;

  const {
    files, folders, total, loading, loadingMore, hasMore, sentinelRef,
    reset, setFiles, setPaginatedTotal, setFolders, isRecent,
  } = useFolderFiles({ driveName, folderPath, view, tagFilter, typeFilter, sort, order, refreshKey });

  const { pinnedPaths, handleTogglePin } = usePinnedFolders(driveName);
  const selection = useSelection();
  const { scanning, handleScan } = useDriveScan(driveName, refresh);
  const createFolder = useCreateFolder(driveName, folderPath, refresh);

  const { dragState, handleDragStart, handleDragEnd, getDropTargetProps, isDropTarget } = useDragAndDrop({
    drive: driveName,
    selectedIds: selection.selectedIds,
    onComplete: refresh,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderRouter = useRouter();

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleFavoriteToggle = useCallback(
    (updated: FileItem) => {
      if (isFavorites) {
        setFiles((prev) =>
          updated.is_favorite
            ? prev.map((f) => (f.id === updated.id ? updated : f))
            : prev.filter((f) => f.id !== updated.id)
        );
        if (!updated.is_favorite && !isRecent) {
          setPaginatedTotal((t) => t - 1);
        }
      } else {
        setFiles((prev) =>
          prev.map((f) => (f.id === updated.id ? updated : f))
        );
      }
    },
    [isFavorites, isRecent, setFiles, setPaginatedTotal],
  );

  const effectiveSort = isRecentAdded ? "created_at" : isPopular ? "likes" : sort;
  const effectiveOrder = isRecentAdded || isPopular ? "desc" : order;
  const sortQuery = effectiveSort === "random"
    ? ""
    : `?sort=${effectiveSort}&order=${effectiveOrder}`;

  const hasPlayableFiles = files.some(
    (f) => f.file_type === "audio" || f.file_type === "video"
  );

  const handlePlayAll = useCallback(() => {
    const firstPlayable = files.find(
      (f) => f.file_type === "audio" || f.file_type === "video"
    );
    if (!firstPlayable) return;
    const params = new URLSearchParams();
    params.set("folder_play", "1");
    if (sort !== "random") {
      params.set("sort", effectiveSort);
      params.set("order", effectiveOrder);
    }
    folderRouter.push(`/files/${firstPlayable.id}?${params.toString()}`);
  }, [files, sort, effectiveSort, effectiveOrder, folderRouter]);

  return (
    <UploadZone drive={driveName} folderPath={folderPath ?? ""} onUploadComplete={refresh}>
    <div className="min-w-0 w-full flex-1 px-2 py-4 sm:px-4 sm:py-6">
      <Breadcrumb
        driveName={driveName}
        folderPath={folderPath}
        getDropTargetProps={dragState.isDragging ? getDropTargetProps : undefined}
        isDropTarget={dragState.isDragging ? isDropTarget : undefined}
      />

      <FolderToolbar
        isSpecialView={isSpecialView}
        tagFilter={tagFilter}
        hasPlayableFiles={hasPlayableFiles}
        sort={sort}
        order={order}
        typeFilter={typeFilter}
        total={total}
        selectable={selectable}
        scanning={scanning}
        creatingFolder={createFolder.creatingFolder}
        newFolderName={createFolder.newFolderName}
        folderError={createFolder.folderError}
        fileInputRef={fileInputRef}
        onSortChange={(s, o) => { setSort(s); setOrder(o); }}
        onTypeFilterChange={setTypeFilter}
        onViewChange={handleViewChange}
        onToggleSelectable={() => {
          setSelectable((s) => {
            if (s) selection.clear();
            return !s;
          });
        }}
        onScan={handleScan}
        onPlayAll={handlePlayAll}
        onSetCreatingFolder={createFolder.setCreatingFolder}
        onSetNewFolderName={createFolder.setNewFolderName}
        onSetFolderError={createFolder.setFolderError}
        onCreateFolder={createFolder.handleCreateFolder}
        onUploadClick={() => fileInputRef.current?.click()}
      />

      <FolderContent
        files={files}
        folders={folders}
        driveName={driveName}
        viewMode={viewMode}
        loading={loading}
        loadingMore={loadingMore}
        isRecent={isRecent}
        isFavorites={isFavorites}
        isRecentAdded={isRecentAdded}
        selectable={selectable}
        sortQuery={sortQuery}
        pinnedPaths={pinnedPaths}
        sentinelRef={sentinelRef}
        dragState={dragState}
        isDropTarget={isDropTarget}
        getDropTargetProps={getDropTargetProps}
        isSelected={selection.isSelected}
        onSelect={selection.toggle}
        onTogglePin={handleTogglePin}
        onFavoriteToggle={handleFavoriteToggle}
        onRefresh={refresh}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        selectedCount={selection.count}
      />

      {selectable && (
        <SelectionBar
          count={selection.count}
          selectedIds={selection.selectedIds}
          totalCount={files.length}
          drive={driveName}
          currentPath={folderPath}
          onSelectAll={() => selection.selectAll(files.map((f) => f.id))}
          onClear={() => {
            selection.clear();
            setSelectable(false);
          }}
          onComplete={refresh}
        />
      )}
    </div>
    </UploadZone>
  );
}
