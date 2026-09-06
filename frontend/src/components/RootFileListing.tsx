"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, FileText, MoreHorizontal, Play, RefreshCw, X } from "lucide-react";

import { useTranslations } from "next-intl";
import { createFolder, getDriveFiles, scanDrive } from "@/lib/api";
import { useTreeRefresh } from "@/components/TreeRefreshContext";
import type { FileItem, SortField, SortOrder, ViewMode } from "@/types";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { ViewToggle } from "@/components/ViewToggle";
import { SortButton } from "@/components/SortButton";
import { EmptyState } from "@/components/EmptyState";
import { SearchX } from "lucide-react";
import { AddButton } from "@/components/AddButton";
import { useFilePicker } from "@/components/useFilePicker";
import { Button } from "@/components/Button";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { FilterField } from "@/components/folder/FilterField";
import { useDriveScan } from "@/components/folder/useDriveScan";
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
  const filePicker = useFilePicker();
  const tEmpty = useTranslations("empty");
  const visibleFiles = filter.files;
  const isFilterEmpty = filter.isActive && visibleFiles.length === 0;

  const [selectable, setSelectable] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
  // The same hook the folder toolbar uses. This was a byte-for-byte
  // copy of the bug that hook exists to fix: the spinner rendered
  // inside a menu that closes on click, and a 409 was swallowed
  // alongside real failures. Two copies of one silence.
  const handleScanComplete = useCallback(() => {
    refresh();
    onFolderChange?.();
  }, [refresh, onFolderChange]);
  const { scanning, handleScan } = useDriveScan(driveName, handleScanComplete);

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

  // Nothing under the drive root is the permanent state of a drive that
  // keeps its files in subfolders, so the sort, the view toggle and a
  // filter box would sit over the empty state on every visit. Same rule
  // as FolderToolbar's; a filter that is what emptied the list keeps
  // them, since it is also the way back out.
  const hideArrangingControls = total === 0 && !filter.isActive;

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
            <FileText size={20} className="text-text-muted" />
            {td("files")}
          </h2>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <AddButton onCreateFolder={() => setCreatingFolder(true)} />
          {filePicker.input}

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
              {/* The twin of the folder toolbar's inline Create, and not a
                  second accent fill for the same reason: Add stays on screen
                  behind this row (DESIGN.md §2.2). */}
              <Button variant="secondary" size="sm" onClick={handleCreateFolder}>
                {tc("create")}
              </Button>
              <Button
                iconOnly
                variant="ghost"
                aria-label={tc("cancel")}
                onClick={() => { setCreatingFolder(false); setNewFolderName(""); setFolderError(null); }}
              >
                <X size={16} />
              </Button>
              {folderError && <span className="text-xs text-danger">{folderError}</span>}
            </div>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {hasPlayableFiles && (
              <Button variant="secondary" size="sm" onClick={handlePlayAll}>
                <Play size={16} />
                {tc("play")}
              </Button>
            )}

            {/* Sort + view toggle + overflow grouped in a single pill.

              Deliberately *not* the folder toolbar's arrangement. That bar
              competes for room with Add, Play, Filter and `…`, so its view
              and sort controls are labelled menus; this one carries three
              controls and has the space, so DESIGN.md §Selected-state
              controls keeps the toggle. Do not re-align the two without
              re-reading why this one is not competing for room. */}
            {!hideArrangingControls && (
            <div className="flex items-center gap-1 rounded-2xl bg-bg-elevated p-1">
              <SortButton
                sort={sort}
                order={order}
                onChange={(s, o) => { setSort(s); setOrder(o); }}
              />

              <ViewToggle onChange={handleViewChange} />

              {/* Overflow: select-mode + rescan (low-frequency) */}
              <div className="relative">
                <button
                  onClick={() => setMoreOpen((s) => !s)}
                  className={`rounded-lg p-2 transition-colors ${
                    selectable
                      ? "bg-bg-card text-text-primary"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-label={t("more")}
                  title={t("more")}
                >
                  <MoreHorizontal size={16} />
                </button>
                {moreOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
                      aria-hidden="true"
                      onClick={() => setMoreOpen(false)}
                    />
                    <div
                      role="menu"
                      className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-none sm:min-w-[200px] sm:overflow-visible sm:origin-top-right"
                    >
                      <button
                        role="menuitem"
                        onClick={() => {
                          setSelectable((s) => {
                            if (s) selection.clear();
                            return !s;
                          });
                          setMoreOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                          selectable
                            ? "bg-bg-elevated text-text-primary font-medium"
                            : "text-text-primary hover:bg-bg-elevated"
                        }`}
                      >
                        <CheckSquare size={16} className="flex-shrink-0" />
                        <span className="flex-1">{ts("selectMode")}</span>
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          if (!scanning) handleScan();
                          setMoreOpen(false);
                        }}
                        disabled={scanning}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated disabled:opacity-50"
                      >
                        <RefreshCw
                          size={16}
                          className={`flex-shrink-0 ${scanning ? "animate-spin" : ""}`}
                        />
                        <span className="flex-1">{t("rescan")}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Filter row (client-side) */}
        <div className="mb-4">
          {!hideArrangingControls && (
            <FilterField
              text={filter.text}
              onTextChange={filter.setText}
              placeholder={tFilter("placeholder.folder")}
            />
          )}
          <div className="mt-2 text-sm text-text-muted">{tc("items", { count: total })}</div>
        </div>

        {/* File listing */}
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
        ) : files.length === 0 ? (
          // Secondary, not filled: this screen's accent is the `Add` in the
          // header above, which is on it whether or not the drive is empty.
          <EmptyState
            variant="no-files"
            secondaryActions={[{ label: tEmpty("addFilesAction"), onClick: filePicker.open }]}
          />
        ) : viewMode === "grid" ? (
          <FileGrid
            files={visibleFiles}
            onFavoriteToggle={handleFavoriteToggle}
            onRefresh={refresh}
            selectable={selectable}
            selectedIds={selection.selectedIds}
            onSelect={selection.toggle}
            onMetaSelect={handleMetaSelect}
            onShiftSelect={handleShiftSelect}
            sortQuery={sortQuery}
            draggable={!selectable || selection.count > 0}
            draggedIds={dragState.draggedFileIdSet}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ) : (
          <FileList
            files={visibleFiles}
            onFavoriteToggle={handleFavoriteToggle}
            onRefresh={refresh}
            selectable={selectable}
            selectedIds={selection.selectedIds}
            onSelect={selection.toggle}
            onMetaSelect={handleMetaSelect}
            onShiftSelect={handleShiftSelect}
            sortQuery={sortQuery}
            draggable={!selectable || selection.count > 0}
            draggedIds={dragState.draggedFileIdSet}
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
