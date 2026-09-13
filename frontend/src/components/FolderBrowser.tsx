"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";

import type { FileItem, FileKind, SortField, SortOrder, TrustFilter, ViewMode } from "@/types";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageHeader } from "@/components/PageHeader";
import { TreeToggle } from "@/components/TreeToggle";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { SmartFolderSaveButton } from "@/components/SmartFolderSaveButton";
import { AddonSlot } from "@/components/AddonSlot";
import { EmptyState } from "@/components/EmptyState";
import { useFilePicker } from "@/components/useFilePicker";
import { useClipboard } from "@/components/ClipboardProvider";
import { useSelection } from "@/hooks/useSelection";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useFolderSort, useFolderViewMode } from "@/hooks/useFolderViewMode";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { useTreeVisible } from "@/hooks/useTreeVisible";
import { buildListSnapshotKey, clearListSnapshot, loadListSnapshot, saveListSnapshot } from "@/lib/listSnapshot";
import { useScrollContainer } from "@/lib/scrollContainer";
import { deriveDominantKind } from "@/lib/dominantKind";

import { useFolderFiles } from "@/components/folder/useFolderFiles";
import { usePinnedFolders } from "@/components/folder/usePinnedFolders";
import { useDriveScan } from "@/components/folder/useDriveScan";
import { useCreateFolder } from "@/components/folder/useCreateFolder";
import { useCreateFile } from "@/hooks/useCreateFile";
import { useIsInternalDragging } from "@/hooks/useIsInternalDragging";
import { useTreeRefresh } from "@/components/TreeRefreshContext";
import { FolderToolbar } from "@/components/folder/FolderToolbar";
import { FolderContent } from "@/components/folder/FolderContent";
import { buildWidenTagScope } from "@/components/folder/WidenTagScopeLink";
import { Button } from "@/components/Button";
import { isLibraryRootView } from "@/lib/driveViews";

/**
 * How long scrolling must be idle before the list snapshot is
 * re-persisted. Long enough that a continuous scroll writes once at the
 * end instead of once per frame, short enough that a quick flick
 * followed by a click still records where the user stopped.
 */
const SNAPSHOT_SAVE_DEBOUNCE_MS = 150;

interface FolderBrowserProps {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
  searchQuery?: string;
  typeFilter?: FileKind | null;
  smartFolderId?: string | null;
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
  const [initialSnapshot] = useState(() => {
    const snap = loadListSnapshot(buildListSnapshotKey({ driveName, folderPath, view, tagFilter }));
    return snap?.filters.sort === "random" ? null : snap;
  });

