"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, FileText, Play, RefreshCw, X } from "lucide-react";

import { useTranslations } from "next-intl";
import { createFolder, getDriveFiles, scanDrive } from "@/lib/api";
import { useTreeRefresh } from "@/components/TreeRefreshContext";
import type { FileItem, SortField, SortOrder, ViewMode } from "@/types";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { ViewToggle } from "@/components/ViewToggle";
import { SortButton } from "@/components/SortButton";
import { EmptyState } from "@/components/EmptyState";
import { UploadButton } from "@/components/UploadButton";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { FilterField } from "@/components/folder/FilterField";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useFolderFilter } from "@/hooks/useFolderFilter";
import { useSelection } from "@/hooks/useSelection";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

interface RootFileListingProps {
  driveName: string;
  onFileAction?: () => void;
  onFolderChange?: () => void;
}

const LIMIT = 30;

export function RootFileListing({ driveName, onFileAction, onFolderChange }: RootFileListingProps) {
  const t = useTranslations("toolbar");
  const tc = useTranslations("common");
  const tf = useTranslations("folder");
  const ts = useTranslations("selection");
  const td = useTranslations("drive");
  const tFilter = useTranslations("filter");
  const refreshTree = useTreeRefresh();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      const res = await getDriveFiles(driveName, {
        path: "",
        sort,
        order,
        page,
        limit,
      });
      return { data: res.data, total: res.meta.total };
    },
    [driveName, sort, order],
  );

  const {
    items: files,
    total,
    loading,
    loadingMore,
    sentinelRef,
    reset,
    setItems: setFiles,
  } = useInfiniteScroll<FileItem>({ fetchPage, limit: LIMIT });

  const filter = useFolderFilter<FileItem>(files);
  const visibleFiles = filter.files;
  const isFilterEmpty = filter.isActive && visibleFiles.length === 0;

  const [selectable, setSelectable] = useState(false);
  const selection = useSelection();

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Refresh when any drop completes in ANY pane (covers both same-pane and
  // cross-pane drops; also handles WS-less batch moves).
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("loft-move-complete", handler);
    return () => window.removeEventListener("loft-move-complete", handler);
  }, [refresh]);

  const handleDragDropComplete = useCallback(() => {
    selection.clear();
    setSelectable(false);
    refresh();
    onFolderChange?.();
  }, [selection, refresh, onFolderChange]);

  const {
    dragState,
    handleDragStart,
    handleDragEnd,
  } = useDragAndDrop({
    drive: driveName,
    selectedIds: selection.selectedIds,
    onComplete: handleDragDropComplete,
  });

  const handleShiftSelect = useCallback((id: string) => {
    selection.selectRange(files.map((f) => f.id), id);
  }, [selection, files]);

  const handleMetaSelect = useCallback((id: string) => {
    setSelectable(true);
    selection.toggle(id);
  }, [selection]);
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    if (scanning) return;
    setScanning(true);
    try {
      await scanDrive(driveName);
      refresh();
      onFolderChange?.();
    } catch {
      // 409 = already scanning, ignore
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (refreshKey === 0) return;
    reset();
    onFileAction?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally triggered only by refreshKey
  }, [refreshKey]);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (name.includes("/") || name.includes("\\") || name === ".." || name === "." || name.startsWith(".")) {
      setFolderError(tf("invalidName"));
      return;
    }
    if (name.length > 255) {
      setFolderError(tf("nameTooLong"));
      return;
    }
    setFolderError(null);
    try {
      await createFolder(driveName, "", name);
      setNewFolderName("");
      setCreatingFolder(false);
      refresh();
      refreshTree();
      onFolderChange?.();
    } catch {
      setFolderError(tf("createFailed"));
    }
  }

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleFavoriteToggle = useCallback(
    (updated: FileItem) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === updated.id ? updated : f))
      );
      onFileAction?.();
    },
    [onFileAction, setFiles],
  );

  const sortQuery = sort === "random"
    ? ""
    : `?sort=${sort}&order=${order}`;

  const router = useRouter();

  const hasPlayableFiles = visibleFiles.some(
    (f) => f.file_type === "audio" || f.file_type === "video"
  );

  const handlePlayAll = useCallback(() => {
    const firstPlayable = visibleFiles.find(
      (f) => f.file_type === "audio" || f.file_type === "video"
    );
    if (!firstPlayable) return;
    const params = new URLSearchParams();
    params.set("folder_play", "1");
    if (sort !== "random") {
      params.set("sort", sort);
      params.set("order", order);
    }
    router.push(`/files/${firstPlayable.id}?${params.toString()}`);
  }, [visibleFiles, sort, order, router]);

  const handleUploadComplete = useCallback(() => {
    refresh();
    onFolderChange?.();
  }, [refresh, onFolderChange]);

  return (
    <UploadZone drive={driveName} folderPath="" onUploadComplete={handleUploadComplete}>
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
            <FileText size={20} className="text-accent" />
            {td("files")}
          </h2>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <UploadButton onCreateFolder={() => setCreatingFolder(true)} />

          {creatingFolder && (
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
                placeholder={tf("namePlaceholder")}
                className="min-w-0 flex-1 rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring sm:w-40 sm:flex-initial"
              />
              <button
                onClick={handleCreateFolder}
                className="rounded-2xl bg-accent px-3 py-2 text-sm text-white hover:bg-accent-hover"
              >
                {tc("create")}
              </button>
              <button
                onClick={() => { setCreatingFolder(false); setNewFolderName(""); setFolderError(null); }}
                className="rounded-lg p-2 text-text-muted hover:text-text-primary"
              >
                <X size={16} />
              </button>
              {folderError && <span className="text-xs text-danger">{folderError}</span>}
            </div>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {hasPlayableFiles && (
              <button
                onClick={handlePlayAll}
                className="flex items-center gap-1.5 rounded-2xl bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                aria-label={t("playAll")}
              >
                <Play size={16} />
                <span className="hidden sm:inline">{tc("play")}</span>
              </button>
            )}

            <div className="flex items-center gap-1 rounded-xl bg-bg-card p-1">
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
                className={`rounded-lg p-2 transition-colors ${
                  selectable
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-primary"
                }`}
                aria-label={ts("selectMode")}
              >
                <CheckSquare size={16} />
              </button>

              <ViewToggle onChange={handleViewChange} />

              <button
                onClick={handleScan}
                disabled={scanning}
                className="rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                aria-label={t("rescan")}
                title={t("rescanTitle")}
              >
                <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>

        {/* Filter row (client-side) */}
        <div className="mb-4">
          <FilterField
            text={filter.text}
            onTextChange={filter.setText}
            placeholder={tFilter("placeholder.folder")}
            typeFilter={filter.typeFilter}
            onTypeFilterChange={filter.setTypeFilter}
          />
          <div className="mt-2 text-sm text-text-muted">{tc("items", { count: total })}</div>
        </div>

        {/* File listing */}
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
        ) : files.length === 0 ? (
          <EmptyState variant="no-files" />
        ) : viewMode === "grid" ? (
          <FileGrid
            files={visibleFiles}
            onFavoriteToggle={handleFavoriteToggle}
            onRefresh={refresh}
            selectable={selectable}
            isSelected={selection.isSelected}
            onSelect={selection.toggle}
            onMetaSelect={handleMetaSelect}
            onShiftSelect={handleShiftSelect}
            sortQuery={sortQuery}
            draggable={!selectable || selection.count > 0}
            draggedFileIds={dragState.draggedFileIds}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ) : (
          <FileList
            files={visibleFiles}
            onFavoriteToggle={handleFavoriteToggle}
            onRefresh={refresh}
            selectable={selectable}
            isSelected={selection.isSelected}
            onSelect={selection.toggle}
            onMetaSelect={handleMetaSelect}
            onShiftSelect={handleShiftSelect}
            sortQuery={sortQuery}
            draggable={!selectable || selection.count > 0}
            draggedFileIds={dragState.draggedFileIds}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore && (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
        </div>

        {/* Selection bar */}
        {selectable && (
          <SelectionBar
            count={selection.count}
            selectedIds={selection.selectedIds}
            totalCount={visibleFiles.length}
            drive={driveName}
            currentPath=""
            onSelectAll={() => selection.selectAll(visibleFiles.map((f) => f.id))}
            onClear={() => {
              selection.clear();
              setSelectable(false);
            }}
            onComplete={refresh}
          />
        )}
      </section>
    </UploadZone>
  );
}
