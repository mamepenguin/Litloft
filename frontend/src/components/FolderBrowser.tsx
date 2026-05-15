"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";

import type { FileItem, FileType, SortField, SortOrder, ViewMode } from "@/types";
import { Breadcrumb } from "@/components/Breadcrumb";
import { TreeToggle } from "@/components/TreeToggle";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { SmartFolderSaveButton } from "@/components/SmartFolderSaveButton";
import { AddonSlot } from "@/components/AddonSlot";
import { EmptyState } from "@/components/EmptyState";
import { ViewToggle } from "@/components/ViewToggle";
import { useClipboard } from "@/components/ClipboardProvider";
import { useSelection } from "@/hooks/useSelection";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useFolderViewMode } from "@/hooks/useFolderViewMode";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { useTreeEnabled } from "@/hooks/useTreeEnabled";
import { buildListSnapshotKey, loadListSnapshot, saveListSnapshot } from "@/lib/listSnapshot";
import { useScrollContainer } from "@/lib/scrollContainer";
import { deriveDominantKind } from "@/lib/dominantKind";

import { useFolderFiles } from "@/components/folder/useFolderFiles";
import { usePinnedFolders } from "@/components/folder/usePinnedFolders";
import { useDriveScan } from "@/components/folder/useDriveScan";
import { useCreateFolder } from "@/components/folder/useCreateFolder";
import { useCreateFile } from "@/hooks/useCreateFile";
import { FolderToolbar } from "@/components/folder/FolderToolbar";
import { FolderContent } from "@/components/folder/FolderContent";

interface FolderBrowserProps {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
  /** When set (non-empty), the browser renders search-mode UI. */
  searchQuery?: string;
  /** Optional pre-set type filter (used by SearchPage from URL). */
  typeFilter?: FileType | null;
  /** When set, the active search came from a saved Smart Folder. */
  smartFolderId?: string | null;
  /**
   * Search-only flag. When `true`, semantic search includes scene-frame
   * CLIP embeddings alongside the default representative-frame route.
   * Driven by the scene-search toggle on `SearchPage`. Spec
   * `2026-05-02-thumbnail-clip-default-shallow-search.md`.
   */
  includeSceneClip?: boolean;
}

