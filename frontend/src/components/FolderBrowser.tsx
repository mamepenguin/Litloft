"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItem, FileType, SortField, SortOrder, ViewMode } from "@/types";
import { Breadcrumb } from "@/components/Breadcrumb";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { useClipboard } from "@/components/ClipboardProvider";
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
  const clipboard = useClipboard();
  const tcb = useTranslations("clipboard");
  const { scanning, handleScan } = useDriveScan(driveName, refresh);
  const createFolder = useCreateFolder(driveName, folderPath, refresh);
  const [pasting, setPasting] = useState(false);

  const handlePaste = useCallback(async () => {
    if (!clipboard.clipboard || pasting) return;
    setPasting(true);
    try {
      await clipboard.paste(driveName, folderPath ?? "");
      refresh();
    } catch {
      // error handled silently
    } finally {
      setPasting(false);
    }
  }, [clipboard, driveName, folderPath, pasting, refresh]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "c" && selection.selectedIds.size > 0) {
        e.preventDefault();
        clipboard.copy([...selection.selectedIds], driveName, folderPath ?? "");
        selection.clear();
        setSelectable(false);
      }
      if (mod && e.key === "x" && selection.selectedIds.size > 0) {
        e.preventDefault();
        clipboard.cut([...selection.selectedIds], driveName, folderPath ?? "");
        selection.clear();
        setSelectable(false);
      }
      if (mod && e.key === "v" && clipboard.clipboard) {
        e.preventDefault();
        handlePaste();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selection, clipboard, driveName, folderPath, handlePaste]);

  const handleDragDropComplete = useCallback(() => {
    selection.clear();
    setSelectable(false);
    refresh();
  }, [selection, refresh]);

  const { dragState, handleDragStart, handleFolderDragStart, handleDragEnd, getDropTargetProps, isDropTarget, isDropDisabled } = useDragAndDrop({
    drive: driveName,
    selectedIds: selection.selectedIds,
    onComplete: handleDragDropComplete,
  });

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

  const handleMetaSelect = useCallback((id: string) => {
    setSelectable(true);
    selection.toggle(id);
  }, [selection]);

  const handleShiftSelect = useCallback((id: string) => {
    selection.selectRange(files.map((f) => f.id), id);
  }, [selection, files]);

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

      {clipboard.clipboard && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-accent/10 px-4 py-2.5 ring-1 ring-accent/20">
          <ClipboardPaste size={18} className="flex-shrink-0 text-accent" />
          <span className="flex-1 text-sm text-text-primary">
            {tcb("pasteCount", {
              count: clipboard.clipboard.fileIds.length,
              mode: clipboard.clipboard.mode === "copy" ? tcb("modeCopy") : tcb("modeCut"),
            })}
          </span>
          <button
            onClick={handlePaste}
            disabled={pasting}
            className="rounded-2xl bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {tcb("pasteHere")}
          </button>
          <button
            onClick={clipboard.clear}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-primary"
            aria-label={tcb("clear")}
          >
            <X size={16} />
          </button>
        </div>
      )}

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
        fileIds={files.map((f) => f.id)}
        drive={driveName}
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
        onMetaSelect={handleMetaSelect}
        onShiftSelect={handleShiftSelect}
        onTogglePin={handleTogglePin}
        onFavoriteToggle={handleFavoriteToggle}
        onRefresh={refresh}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        selectedCount={selection.count}
        isDropDisabled={isDropDisabled}
        onFolderDragStart={handleFolderDragStart}
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
