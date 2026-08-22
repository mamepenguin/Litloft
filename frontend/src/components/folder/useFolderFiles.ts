"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { getDriveFiles, getFolders, getWatchHistory } from "@/lib/api";
import { useProfile } from "@/components/ProfileProvider";
import {
  buildListSnapshotKey,
  clearListSnapshot,
  type ListSnapshot,
} from "@/lib/listSnapshot";
import {
  mergeResults,
  sortMerged,
  type SemanticHit,
} from "@/lib/searchMerge";
import {
  fetchSemanticHits,
  isSemanticSearchAvailable,
} from "@/lib/semanticSearch";
import {
  readSearchCache,
  type SearchCacheEntry,
} from "@/lib/searchCache";
import type {
  FileItem,
  FileItemWithMatch,
  FileType,
  Folder,
  SortField,
  SortOrder,
} from "@/types";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";

/**
 * WS events that signal the file list (or folder list) might have
 * changed. Both the right pane and the tree pane subscribe to the same
 * set so they stay in sync after any structure-changing operation.
 */
// The core collapses its lifecycle events into two coarse signals before
// they reach the browser. The list watches both: a content write can change
// a title or a thumbnail, which is visible here even though the set of
// files did not change.
const STRUCTURE_EVENTS = ["drive.structure_changed", "drive.file_updated"];

interface UseFolderFilesParams {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
  typeFilter: FileType | null;
  sort: SortField;
  order: SortOrder;
  refreshKey: number;
  /**
   * When set (non-empty), the hook fetches results from the search
   * endpoint (`getDriveFiles({ search })`) instead of the
   * folder/view endpoints. Folders are not fetched in this mode.
   */
  searchQuery?: string;
  /**
   * When `true`, semantic-search includes scene-frame CLIP embeddings
   * alongside the default representative-frame route. Driven by the
   * scene-search toggle on the search page. Spec
   * `2026-05-02-thumbnail-clip-default-shallow-search.md`.
   */
  includeSceneClip?: boolean;
  /** Snapshot loaded once by the parent; used only on initial mount. */
  initialSnapshot?: ListSnapshot | null;
}