export function FolderBrowser({
  driveName,
  folderPath,
  view,
  tagFilter,
  searchQuery,
  typeFilter: typeFilterProp,
  smartFolderId,
  includeSceneClip,
}: FolderBrowserProps) {
  const isSearch = !!(searchQuery && searchQuery.trim());
  // Load the snapshot exactly once via useState's lazy initializer. We pass
  // the same reference down to useFolderFiles so that both its filter tuple
  // and the hydrated items originate from a single parse of sessionStorage.
  const [initialSnapshot] = useState(() =>
    loadListSnapshot(buildListSnapshotKey({ driveName, folderPath, view, tagFilter })),
  );

  // Search mode defaults to relevance (hybrid score on the merged
  // filename + semantic list); folder/view browsing keeps created_at.
  const [sort, setSort] = useState<SortField>(
    initialSnapshot?.filters.sort ?? (isSearch ? "relevance" : "created_at"),
  );
  const [order, setOrder] = useState<SortOrder>(initialSnapshot?.filters.order ?? "desc");
  const [typeFilter, setTypeFilter] = useState<FileType | null>(
    typeFilterProp ?? initialSnapshot?.filters.typeFilter ?? null,
  );
  const [selectable, setSelectable] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const isFavorites = view === "favorites";
  const isRecentAdded = view === "recent-added";
  const isPopular = view === "popular";
  const isAll = view === "all";
  const isSpecialView = isFavorites || view === "recent" || isRecentAdded || isPopular || isAll;
  // True for "real" folder browsing (drive root or a sub folder, no tag).
  // The flat virtual views (favorites/recent/etc.), search, and tag
  // filters use the global default for view mode rather than the
  // per-folder override, since they don't render a single folder.
  const isFolderContext = !isSpecialView && !isSearch && !tagFilter;

  const {
    files, folders, total, loading, loadingMore, hasMore, pagesLoaded, sentinelRef,
    setFiles, setPaginatedTotal, setFolders, isRecent,
    snapshotKey, hydratedScrollY,
  } = useFolderFiles({ driveName, folderPath, view, tagFilter, typeFilter, sort, order, refreshKey, searchQuery, includeSceneClip, initialSnapshot });

  // Topic 9 layered fallback (grid|list only — tree visibility is now a
  // separate axis, hako w4zVT8-dyYwshLNiJ5REY). We approximate the
  // parent folder's dominant_kind from loaded files because the listing
  // endpoint only carries it for child folders (Phase 1 surface).
  const dominantKind = useMemo(() => deriveDominantKind(files), [files]);
  const folderViewMode = useFolderViewMode({
    drive: driveName,
    folderPath: folderPath ?? "",
    dominantKind,
  });
  // Clamp snapshot-restored viewMode to grid|list. Snapshots may carry
  // legacy "two-pane" strings from prior sessions; defensively coerce
  // to grid since the type is no longer valid.
  const snapshotMode = initialSnapshot?.filters.viewMode;
  const [globalViewMode, setGlobalViewMode] = useState<ViewMode>(
    snapshotMode === "grid" || snapshotMode === "list" ? snapshotMode : "grid",
  );
  const viewMode: ViewMode = isFolderContext ? folderViewMode.viewMode : globalViewMode;
  const { enabled: treeEnabled } = useTreeEnabled(driveName);
  const { fileId: selectedFileId } = useSelectedFile();
  const scrollContainerRef = useScrollContainer();
  // While the user is reading a file in the tree's right pane, the
  // FolderToolbar's folder-targeted actions (upload, new folder, sort, ...)
  // are noise — hide on every viewport.
  const hideToolbar = treeEnabled && selectedFileId !== null && selectedFileId.length > 0;

  const didRestoreScrollRef = useRef(false);
  useLayoutEffect(() => {
    if (didRestoreScrollRef.current) return;
    didRestoreScrollRef.current = true;
    if (hydratedScrollY == null) return;
    const container = scrollContainerRef?.current;
    // Thumbnails use aspect-video so container heights are stable before
    // images load — a synchronous scrollTo lands on the correct row. The rAF
    // follow-up corrects any late layout shifts (e.g. folder chips resolving).
    if (container) {
      container.scrollTop = hydratedScrollY;
      requestAnimationFrame(() => { container.scrollTop = hydratedScrollY; });
    } else {
      window.scrollTo({ top: hydratedScrollY });
      requestAnimationFrame(() => window.scrollTo({ top: hydratedScrollY }));
    }
  }, [hydratedScrollY, scrollContainerRef]);

  const isInitialSnapshotSaveRef = useRef(true);
  useEffect(() => {
    const container = scrollContainerRef?.current ?? null;
    let frame: number | null = null;

    const getScrollY = () => (container ? container.scrollTop : window.scrollY);

    const save = () => {
      frame = null;
      if (isRecent) return;
      // Don't persist search results into the folder/view snapshot —
      // snapshotKey doesn't include searchQuery, so saving here would
      // corrupt the root drive page's hydration.
      if (isSearch) return;
      if (files.length === 0) return;
      saveListSnapshot({
        key: snapshotKey,
        scrollY: getScrollY(),
        pagesLoaded,
        items: files,
        total,
        folders,
        filters: { sort, order, typeFilter, viewMode },
      });
    };

    const scheduleSave = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(save);
    };

    // Skip the very first effect pass so we don't overwrite a freshly loaded
    // snapshot with scrollY=0 before the restore layout effect has run.
    if (isInitialSnapshotSaveRef.current) {
      isInitialSnapshotSaveRef.current = false;
    } else {
      scheduleSave();
    }

    const scrollTarget: EventTarget = container ?? window;
    scrollTarget.addEventListener("scroll", scheduleSave, { passive: true } as AddEventListenerOptions);
    // pagehide fires at the last moment the page is alive; skip the rAF so
    // the synchronous write still lands before the document is torn down.
    window.addEventListener("pagehide", save);
    return () => {
      scrollTarget.removeEventListener("scroll", scheduleSave);
      window.removeEventListener("pagehide", save);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [files, folders, total, pagesLoaded, sort, order, typeFilter, viewMode, isRecent, isSearch, snapshotKey, scrollContainerRef]);

  const tSearch = useTranslations("search");
  const tCommon = useTranslations("common");
  const { pinnedPaths, handleTogglePin } = usePinnedFolders(driveName);
  const selection = useSelection();
  const clipboard = useClipboard();
  const tcb = useTranslations("clipboard");
  const tsc = useTranslations("shortcuts");
  const { scanning, handleScan } = useDriveScan(driveName, refresh);
  const createFolder = useCreateFolder(driveName, folderPath, refresh);
  // Phase 4: Cmd+N / "New File" only meaningful in a real folder
  // context. Special views (favorites, search, tag) have no concrete
  // target folder; we pass undefined to FolderToolbar and disable the
  // shortcut below so neither path can fire.
  const { createFile } = useCreateFile(driveName, folderPath ?? "");
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

  useShortcuts("file-browser", tsc("fileBrowser"), [
    {
      key: "ctrl+c",
      label: tsc("copy"),
      handler: () => {
        if (selection.selectedIds.size === 0) return;
        clipboard.copy([...selection.selectedIds], driveName, folderPath ?? "");
        selection.clear();
        setSelectable(false);
      },
    },
    {
      key: "ctrl+x",
      label: tsc("cut"),
      handler: () => {
        if (selection.selectedIds.size === 0) return;
        clipboard.cut([...selection.selectedIds], driveName, folderPath ?? "");
        selection.clear();
        setSelectable(false);
      },
    },
    {
      key: "ctrl+v",
      label: tsc("paste"),
      handler: () => {
        if (!clipboard.clipboard) return;
        handlePaste();
      },
    },
    {
      key: "ctrl+n",
      label: tsc("newFile"),
      handler: () => {
        // Special views (favorites, search, tag filter) don't have a
        // concrete folder target — Cmd+N is a no-op there.
        if (!isFolderContext) return;
        createFile();
      },
    },
  ]);

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

  // URL sync for search mode: typeFilter / sort / order changes update the URL
  // via replace (no history pollution per filter tweak). Default sort
  // for search is "relevance" (hybrid score) so omit it from the URL
  // to keep the canonical search URL clean.
  useEffect(() => {
    if (!isSearch || !searchQuery) return;
    const params = new URLSearchParams();
    params.set("q", searchQuery);
    if (typeFilter) params.set("type", typeFilter);
    if (sort !== "relevance") params.set("sort", sort);
    if (order !== "desc") params.set("order", order);
    if (smartFolderId) params.set("smart_folder_id", smartFolderId);
    const next = `/drive/${encodeURIComponent(driveName)}/search?${params.toString()}`;
    folderRouter.replace(next);
  }, [isSearch, searchQuery, typeFilter, sort, order, smartFolderId, driveName, folderRouter]);

  const handleViewChange = useCallback(
    (mode: ViewMode) => {
      if (isFolderContext) folderViewMode.setViewMode(mode);
      else setGlobalViewMode(mode);
    },
    [isFolderContext, folderViewMode],
  );

  const handleSemanticSelect = useCallback(
    (url: string) => {
      folderRouter.push(url);
    },
    [folderRouter],
  );

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

  // Search mode renders a virtual folder view: skip the UploadZone
  // wrapper (you can't drop files into search results) and the
  // clipboard paste banner (paste targets a folder path).
  const inner = (
    <div className="flex min-w-0 w-full flex-1 flex-col">
      {/* Outermost header row — Y-aligned with the file preview's
          PaneShell header (px-4 py-3) so TreeToggle sits at the same
          height regardless of folder/file/search mode. The breadcrumb
          / search title share this row; TreeToggle is leftmost. */}
      {isSearch ? (
        <header className="flex flex-wrap items-start gap-2 px-4 py-2">
          <TreeToggle drive={driveName} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-text-primary">
              {tSearch("heading", { query: searchQuery ?? "" })}
            </h1>
            {!loading && (
              <p className="mt-1 text-sm text-text-muted">
                {tCommon("items", { count: total })}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <SmartFolderSaveButton
              drive={driveName}
              query={searchQuery ?? ""}
              typeFilter={typeFilter}
              smartFolderId={smartFolderId ?? null}
            />
            <AddonSlot
              id="search-modes"
              layout="stack"
              props={{
                context: "page",
                query: searchQuery ?? "",
                drive: driveName,
                filter: typeFilter ?? "all",
                onSelect: handleSemanticSelect,
              }}
            />
          </div>
        </header>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2">
          <TreeToggle drive={driveName} />
          <Breadcrumb
            driveName={driveName}
            folderPath={folderPath}
            getDropTargetProps={dragState.isDragging ? getDropTargetProps : undefined}
            isDropTarget={dragState.isDragging ? isDropTarget : undefined}
          />
        </div>
      )}

      {!hideToolbar && <FolderToolbar
        isSpecialView={isSpecialView}
        isSearch={isSearch}
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
        folderPath={folderPath}
        viewMode={isFolderContext ? viewMode : undefined}
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
        onCreateFile={isFolderContext ? createFile : undefined}
      />}

      <div className="px-4 pb-6 pt-1 sm:pb-8 sm:pt-4">
      {!isSearch && clipboard.clipboard && (
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

      {/* Phase 3 unified results: filename-match and semantic hits live
          in the same FolderContent list (sourced via useFolderFiles +
          searchMerge). The search-modes slot now contributes header
          chips (e.g. Find handoff) only — no full-width section. */}
      {isSearch && !loading && files.length === 0 && (
        <EmptyState variant="no-results" />
      )}

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
        isSearch={isSearch}
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
    </div>
  );

  if (isSearch) return inner;
  return (
    <UploadZone drive={driveName} folderPath={folderPath ?? ""} onUploadComplete={refresh}>
      {inner}
    </UploadZone>
  );
}
