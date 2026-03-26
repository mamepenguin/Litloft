"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, FolderPlus, Play, RefreshCw, Upload, X } from "lucide-react";

import { addPin, batchGetFiles, createFolder, getDriveFiles, getFolders, getPins, removePin, scanDrive } from "@/lib/api";
import { getRecentFileIds } from "@/lib/recentlyPlayed";
import type { FileItem, FileType, Folder, SortField, SortOrder, ViewMode } from "@/types";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { ViewToggle } from "@/components/ViewToggle";
import { SortButton } from "@/components/SortButton";
import { EmptyState } from "@/components/EmptyState";
import { FolderCard } from "@/components/FolderCard";
import { Breadcrumb } from "@/components/Breadcrumb";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { useSelection } from "@/hooks/useSelection";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useSidebar } from "@/components/SidebarProvider";

interface FolderBrowserProps {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
}

export function FolderBrowser({ driveName, folderPath, view, tagFilter }: FolderBrowserProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [typeFilter, setTypeFilter] = useState<FileType | null>(null);

  const isFavorites = view === "favorites";
  const isRecent = view === "recent";
  const isRecentAdded = view === "recent-added";
  const isPopular = view === "popular";
  const isAll = view === "all";
  const isSpecialView = isFavorites || isRecent || isRecentAdded || isPopular || isAll;

  const label = isFavorites
    ? "お気に入り"
    : isRecent
      ? "最近再生"
      : isRecentAdded
        ? "最近追加"
        : isPopular
          ? "人気"
          : isAll
            ? "すべてのファイル"
            : tagFilter
              ? `#${tagFilter}`
              : folderPath
                ? folderPath.split("/").pop() || driveName
                : driveName;

  // Infinite scroll for paginated views
  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      const res = await getDriveFiles(driveName, {
        path: isSpecialView || tagFilter ? undefined : (folderPath ?? ""),
        favorite: isFavorites ? true : undefined,
        tag: tagFilter || undefined,
        type: typeFilter || undefined,
        sort: isRecentAdded ? "created_at" : isPopular ? "likes" : sort,
        order: isRecentAdded || isPopular ? "desc" : order,
        page,
        limit,
      });
      return { data: res.data, total: res.meta.total };
    },
    [driveName, folderPath, sort, order, isFavorites, isSpecialView, isRecentAdded, isPopular, tagFilter, typeFilter],
  );

  const {
    items: paginatedFiles,
    total: paginatedTotal,
    loading: paginatedLoading,
    loadingMore,
    hasMore,
    sentinelRef,
    reset,
    setItems: setPaginatedFiles,
    setTotal: setPaginatedTotal,
  } = useInfiniteScroll<FileItem>({ fetchPage, limit: 30, disabled: isRecent });

  // Recent view uses localStorage, managed separately
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const fetchRecentFiles = useCallback(() => {
    const recentIds = getRecentFileIds();
    if (recentIds.length === 0) {
      setRecentFiles([]);
      return;
    }
    setRecentLoading(true);
    batchGetFiles(recentIds).then((fetched) => {
      const driveFiles = fetched.filter((f) =>
        f.drive === driveName && (!typeFilter || f.file_type === typeFilter)
      );
      setRecentFiles(driveFiles);
    }).catch(() => {
      setRecentFiles([]);
    }).finally(() => {
      setRecentLoading(false);
    });
  }, [driveName, typeFilter]);

  useEffect(() => {
    if (isRecent) fetchRecentFiles();
  }, [isRecent, fetchRecentFiles]);

  // Merge: pick the right source
  const files = isRecent ? recentFiles : paginatedFiles;
  const total = isRecent ? recentFiles.length : paginatedTotal;
  const loading = isRecent ? recentLoading : paginatedLoading;
  const setFiles = isRecent ? setRecentFiles : setPaginatedFiles;

  useEffect(() => {
    if (!isSpecialView && !tagFilter) {
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    } else {
      setFolders([]);
    }
  }, [driveName, folderPath, isSpecialView, tagFilter]);

  // Reset infinite scroll on filter/sort/drive changes (scroll to top)
  const prevResetKeyRef = useRef("");
  useEffect(() => {
    const key = `${driveName}|${folderPath}|${view}|${tagFilter}|${typeFilter}|${sort}|${order}`;
    if (prevResetKeyRef.current && prevResetKeyRef.current !== key) {
      reset();
      window.scrollTo({ top: 0 });
    }
    prevResetKeyRef.current = key;
  }, [driveName, folderPath, view, tagFilter, typeFilter, sort, order, reset]);

  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
  const { requestRefresh: refreshSidebar } = useSidebar();

  useEffect(() => {
    getPins(driveName)
      .then((pins) => setPinnedPaths(new Set(pins.map((p) => p.path))))
      .catch(() => setPinnedPaths(new Set()));
  }, [driveName]);

  const handleTogglePin = useCallback(
    async (folderPath: string) => {
      try {
        const isPinned = pinnedPaths.has(folderPath);
        if (isPinned) {
          await removePin(driveName, folderPath);
          setPinnedPaths((prev) => {
            const next = new Set(prev);
            next.delete(folderPath);
            return next;
          });
        } else {
          await addPin(driveName, folderPath);
          setPinnedPaths((prev) => new Set(prev).add(folderPath));
        }
        refreshSidebar();
      } catch {
        // ignore
      }
    },
    [driveName, pinnedPaths, refreshSidebar]
  );

  const [selectable, setSelectable] = useState(false);
  const selection = useSelection();

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { dragState, handleDragStart, handleDragEnd, getDropTargetProps, isDropTarget } = useDragAndDrop({
    drive: driveName,
    selectedIds: selection.selectedIds,
    onComplete: refresh,
  });
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    if (scanning) return;
    setScanning(true);
    try {
      await scanDrive(driveName);
      refresh();
    } catch {
      // 409 = already scanning, ignore
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (refreshKey === 0) return;
    if (!isSpecialView && !tagFilter) {
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    }
    if (isRecent) {
      fetchRecentFiles();
    } else {
      reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally triggered only by refreshKey
  }, [refreshKey]);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (name.includes("/") || name.includes("\\") || name === ".." || name === "." || name.startsWith(".")) {
      setFolderError("無効なフォルダ名です");
      return;
    }
    if (name.length > 255) {
      setFolderError("フォルダ名が長すぎます");
      return;
    }
    setFolderError(null);
    try {
      await createFolder(driveName, folderPath ?? "", name);
      setNewFolderName("");
      setCreatingFolder(false);
      refresh();
    } catch {
      setFolderError("フォルダの作成に失敗しました");
    }
  }

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderRouter = useRouter();

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

      {/* Toolbar row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!isSpecialView && !tagFilter && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const uploadZone = document.querySelector<HTMLElement>("[data-upload-zone]");
                if (uploadZone && e.target.files) {
                  const event = new CustomEvent("upload-files", { detail: Array.from(e.target.files) });
                  uploadZone.dispatchEvent(event);
                }
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
              aria-label="アップロード"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Upload</span>
            </button>

            {creatingFolder ? (
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder();
                    if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); setFolderError(null); }
                  }}
                  placeholder="フォルダ名..."
                  className="min-w-0 flex-1 rounded-lg bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent sm:w-40 sm:flex-initial"
                />
                <button
                  onClick={handleCreateFolder}
                  className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/80"
                >
                  作成
                </button>
                <button
                  onClick={() => { setCreatingFolder(false); setNewFolderName(""); setFolderError(null); }}
                  className="rounded-lg p-2 text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
                {folderError && <span className="text-xs text-red-400">{folderError}</span>}
              </div>
            ) : (
              <button
                onClick={() => setCreatingFolder(true)}
                className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
                aria-label="新規フォルダ"
              >
                <FolderPlus size={16} />
                <span className="hidden sm:inline">New Folder</span>
              </button>
            )}
          </>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {hasPlayableFiles && !isSpecialView && !tagFilter && (
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
              aria-label="全曲再生"
            >
              <Play size={16} />
              <span className="hidden sm:inline">再生</span>
            </button>
          )}

          <SortButton
            sort={sort}
            order={order}
            onChange={(s, o) => { setSort(s); setOrder(o); }}
          />

          <button
            onClick={() => {
              setSelectable((s) => {
                if (s) selection.clear();
                return !s;
              });
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              selectable
                ? "bg-accent text-white"
                : "bg-bg-card text-text-muted hover:text-text-primary"
            }`}
            aria-label="選択モード"
          >
            <CheckSquare size={16} />
          </button>

          <ViewToggle onChange={handleViewChange} />

          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-lg bg-bg-card px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
            aria-label="再スキャン"
            title="ドライブを再スキャン"
          >
            <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {([
            { value: null, label: "すべて" },
            { value: "video" as FileType, label: "動画" },
            { value: "image" as FileType, label: "画像" },
            { value: "audio" as FileType, label: "音声" },
            { value: "document" as FileType, label: "文書" },
            { value: "other" as FileType, label: "その他" },
          ] as const).map((tab) => (
            <button
              key={tab.label}
              onClick={() => setTypeFilter(tab.value)}
              className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                typeFilter === tab.value
                  ? "bg-accent/20 font-medium text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-text-muted">{total} 件</span>
      </div>

      {folders.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((folder) => (
            <FolderCard
              key={folder.path}
              folder={folder}
              driveName={driveName}
              isPinned={pinnedPaths.has(folder.path)}
              onTogglePin={() => handleTogglePin(folder.path)}
              onUpdate={refresh}
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
          onFavoriteToggle={handleFavoriteToggle}
          onRefresh={refresh}
          selectable={selectable}
          isSelected={selection.isSelected}
          onSelect={selection.toggle}
          sortQuery={sortQuery}
          draggable={!selectable || selection.count > 0}
          draggedFileIds={dragState.draggedFileIds}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      ) : (
        <FileList
          files={files}
          onFavoriteToggle={handleFavoriteToggle}
          onRefresh={refresh}
          selectable={selectable}
          isSelected={selection.isSelected}
          onSelect={selection.toggle}
          sortQuery={sortQuery}
          draggable={!selectable || selection.count > 0}
          draggedFileIds={dragState.draggedFileIds}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      )}

      {!isRecent && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore && (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
        </div>
      )}
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