  const [localSort, setLocalSort] = useState<SortField>(
    initialSnapshot?.filters.sort ?? (isSearch ? "relevance" : "created_at"),
  );
  const [localOrder, setLocalOrder] = useState<SortOrder>(initialSnapshot?.filters.order ?? "desc");
  const [typeFilter, setTypeFilter] = useState<FileKind | null>(
    typeFilterProp ?? initialSnapshot?.filters.typeFilter ?? null,
  );
  // Not persisted into the list snapshot: the review queue is a deliberate,
  // short-lived mode, not a browsing preference to restore on return.
  const [trustFilter, setTrustFilter] = useState<TrustFilter | null>(null);
  // Search mixes filename matches with semantic hits, and the semantic source
  // ranks and truncates before the client ever sees the rows — post-filtering
  // that would silently under-report.
  const trustFilterAvailable = !isSearch;
  useEffect(() => {
    if (!trustFilterAvailable && trustFilter) setTrustFilter(null);
  }, [trustFilterAvailable, trustFilter]);
  const [selectable, setSelectable] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const refreshTree = useTreeRefresh();
  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === prevRefreshKeyRef.current) return;
    prevRefreshKeyRef.current = refreshKey;
    refreshTree();
  }, [refreshKey, refreshTree]);

  // Refresh when any drop completes in ANY pane (including cross-pane drops
  // where the file was dragged FROM this pane but dropped on the tree pane
  // or another pane — in that case this pane's onComplete is never called
  // directly, so the source still shows the moved file).
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("loft-move-complete", handler);
    return () => window.removeEventListener("loft-move-complete", handler);
  }, [refresh]);

  const isInternalDragging = useIsInternalDragging();

  const isFavorites = view === "favorites";
  const isRecentAdded = view === "recent-added";
  const isLiked = view === "liked";
  const isAll = view === "all";
  const isLibraryRoot = isLibraryRootView(view) && !folderPath;
  const isSpecialView = isFavorites || view === "recent" || isRecentAdded || isLiked || isAll;
  const isLocation = !isSpecialView && !isSearch && folderPath !== undefined;
  const isFolderAnchored = isLocation && folderPath !== "";

  // A different question from `isFolderAnchored`, which asks for a folder
  // *path* — a non-empty key. Per-folder sort, view mode and pinning need that
  // key and the root has none: the root is writable and deliberately not pinnable.
  const isWriteDestination =
    isLocation && (folderPath !== "" || !tagFilter);

  const widenTagScope = isFolderAnchored
    ? buildWidenTagScope(driveName, tagFilter)
    : null;

  const folderSort = useFolderSort({ drive: driveName, folderPath: folderPath ?? "" });
  const sort = isFolderAnchored ? folderSort.sort : localSort;
  const order = isFolderAnchored ? folderSort.order : localOrder;

  const {
    files, folders, total, loading, loadingMore, pagesLoaded, sentinelRef,
    reset, setFiles, setPaginatedTotal, isRecent, hasProfile,
    snapshotKey, hydratedScrollY,
  } = useFolderFiles({ driveName, folderPath, view, tagFilter, typeFilter, trustFilter, sort, order, refreshKey, searchQuery, includeSceneClip, initialSnapshot });

  // Approximate the parent folder's dominant_kind from loaded files because the
  // listing endpoint only carries it for child folders.
  const dominantKind = useMemo(() => deriveDominantKind(files), [files]);
  const folderViewMode = useFolderViewMode({
    drive: driveName,
    folderPath: folderPath ?? "",
    dominantKind,
  });
  // Snapshots may carry legacy "two-pane" strings from prior sessions.
  const snapshotMode = initialSnapshot?.filters.viewMode;
  const [globalViewMode, setGlobalViewMode] = useState<ViewMode>(
    snapshotMode === "grid" || snapshotMode === "list" ? snapshotMode : "grid",
  );
  const viewMode: ViewMode = isFolderAnchored ? folderViewMode.viewMode : globalViewMode;
  // The effective state: this asks what is on screen, and below `md` a
  // stored "on" is suppressed. Reading the stored key here would hide the
  // toolbar for a pane that is not there.
  const { visible: treeVisible } = useTreeVisible(driveName);
  const { fileId: selectedFileId } = useSelectedFile();
  const scrollContainerRef = useScrollContainer();
  const hideToolbar = treeVisible && selectedFileId !== null && selectedFileId.length > 0;

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
  const flushSnapshotRef = useRef<(() => void) | null>(null);
  // Last scroll offset observed while this component's DOM was still
  // mounted. `save` persists THIS, never a fresh DOM read: the scroll
  // container belongs to TwoPaneLayout and outlives us, so by the time
  // the unmount flush runs the container has collapsed and `scrollTop` reads 0.
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    const container = scrollContainerRef?.current ?? null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const rememberScrollY = () => {
      lastScrollYRef.current = container ? container.scrollTop : window.scrollY;
    };
    // Mount and every dependency change: the DOM is alive here, and the
    // restore layout effect has already run, so this picks up a
    // hydrated offset even when the user has not scrolled yet.
    rememberScrollY();

    const save = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      if (isRecent) return;
      // Don't persist search results into the folder/view snapshot —
      // snapshotKey doesn't include searchQuery, so saving here would
      // corrupt the root drive page's hydration.
      if (isSearch) return;
      if (sort === "random") return;
      if (files.length === 0) return;
      // A trust-filtered listing is a subset. Saving it under the ordinary
      // key would rehydrate those rows as the complete folder on return —
      // and keep them if revalidation then fails.
      if (trustFilter) return;
      saveListSnapshot({
        key: snapshotKey,
        scrollY: lastScrollYRef.current,
        pagesLoaded,
        items: files,
        total,
        folders,
        filters: { sort, order, typeFilter, viewMode },
      });
    };

    const scheduleSave = () => {
      rememberScrollY();
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(save, SNAPSHOT_SAVE_DEBOUNCE_MS);
    };

    // `pagehide` still has a live DOM, so refresh before writing.
    const saveNow = () => {
      rememberScrollY();
      save();
    };

    // Skip the very first effect pass so we don't overwrite a freshly loaded
    // snapshot with scrollY=0 before the restore layout effect has run.
    if (isInitialSnapshotSaveRef.current) {
      isInitialSnapshotSaveRef.current = false;
    } else {
      scheduleSave();
    }

    flushSnapshotRef.current = save;

    const scrollTarget: EventTarget = container ?? window;
    scrollTarget.addEventListener("scroll", scheduleSave, { passive: true } as AddEventListenerOptions);
    // pagehide fires at the last moment the page is alive; skip the debounce
    // so the synchronous write still lands before the document is torn down.
    window.addEventListener("pagehide", saveNow);
    return () => {
      scrollTarget.removeEventListener("scroll", scheduleSave);
      window.removeEventListener("pagehide", saveNow);
      // Dropping a pending write is safe here but not on unmount: this
      // cleanup runs on every dependency change, and the next effect
      // pass immediately re-schedules. Unmount has no next pass, so it
      // is handled separately below.
      if (timer != null) clearTimeout(timer);
    };
  }, [files, folders, total, pagesLoaded, sort, order, typeFilter, trustFilter, viewMode, isRecent, isSearch, snapshotKey, scrollContainerRef]);

  // Flush a pending snapshot write on unmount. `pagehide` covers a real
  // page teardown, but an in-app navigation unmounts this component
  // without firing it, and the debounce means a write is usually still
  // pending — dropping it would lose the scroll position the user is
  // about to come back to.
  useEffect(() => () => { flushSnapshotRef.current?.(); }, []);

  const handleReshuffle = useCallback(() => {
    reset();
    clearListSnapshot();
  }, [reset]);

  const tSidebar = useTranslations("sidebar");
  const tSearch = useTranslations("search");
  const tFilter = useTranslations("filter");
  const tCommon = useTranslations("common");
  const { pinnedPaths, handleTogglePin } = usePinnedFolders(driveName);
  const selection = useSelection();
  const clipboard = useClipboard();
  const tcb = useTranslations("clipboard");
  const tsc = useTranslations("shortcuts");
  const { scanning, handleScan } = useDriveScan(driveName, refresh);
  const createFolder = useCreateFolder(driveName, folderPath, refresh);
  const { createFile } = useCreateFile(driveName, folderPath ?? "");
  const filePicker = useFilePicker();
  const [pasting, setPasting] = useState(false);

  const handlePaste = useCallback(async () => {
    // The guard is here rather than on each way in, because a screen with
    // nowhere to write is not a screen where pasting should fail — it is
    // one where nothing happens at all, and every caller has to agree.
    if (!isWriteDestination) return;
    if (!clipboard.clipboard || pasting) return;
    setPasting(true);
    try {
      await clipboard.paste(driveName, folderPath ?? "");
      refresh();
    } catch {
    } finally {
      setPasting(false);
    }
  }, [clipboard, driveName, folderPath, isWriteDestination, pasting, refresh]);

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
        if (!isWriteDestination) return;
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
  // via replace (no history pollution per filter tweak).
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
      if (isFolderAnchored) folderViewMode.setViewMode(mode);
      else setGlobalViewMode(mode);
    },
    [isFolderAnchored, folderViewMode],
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

  const effectiveSort = isRecentAdded ? "created_at" : isLiked ? "liked_at" : sort;
  const effectiveOrder = isRecentAdded || isLiked ? "desc" : order;
  /**
   * Handed to the file links as `nav=folder`. The detail pane cannot work
   * this out for itself: `/files/{id}` redirects to the file's own
   * folder and drops `view` / `q` / `tag` / `smart_folder_id`, and
   * `typeFilter` / `trustFilter` were never in the URL at all.
   */
  const listingIsPlainFolder =
    // Not `isFolderAnchored`: that asks for a folder *path*, and the
    // drive root has none while still being a folder.
    folderPath !== undefined &&
    !isSpecialView &&
    !isSearch &&
    !tagFilter &&
    !typeFilter &&
    !trustFilter &&
    effectiveSort !== "random";

  const sortQuery = effectiveSort === "random"
    ? ""
    : `?sort=${effectiveSort}&order=${effectiveOrder}` +
      (listingIsPlainFolder ? "&nav=folder" : "");

  const hasPlayableFiles = files.some(
    (f) => f.file_type === "audio" || f.file_type === "video"
  );

  // Depend on the individual callbacks, not on `selection` itself:
  // `useSelection` returns a fresh object literal every render, so
  // `[selection]` would defeat `FileCard`'s memo.
  const { toggle: toggleSelection, selectRange } = selection;

  const handleMetaSelect = useCallback((id: string) => {
    setSelectable(true);
    toggleSelection(id);
  }, [toggleSelection]);

  const handleShiftSelect = useCallback((id: string) => {
    selectRange(files.map((f) => f.id), id);
  }, [selectRange, files]);

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

  // `!loading` is not enough to adopt a `total`: `reset()` lives in an effect,
  // so on the render where the subject changes the hook still reports
  // `loading: false` and the *previous* subject's `total`. A subject becomes
  // trustworthy at mount or once a fetch for it has been seen to start.
  const countedSubject = [
    driveName,
    folderPath ?? "",
    view ?? "",
    tagFilter ?? "",
    typeFilter ?? "",
    searchQuery ?? "",
    // NUL, because it cannot occur in a path, a tag or a query.
  ].join("\u0000");

  // Deliberately absent: `sort` and `order`. They reset the listing, but they
  // reorder the same set, so the count is still true and hiding it would be a
  // flicker with nothing behind it.
  const [trusted, setTrusted] = useState<string | null>(countedSubject);
  if (trusted !== null && trusted !== countedSubject) setTrusted(null);
  if (trusted === null && loading) setTrusted(countedSubject);

  const [settled, setSettled] = useState<{ subject: string; total: number } | null>(
    null,
  );
  if (
    !loading &&
    trusted === countedSubject &&
    (settled === null || settled.subject !== countedSubject || settled.total !== total)
  ) {
    setSettled({ subject: countedSubject, total });
  }
  const settledTotal =
    settled !== null && settled.subject === countedSubject ? settled.total : null;

  const dragInFlight = dragState.isDragging || isInternalDragging;

  const inner = (
    <div className="flex min-w-0 w-full flex-1 flex-col">
      <PageHeader
        leading={<TreeToggle drive={driveName} />}
        breadcrumb={
          isSearch ? undefined : (
            <Breadcrumb
              driveName={driveName}
              folderPath={folderPath}
              driveIsAncestor={isLibraryRoot}
              getDropTargetProps={dragInFlight ? getDropTargetProps : undefined}
              isDropTarget={dragInFlight ? isDropTarget : undefined}
            />
          )
        }
        // Search names its subject in a heading because there is no path
        // to name it, and the Library root because its trail stops at the
        // drive. A folder is named by its trail, so it passes neither.
        title={
          isSearch
            ? tSearch("heading", { query: searchQuery ?? "" })
            : isLibraryRoot
              ? tSidebar("library")
              : undefined
        }
        // `settledTotal`, not `total`: a refetch sets `total` to 0 and
        // `loading` to true together, so neither raw value can be shown.
        scope={
          settledTotal === null
            ? undefined
            : tCommon("items", { count: settledTotal })
        }
        actions={
          isSearch ? (
            <>
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
                  query: searchQuery ?? "",
                  drive: driveName,
                  filter: typeFilter ?? "all",
                  onSelect: handleSemanticSelect,
                }}
              />
            </>
          ) : undefined
        }
      />

      {!hideToolbar && <FolderToolbar
        isSpecialView={isSpecialView}
        isWriteDestination={isWriteDestination}
        isSearch={isSearch}
        tagFilter={tagFilter}
        hasPlayableFiles={hasPlayableFiles}
        sort={sort}
        order={order}
        typeFilter={typeFilter}
        total={total}
        folderCount={folders.length}
        selectable={selectable}
        scanning={scanning}
        creatingFolder={createFolder.creatingFolder}
        newFolderName={createFolder.newFolderName}
        folderError={createFolder.folderError}
        fileIds={files.map((f) => f.id)}
        drive={driveName}
        folderPath={folderPath}
        viewMode={isFolderAnchored ? viewMode : undefined}
        widenTagScope={widenTagScope}
        onSortChange={(s, o) => {
          if (isFolderAnchored) folderSort.setSort(s, o);
          else { setLocalSort(s); setLocalOrder(o); }
        }}
        onTypeFilterChange={setTypeFilter}
        trustFilter={trustFilter}
        onTrustFilterChange={trustFilterAvailable ? setTrustFilter : undefined}
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
        onCreateFile={isWriteDestination ? createFile : undefined}
        onReshuffle={handleReshuffle}
        isPinned={isFolderAnchored ? pinnedPaths.has(folderPath!) : undefined}
        onTogglePin={isFolderAnchored ? handleTogglePin : undefined}
      />}

      <div className="px-4 pb-6 pt-1 sm:pb-8 sm:pt-4">
      {isWriteDestination && clipboard.clipboard && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-accent/10 px-4 py-2.5 ring-1 ring-accent/20">
          <ClipboardPaste size={18} className="flex-shrink-0 text-accent" />
          <span className="flex-1 text-sm text-text-primary">
            {tcb("pasteCount", {
              count: clipboard.clipboard.fileIds.length,
              mode: clipboard.clipboard.mode === "copy" ? tcb("modeCopy") : tcb("modeCut"),
            })}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={handlePaste}
            disabled={pasting}
          >
            {tcb("pasteHere")}
          </Button>
          <button
            onClick={clipboard.clear}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-primary"
            aria-label={tcb("clear")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {isSearch && !loading && files.length === 0 && (
        <EmptyState
          variant="no-results"
          // No primary: the way out of a search that found nothing is a
          // different search, and this page cannot write it for you.
          secondaryActions={
            typeFilter || trustFilter
              ? [
                  {
                    label: tFilter("clear"),
                    onClick: () => {
                      setTypeFilter(null);
                      setTrustFilter(null);
                    },
                  },
                ]
              : undefined
          }
        />
      )}

      {filePicker.input}
      <FolderContent
        files={files}
        folders={folders}
        driveName={driveName}
        widenTagScope={widenTagScope}
        onAddFiles={isWriteDestination ? filePicker.open : undefined}
        onCreateFile={isWriteDestination ? createFile : undefined}
        viewMode={viewMode}
        loading={loading}
        loadingMore={loadingMore}
        isRecent={isRecent}
        hasProfile={hasProfile}
        isFavorites={isFavorites}
        isLiked={isLiked}
        isRecentAdded={isRecentAdded}
        isSearch={isSearch}
        selectable={selectable}
        sortQuery={sortQuery}
        pinnedPaths={pinnedPaths}
        sentinelRef={sentinelRef}
        dragState={dragState}
        isDropTarget={isDropTarget}
        getDropTargetProps={getDropTargetProps}
        selectedIds={selection.selectedIds}
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
    <UploadZone drive={driveName} folderPath={folderPath ?? ""} onUploadComplete={refresh} className="flex-1 flex flex-col">
      {inner}
    </UploadZone>
  );
}
