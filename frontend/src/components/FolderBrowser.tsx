"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardPaste, FolderTree, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useUploadCompleted } from "@/hooks/useUpload";

import type { FileItem, FileKind, SortField, SortOrder, TrustFilter, ViewMode } from "@/types";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { SmartFolderController } from "@/components/SmartFolderSaveButton";
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
import { PassageList } from "@/components/search/PassageList";
import { passageCounts } from "@/lib/searchPassages";
import { buildWidenTagScope } from "@/components/folder/WidenTagScopeLink";
import { Button } from "@/components/Button";
import { parseSearchQuery } from "@/lib/searchQuery";
import { SearchQueryHeader } from "@/components/search/SearchQueryHeader";
import { ImageQueryDropTarget } from "@/components/search/ImageQueryDropTarget";

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
  /** `passages` selects the Passages view; anything else is Files. */
  show?: string | null;
  /** Given an image while image search is available for the drive. */
  onImageQuery?: (file: File) => void;
  imageError?: "too_large" | "unreadable" | "one_image" | null;
  imagePreparing?: boolean;
  onImageEdit?: () => void;
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
  show,
  onImageQuery,
  imageError,
  imagePreparing,
  onImageEdit,
}: FolderBrowserProps) {
  const isSearch = !!(searchQuery && searchQuery.trim());
  // The results bar's `…`, which the overwrite button hands focus to.
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const focusMoreTrigger = useCallback(() => {
    moreTriggerRef.current?.focus();
  }, []);
  const [initialSnapshot] = useState(() => {
    const snap = loadListSnapshot(buildListSnapshotKey({ driveName, folderPath, view, tagFilter }));
    return snap?.filters.sort === "random" ? null : snap;
  });

  const [localSort, setLocalSort] = useState<SortField>(
    initialSnapshot?.filters.sort ?? (isSearch ? "relevance" : "created_at"),
  );
  const [localOrder, setLocalOrder] = useState<SortOrder>(initialSnapshot?.filters.order ?? "desc");
  // On the search page the URL owns the type. Seeding this from the list
  // snapshot would let the drive root's key decide it, and a search is not a
  // listing of that folder.
  const [folderTypeFilter, setFolderTypeFilter] = useState<FileKind | null>(
    typeFilterProp ?? initialSnapshot?.filters.typeFilter ?? null,
  );
  const typeFilter: FileKind | null = isSearch
    ? typeFilterProp ?? null
    : folderTypeFilter;
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
  // Search results are not a listing of the drive, so an upload finishing
  // must not re-run the query they show.
  const refreshAfterUpload = useCallback(() => {
    if (!isSearch) refresh();
  }, [isSearch, refresh]);
  useUploadCompleted(driveName, refreshAfterUpload);

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
  // Strict: `!folderPath` is also true for a cross-folder view, which has no
  // location at all.
  const isLibraryRoot = folderPath === "";
  const isSpecialView = isFavorites || view === "recent" || view === "continue" || isRecentAdded || isLiked || isAll;
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
    files, folders, total, loading, loadingMore, hasMore, pagesLoaded, sentinelRef,
    reset, setFiles, setPaginatedTotal, isRecent, isContinue, hasProfile,
    snapshotKey, hydratedScrollY, continuationState, onShowMore, continuationSentinelRef,
    continuationDrawnIds, updateContinuationFile, removeContinuationFiles,
    passagesApplicable, passageGroups, passagesLoading, passagesFailed, retryPassages,
  } = useFolderFiles({ driveName, folderPath, view, tagFilter, typeFilter, trustFilter, sort, order, refreshKey, searchQuery, includeSceneClip, initialSnapshot });

  const isWatchHistory = isRecent || isContinue;

  const passagesView = isSearch && passagesApplicable && show === "passages";

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
      if (isWatchHistory) return;
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
  }, [files, folders, total, pagesLoaded, sort, order, typeFilter, trustFilter, viewMode, isWatchHistory, isSearch, snapshotKey, scrollContainerRef]);

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
  const passageGroupList = passageGroups ?? [];
  const passageTotals = passageCounts(passageGroupList);
  const passageCountLabel = tSearch("passageCount", {
    files: passageTotals.files,
    passages: passageTotals.passages,
  });
  const passageCountShort = tSearch("passageCountShort", {
    passages: passageTotals.passages,
  });
  const showPassageCount =
    passagesView && !passagesLoading && !passagesFailed;
  const { pinnedPaths, homePaths, handleTogglePin, handleToggleHome } = usePinnedFolders(driveName);
  const selection = useSelection();
  // `SelectionBar` clears before it reports a completed bulk action, so the
  // ids of that action are kept here for the continuation's own pruning.
  const clearedSelectionRef = useRef<string[]>([]);
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
  const urlParams = useSearchParams();
  const hasOperators = parseSearchQuery(searchQuery ?? "").hasOperators;

  // The type comes from the URL, so a URL change already wrote it. Keeping it
  // out of the sync effect's dependencies is what stops a replace from putting
  // back a type the URL no longer has; other writes still read the current one.
  const typeFilterRef = useRef(typeFilter);
  useEffect(() => {
    typeFilterRef.current = typeFilter;
  }, [typeFilter]);

  // A ref, not a dependency: `useSearchParams` returns a new object every
  // render, and the deps must stay the values that change what the URL says.
  const urlParamsRef = useRef(urlParams);
  urlParamsRef.current = urlParams;

  // URL sync for search mode: sort / order changes update the URL via replace
  // (no history pollution per filter tweak).
  useEffect(() => {
    if (!isSearch || !searchQuery) return;
    const params = new URLSearchParams();
    params.set("q", searchQuery);
    if (typeFilterRef.current) params.set("type", typeFilterRef.current);
    if (sort !== "relevance") params.set("sort", sort);
    if (order !== "desc") params.set("order", order);
    if (smartFolderId) params.set("smart_folder_id", smartFolderId);
    if (includeSceneClip) params.set("include_scene_clip", "true");
    if (show === "passages") params.set("show", "passages");
    // A route change already wrote these, so replacing them again would be a
    // second navigation for the same URL.
    if (params.toString() === urlParamsRef.current.toString()) return;
    const next = `/drive/${encodeURIComponent(driveName)}/search?${params.toString()}`;
    folderRouter.replace(next);
  }, [isSearch, searchQuery, sort, order, smartFolderId, includeSceneClip, show, driveName, folderRouter]);

  // A clear-filter action means "the same URL, without a type": built from
  // the parameters already there so that sort, order and anything this page
  // does not read travel with it.
  const clearTypeFilter = useCallback(() => {
    setTrustFilter(null);
    if (!isSearch) {
      setFolderTypeFilter(null);
      return;
    }
    const params = new URLSearchParams(urlParams.toString());
    params.delete("type");
    const qs = params.toString();
    folderRouter.push(
      `/drive/${encodeURIComponent(driveName)}/search${qs ? `?${qs}` : ""}`,
    );
  }, [driveName, folderRouter, isSearch, urlParams]);

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

  const handleSceneToggle = useCallback(
    (next: boolean) => {
      if (!isSearch) return;
      const params = new URLSearchParams();
      params.set("q", searchQuery ?? "");
      if (typeFilter) params.set("type", typeFilter);
      if (sort !== "relevance") params.set("sort", sort);
      if (order !== "desc") params.set("order", order);
      if (smartFolderId) params.set("smart_folder_id", smartFolderId);
      if (next) params.set("include_scene_clip", "true");
      if (show === "passages") params.set("show", "passages");
      folderRouter.replace(
        `/drive/${encodeURIComponent(driveName)}/search?${params.toString()}`,
      );
    },
    [
      isSearch,
      searchQuery,
      typeFilter,
      sort,
      order,
      smartFolderId,
      show,
      driveName,
      folderRouter,
    ],
  );

  const handleShowChange = useCallback(
    (next: "files" | "passages") => {
      if (!isSearch) return;
      if (next === "passages") {
        selection.clear();
        setSelectable(false);
      }
      const params = new URLSearchParams();
      params.set("q", searchQuery ?? "");
      if (typeFilter) params.set("type", typeFilter);
      if (sort !== "relevance") params.set("sort", sort);
      if (order !== "desc") params.set("order", order);
      if (smartFolderId) params.set("smart_folder_id", smartFolderId);
      if (includeSceneClip) params.set("include_scene_clip", "true");
      if (next === "passages") params.set("show", "passages");
      folderRouter.replace(
        `/drive/${encodeURIComponent(driveName)}/search?${params.toString()}`,
      );
      window.scrollTo({ top: 0 });
    },
    [
      isSearch,
      selection,
      searchQuery,
      typeFilter,
      sort,
      order,
      smartFolderId,
      includeSceneClip,
      driveName,
      folderRouter,
    ],
  );

  const handleFavoriteToggle = useCallback(
    (updated: FileItem) => {
      if (isFavorites) {
        setFiles((prev) =>
          updated.is_favorite
            ? prev.map((f) => (f.id === updated.id ? updated : f))
            : prev.filter((f) => f.id !== updated.id)
        );
        if (!updated.is_favorite && !isWatchHistory) {
          setPaginatedTotal((t) => t - 1);
        }
      } else {
        setFiles((prev) =>
          prev.map((f) => (f.id === updated.id ? updated : f))
        );
      }
      updateContinuationFile(updated);
    },
    [isFavorites, isWatchHistory, setFiles, setPaginatedTotal, updateContinuationFile],
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

  const countLabel =
    settledTotal === null ? null : tCommon("items", { count: settledTotal });

  const inner = (
    <PageFrame
      width="full"
      header={
        <PageHeader
          // No trail at the Library root: the row would put its title lower
          // than Home's and every other destination's.
          breadcrumb={
            isSearch || isLibraryRoot ? undefined : (
              <Breadcrumb
                driveName={driveName}
                folderPath={folderPath}
                getDropTargetProps={dragInFlight ? getDropTargetProps : undefined}
                isDropTarget={dragInFlight ? isDropTarget : undefined}
              />
            )
          }
          titleIcon={isLibraryRoot && !isSearch ? FolderTree : undefined}
          // Search names its subject in a heading because there is no path
          // to name it, and the Library root because it has no trail. A folder
          // is named by its trail, so it passes neither.
          title={
            isSearch
              ? tSearch("heading", { query: searchQuery ?? "" })
              : isLibraryRoot
                ? tSidebar("library")
                : undefined
          }
          titleField={
            isSearch ? (
              <SearchQueryHeader
                drive={driveName}
                query={searchQuery ?? ""}
                typeFilter={typeFilter}
                sort={sort}
                order={order}
                smartFolderId={smartFolderId ?? null}
                includeSceneClip={!!includeSceneClip}
                show={show}
                onImagePick={onImageQuery}
                onImagePaste={onImageQuery}
                onEdit={onImageEdit}
                imagePreparing={imagePreparing}
                onRemoveType={clearTypeFilter}
              />
            ) : undefined
          }
          scope={
            isLibraryRoot && !isSearch
              ? countLabel === null
                ? driveName
                : tCommon("driveScope", { drive: driveName, detail: countLabel })
              : !isSearch
                ? (countLabel ?? undefined)
                : undefined
          }
        />
      }
    >
      {imageError && (
        <p role="alert" className="px-4 pt-2 text-xs text-text-muted">
          {imageError === "too_large"
            ? tSearch("imageTooLarge")
            : imageError === "unreadable"
              ? tSearch("imageUnreadable")
              : tSearch("imageOneOnly")}
        </p>
      )}
      {(!hideToolbar || isSearch) && <FolderToolbar
        isSpecialView={isSpecialView}
        isWriteDestination={isWriteDestination}
        isSearch={isSearch}
        search={
          isSearch
            ? {
                passagesApplicable,
                show: passagesView ? "passages" : "files",
                onShowChange: handleShowChange,
                showSceneSearch: !hasOperators,
                sceneSearch: !!includeSceneClip,
                onSceneSearchChange: handleSceneToggle,
                countLabel,
                passageCountLabel: showPassageCount ? passageCountLabel : null,
                passageCountShort: showPassageCount ? passageCountShort : null,
                query: searchQuery ?? "",
                smartFolderId: smartFolderId ?? null,
                showFind: !hasOperators,
                onSelect: handleSemanticSelect,
                hideArranging: hideToolbar,
              }
            : undefined
        }
        isPassages={passagesView}
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
        onTypeFilterChange={setFolderTypeFilter}
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
        onReshuffle={handleReshuffle}
        isPinned={isFolderAnchored ? pinnedPaths.has(folderPath!) : undefined}
        onTogglePin={isFolderAnchored ? handleTogglePin : undefined}
        isOnHome={isFolderAnchored ? homePaths.has(folderPath!) : undefined}
        onToggleHome={isFolderAnchored ? handleToggleHome : undefined}
        moreTriggerRef={moreTriggerRef}
      />}

      {isSearch &&
        !hasOperators &&
        !(show === "passages" && (searchQuery ?? "").trim() !== "") && (
          <AddonSlot
            id="search-results-top"
            props={{
              query: searchQuery ?? "",
              drive: driveName,
              includeSceneClip: !!includeSceneClip,
              typeFilter,
              smartFolderId: smartFolderId ?? null,
            }}
          />
        )}

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

      {!passagesView && isSearch && !loading && files.length === 0 && (
        <EmptyState
          variant="no-results"
          // No primary: the way out of a search that found nothing is a
          // different search, and this page cannot write it for you.
          secondaryActions={
            typeFilter || trustFilter
              ? [
                  {
                    label: tFilter("clear"),
                    onClick: clearTypeFilter,
                  },
                ]
              : undefined
          }
        />
      )}

      {filePicker.input}
      {!passagesView && (
      <FolderContent
        files={files}
        folders={folders}
        driveName={driveName}
        widenTagScope={widenTagScope}
        onAddFiles={isWriteDestination ? filePicker.open : undefined}
        viewMode={viewMode}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        isRecent={isWatchHistory}
        isContinue={isContinue}
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
        {...(isSearch
          ? { continuationState, onShowMore, continuationSentinelRef }
          : {})}
      />
      )}

      {passagesView && (
        <PassageList
          state={
            passagesLoading
              ? "loading"
              : passagesFailed
                ? "failed"
                : passageGroupList.length === 0
                  ? "empty"
                  : "listed"
          }
          groups={passageGroupList}
          filesCount={files.length}
          onRetry={retryPassages}
          onShowFiles={() => handleShowChange("files")}
          onClearFilter={
            typeFilter || trustFilter ? clearTypeFilter : undefined
          }
        />
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
            clearedSelectionRef.current = [...selection.selectedIds];
            selection.clear();
            setSelectable(false);
          }}
          onComplete={(removed) => {
            const cleared = clearedSelectionRef.current;
            clearedSelectionRef.current = [];
            const onlyContinuation =
              cleared.length > 0 && cleared.every((id) => continuationDrawnIds.has(id));
            if (removed) removeContinuationFiles(cleared);
            if (!onlyContinuation) refresh();
          }}
        />
      )}
      </div>
    </PageFrame>
  );

  if (isSearch) {
    return (
      <>
        <SmartFolderController
          drive={driveName}
          query={searchQuery ?? ""}
          typeFilter={typeFilter}
          smartFolderId={smartFolderId ?? null}
          show={show}
          includeSceneClip={!!includeSceneClip}
          focusMoreTrigger={focusMoreTrigger}
        >
          {inner}
        </SmartFolderController>
        <ImageQueryDropTarget onImageQuery={onImageQuery} />
      </>
    );
  }
  return (
    <UploadZone drive={driveName} folderPath={folderPath ?? ""} className="flex-1 flex flex-col">
      {inner}
    </UploadZone>
  );
}
