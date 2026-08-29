"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";

import type { FileItem, FileType, SortField, SortOrder, TrustFilter, ViewMode } from "@/types";
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
import { useFolderSort, useFolderViewMode } from "@/hooks/useFolderViewMode";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { useTreeEnabled } from "@/hooks/useTreeEnabled";
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
  const [initialSnapshot] = useState(() => {
    const snap = loadListSnapshot(buildListSnapshotKey({ driveName, folderPath, view, tagFilter }));
    return snap?.filters.sort === "random" ? null : snap;
  });

  // Search mode defaults to relevance (hybrid score on the merged
  // filename + semantic list); folder/view browsing keeps created_at.
  const [localSort, setLocalSort] = useState<SortField>(
    initialSnapshot?.filters.sort ?? (isSearch ? "relevance" : "created_at"),
  );
  const [localOrder, setLocalOrder] = useState<SortOrder>(initialSnapshot?.filters.order ?? "desc");
  const [typeFilter, setTypeFilter] = useState<FileType | null>(
    typeFilterProp ?? initialSnapshot?.filters.typeFilter ?? null,
  );
  // Not persisted into the list snapshot: the review queue is a deliberate,
  // short-lived mode, not a browsing preference to restore on return.
  const [trustFilter, setTrustFilter] = useState<TrustFilter | null>(null);
  // Search mixes filename matches with semantic hits, and the semantic source
  // ranks and truncates before the client ever sees the rows — post-filtering
  // that would silently under-report. Until the addon can take the predicate
  // itself, the chip is withheld here rather than shown while lying.
  const trustFilterAvailable = !isSearch;
  useEffect(() => {
    if (!trustFilterAvailable && trustFilter) setTrustFilter(null);
  }, [trustFilterAvailable, trustFilter]);
  const [selectable, setSelectable] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Propagate right-pane mutations to the tree pane as an explicit
  // out-of-band refresh (complements the WS-based refresh already in
  // FolderTreePane.useWebSocketRefresh).
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

  // True while any pane has an internal (move) drag in progress — used
  // to gate drop targets for cross-pane drag-and-drop.
  const isInternalDragging = useIsInternalDragging();

  const isFavorites = view === "favorites";
  const isRecentAdded = view === "recent-added";
  const isPopular = view === "popular";
  const isAll = view === "all";
  const isSpecialView = isFavorites || view === "recent" || isRecentAdded || isPopular || isAll;
  // Is there a concrete folder we are anchored to? This is the question
  // the per-folder preferences and the create-file actions actually ask,
  // and a folder-scoped tag filter answers it yes: the breadcrumb shows a
  // folder and the listing is scoped to its subtree (spec
  // 2026-08-21-folder-scoped-tag-filter §6). It is false at the drive
  // root, in the flat virtual views (favorites/recent/...), and in search,
  // which render no single folder.
  //
  // It replaced `isFolderContext`, a single flag that stood for three
  // different questions and so was easy to misread as "folder support is
  // handled" (hako a8r4bT7Wt1LQ6IBPTBm7N).
  const isFolderAnchored = !isSpecialView && !isSearch && !!folderPath;

  // With folder scope as the default, the drive-wide view needs an
  // explicit door. Derived once here and handed to both consumers (the
  // toolbar header and the empty state) so they cannot disagree about
  // when it is offered (spec 2026-08-21-folder-scoped-tag-filter §8).
  const widenTagScope = isFolderAnchored
    ? buildWidenTagScope(driveName, tagFilter)
    : null;

  // Per-folder sort preference (localStorage folderPrefs:{drive}).
  // Active only when folder-anchored; search/special views use localSort/localOrder.
  const folderSort = useFolderSort({ drive: driveName, folderPath: folderPath ?? "" });
  const sort = isFolderAnchored ? folderSort.sort : localSort;
  const order = isFolderAnchored ? folderSort.order : localOrder;

  const {
    files, folders, total, loading, loadingMore, hasMore, pagesLoaded, sentinelRef,
    reset, setFiles, setPaginatedTotal, setFolders, isRecent, hasProfile,
    snapshotKey, hydratedScrollY,
  } = useFolderFiles({ driveName, folderPath, view, tagFilter, typeFilter, trustFilter, sort, order, refreshKey, searchQuery, includeSceneClip, initialSnapshot });

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
  const viewMode: ViewMode = isFolderAnchored ? folderViewMode.viewMode : globalViewMode;
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
  // Holds the current effect's `save` so the unmount-only effect below
  // can flush it. Reassigned on every effect run.
  const flushSnapshotRef = useRef<(() => void) | null>(null);
  // Last scroll offset observed while this component's DOM was still
  // mounted. `save` persists THIS, never a fresh DOM read: the scroll
  // container belongs to TwoPaneLayout and outlives us, so by the time
  // the unmount flush runs React has already removed our rows, the
  // container has collapsed, and `scrollTop` reads 0. Reading it there
  // overwrote a good offset with zero on every in-app navigation.
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

    // Trailing debounce rather than once-per-animation-frame. Measured
    // 2026-08-21 (spec 2026-08-21-file-list-deep-scroll-cost §5.4): at
    // 995 items the write is ~3 ms and fired ~115 times a second while
    // scrolling — about a third of the frame budget spent re-persisting
    // a snapshot nobody reads until the next navigation. It did not
    // drop frames on the machine measured, so this is insurance for
    // slower devices rather than a fix for an observed stall.
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
        // Search and the flat virtual views have no concrete folder
        // target — Cmd+N is a no-op there. A folder-scoped tag filter
        // does have one, and creates into the anchored folder (§6.1).
        if (!isFolderAnchored) return;
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

  const effectiveSort = isRecentAdded ? "created_at" : isPopular ? "likes" : sort;
  const effectiveOrder = isRecentAdded || isPopular ? "desc" : order;
  const sortQuery = effectiveSort === "random"
    ? ""
    : `?sort=${effectiveSort}&order=${effectiveOrder}`;

  const hasPlayableFiles = files.some(
    (f) => f.file_type === "audio" || f.file_type === "video"
  );

  // Depend on the individual callbacks, not on `selection` itself:
  // `useSelection` returns a fresh object literal every render, so
  // `[selection]` would make these handlers change identity on every
  // render and defeat `FileCard`'s memo for all 995 cards — the same
  // failure as the `isSelected` predicate these replaced (spec
  // `2026-08-21-file-list-deep-scroll-cost` §6.3).
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
            getDropTargetProps={(dragState.isDragging || isInternalDragging) ? getDropTargetProps : undefined}
            isDropTarget={(dragState.isDragging || isInternalDragging) ? isDropTarget : undefined}
          />
        </div>
      )}

      {!hideToolbar && <FolderToolbar
        isSpecialView={isSpecialView}
        isFolderAnchored={isFolderAnchored}
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
        onCreateFile={isFolderAnchored ? createFile : undefined}
        onReshuffle={handleReshuffle}
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
        widenTagScope={widenTagScope}
        viewMode={viewMode}
        loading={loading}
        loadingMore={loadingMore}
        isRecent={isRecent}
        hasProfile={hasProfile}
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