interface UseFolderFilesReturn {
  files: FileItemWithMatch[];
  folders: Folder[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  pagesLoaded: number;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  reset: () => void;
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  setPaginatedTotal: Dispatch<SetStateAction<number>>;
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  isRecent: boolean;
  hasProfile: boolean;
  snapshotKey: string;
  hydratedScrollY: number | null;
}

function filtersMatchSnapshot(
  snap: ListSnapshot,
  typeFilter: FileType | null,
  sort: SortField,
  order: SortOrder,
): boolean {
  return (
    snap.filters.sort === sort &&
    snap.filters.order === order &&
    (snap.filters.typeFilter ?? null) === (typeFilter ?? null)
  );
}

export function useFolderFiles({
  driveName, folderPath, view, tagFilter, typeFilter, sort, order, refreshKey, searchQuery, includeSceneClip, initialSnapshot,
}: UseFolderFilesParams): UseFolderFilesReturn {
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const isSearch = !!(searchQuery && searchQuery.trim());
  const isFavorites = view === "favorites";
  const isRecent = view === "recent" && !isSearch;
  const isRecentAdded = view === "recent-added";
  const isPopular = view === "popular";
  const isAll = view === "all";
  const isSpecialView = isFavorites || isRecent || isRecentAdded || isPopular || isAll;

  const snapshotKey = useMemo(
    () => buildListSnapshotKey({ driveName, folderPath, view, tagFilter }),
    [driveName, folderPath, view, tagFilter],
  );

  // Freeze hydration snapshot at mount via useState initializer; subsequent
  // prop changes cannot retroactively change what we hydrate with.
  const [hydration] = useState<{
    initial: { items: FileItem[]; total: number; page: number } | null;
    folders: Folder[] | null;
    scrollY: number | null;
    searchCache: SearchCacheEntry | null;
  }>(() => {
    // Search mode hydrates from searchCache (popup → page handoff)
    // before falling through to the folder snapshot path. The cache key
    // includes searchQuery, so it can't be confused with the root
    // drive page snapshot bug from spec
    // 2026-05-01-search-ui-rich-redesign Phase 1.
    if (isSearch && searchQuery) {
      const cached = readSearchCache({
        drive: driveName,
        query: searchQuery.trim(),
        type: typeFilter,
        includeSceneClip: !!includeSceneClip,
      });
      if (cached) {
        return {
          initial: {
            items: cached.filenameMatches,
            total: cached.filenameTotal,
            page: 1,
          },
          folders: null,
          scrollY: null,
          searchCache: cached,
        };
      }
    }

    const snap = initialSnapshot;
    // Search mode must never hydrate from a folder/view snapshot:
    // snapshotKey doesn't include searchQuery, so the root drive
    // page's snapshot would otherwise hydrate the search page with
    // stale (non-matching) items.
    if (
      snap &&
      !isRecent &&
      !isSearch &&
      snap.key === snapshotKey &&
      filtersMatchSnapshot(snap, typeFilter, sort, order)
    ) {
      return {
        initial: {
          items: snap.items,
          total: snap.total,
          page: Math.max(1, snap.pagesLoaded),
        },
        folders: snap.folders,
        scrollY: snap.scrollY,
        searchCache: null,
      };
    }
    return { initial: null, folders: null, scrollY: null, searchCache: null };
  });

  const [folders, setFolders] = useState<Folder[]>(() => hydration.folders ?? []);
  const shouldRevalidateHydratedSnapshot = hydration.initial != null && !isSearch && !isRecent;

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      if (isSearch) {
        // The filename-match backend doesn't understand "relevance" — fall
        // back to created_at desc on the server and let `sortMerged` reorder
        // by hybrid score on the client.
        const backendSort: SortField = sort === "relevance" ? "created_at" : sort;
        const backendOrder: SortOrder = sort === "relevance" ? "desc" : order;
        const res = await getDriveFiles(driveName, {
          search: searchQuery!.trim(),
          type: typeFilter || undefined,
          sort: backendSort,
          order: backendOrder,
          page,
          limit,
        });
        return { data: res.data, total: res.meta.total };
      }
      const res = await getDriveFiles(driveName, {
        // A tag filter no longer disqualifies the folder: it scopes to the
        // folder's subtree instead (spec 2026-08-21-folder-scoped-tag-filter).
        // `!folderPath` — not `folderPath ?? ""` — because at the drive root
        // there is no folder to scope to, and path="" would narrow the
        // result to root-level files rather than widen it to the drive (§3.1).
        path: isSpecialView || !folderPath ? undefined : folderPath,
        recursive: !!tagFilter,
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
    [isSearch, searchQuery, driveName, folderPath, sort, order, isFavorites, isSpecialView, isRecentAdded, isPopular, tagFilter, typeFilter],
  );

  const {
    items: paginatedFiles,
    total: paginatedTotal,
    loading: paginatedLoading,
    loadingMore,
    hasMore,
    pagesLoaded,
    sentinelRef,
    reset,
    setItems: setPaginatedFiles,
    setTotal: setPaginatedTotal,
  } = useInfiniteScroll<FileItem>({
    fetchPage,
    limit: 30,
    disabled: isRecent,
    initial: hydration.initial,
    revalidateInitial: shouldRevalidateHydratedSnapshot,
  });

  // Semantic search hits — loaded once per search query/drive/typeFilter.
  // The intelligence addon is the canonical provider; absence of the
  // addon (or the search feature) means filename-only fallback.
  // Hydrated from searchCache when the popup just handed off; otherwise
  // empty until the effect below resolves (stale-while-revalidate when
  // the cache hit is stale).
  const [semanticHits, setSemanticHits] = useState<SemanticHit[]>(
    () => hydration.searchCache?.semanticHits ?? [],
  );
  const [semanticLoading, setSemanticLoading] = useState(false);

  useEffect(() => {
    if (!isSearch) {
      setSemanticHits([]);
      setSemanticLoading(false);
      return;
    }
    const trimmed = searchQuery!.trim();
    if (!trimmed) return;
    const ctrl = new AbortController();
    setSemanticLoading(true);
    (async () => {
      const available = await isSemanticSearchAvailable(driveName);
      if (ctrl.signal.aborted) return;
      if (!available) {
        setSemanticHits([]);
        setSemanticLoading(false);
        return;
      }
      const hits = await fetchSemanticHits(trimmed, driveName, {
        limit: 50,
        type: typeFilter,
        includeSceneClip,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      setSemanticHits(hits);
      setSemanticLoading(false);
    })();
    return () => {
      ctrl.abort();
    };
  }, [isSearch, searchQuery, driveName, typeFilter, includeSceneClip]);

  // Recent view — server-side WatchHistory, scoped to this drive
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const fetchRecentFiles = useCallback(() => {
    if (!hasProfile) {
      setRecentFiles([]);
      return;
    }
    setRecentLoading(true);
    getWatchHistory(driveName, 50, "all").then((items) => {
      const filtered = typeFilter
        ? items.filter((f) => f.file_type === typeFilter)
        : items;
      setRecentFiles(filtered as FileItem[]);
    }).catch(() => {
      setRecentFiles([]);
    }).finally(() => {
      setRecentLoading(false);
    });
  }, [driveName, typeFilter, hasProfile]);

  useEffect(() => {
    if (isRecent) fetchRecentFiles();
  }, [isRecent, fetchRecentFiles]);

  // Merged list for search mode: filename matches + semantic hits with
  // per-file `match_meta`. Sort applied client-side because the two
  // result sources can't be combined server-side.
  const mergedSearch = useMemo(() => {
    if (!isSearch) return null;
    const merged = mergeResults({
      filenameMatches: paginatedFiles,
      semanticHits,
      filenameTotal: paginatedTotal,
    });
    return {
      files: sortMerged(merged.files, sort, order),
      total: merged.total,
    };
  }, [isSearch, paginatedFiles, semanticHits, paginatedTotal, sort, order]);

  // Pick the right source.
  const files: FileItemWithMatch[] = isRecent
    ? (recentFiles as FileItemWithMatch[])
    : mergedSearch
      ? mergedSearch.files
      : (paginatedFiles as FileItemWithMatch[]);
  const total = isRecent
    ? recentFiles.length
    : mergedSearch
      ? mergedSearch.total
      : paginatedTotal;
  const loading = isRecent
    ? recentLoading
    : isSearch
      ? paginatedLoading || semanticLoading
      : paginatedLoading;
  const setFiles = isRecent ? setRecentFiles : setPaginatedFiles;

  const hydratedFoldersRef = useRef(hydration.folders != null);
  useEffect(() => {
    if (isSearch) {
      setFolders([]);
      return;
    }
    if (!isSpecialView && !tagFilter) {
      if (hydratedFoldersRef.current && !shouldRevalidateHydratedSnapshot) {
        // Skip the initial folder fetch right after a pure restore. Folder
        // snapshots opt into revalidation so reload/back can refresh stale
        // directory contents without giving up scroll restoration.
        hydratedFoldersRef.current = false;
        return;
      }
      hydratedFoldersRef.current = false;
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    } else {
      setFolders([]);
    }
  }, [driveName, folderPath, isSpecialView, tagFilter, isSearch, shouldRevalidateHydratedSnapshot]);

  // Reset infinite scroll on filter/sort/drive changes (scroll to top).
  // On first render after hydration the key matches, so neither reset nor the
  // scrollTo fires — which is exactly what we want for restoration.
  const prevResetKeyRef = useRef("");
  useEffect(() => {
    const key = `${driveName}|${folderPath}|${view}|${tagFilter}|${typeFilter}|${sort}|${order}|${searchQuery ?? ""}`;
    if (prevResetKeyRef.current && prevResetKeyRef.current !== key) {
      reset();
      clearListSnapshot();
      window.scrollTo({ top: 0 });
    }
    prevResetKeyRef.current = key;
  }, [driveName, folderPath, view, tagFilter, typeFilter, sort, order, searchQuery, reset]);

  // Refresh effect — driven by the parent's refreshKey *and* by an
  // internal counter the WS subscription below bumps. Keeping the WS
  // signal local to this hook means every consumer (FolderBrowser,
  // RootFileListing, …) gets auto-sync without each parent threading
  // WS plumbing.
  const [wsRefreshKey, setWsRefreshKey] = useState(0);
  useWebSocketRefresh(
    STRUCTURE_EVENTS,
    () => {
      setWsRefreshKey((k) => k + 1);
    },
    driveName,
  );
  const combinedRefreshKey = refreshKey + wsRefreshKey;
  useEffect(() => {
    if (combinedRefreshKey === 0) return;
    if (!isSearch && !isSpecialView && !tagFilter) {
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    }
    if (isRecent) {
      fetchRecentFiles();
    } else {
      reset();
      clearListSnapshot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally triggered only by combinedRefreshKey
  }, [combinedRefreshKey]);

  return {
    files, folders, total, loading, loadingMore, hasMore, pagesLoaded, sentinelRef,
    reset, setFiles, setPaginatedTotal, setFolders, isRecent, hasProfile,
    snapshotKey,
    hydratedScrollY: hydration.scrollY,
  };
}
