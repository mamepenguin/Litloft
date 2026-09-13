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
  FileKind,
  Folder,
  SortField,
  SortOrder,
  TrustFilter,
} from "@/types";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";

// A content write can change a title or a thumbnail, which is visible here
// even though the set of files did not change.
const STRUCTURE_EVENTS = ["drive.structure_changed", "drive.file_updated"];

interface UseFolderFilesParams {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
  typeFilter: FileKind | null;
  trustFilter?: TrustFilter | null;
  sort: SortField;
  order: SortOrder;
  refreshKey: number;
  searchQuery?: string;
  includeSceneClip?: boolean;
  /** Used only on initial mount. */
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

export function matchesTrustFilter(
  file: Pick<FileItem, "trust_tier" | "trust_reviewed_at" | "trust_unknown">,
  trustFilter: TrustFilter | null | undefined,
): boolean {
  if (!trustFilter) return true;
  // A hit core could not hydrate has no real tier. Admitting it would let it
  // satisfy every filter at once, so it is dropped while one is active.
  if (file.trust_unknown) return false;
  if (trustFilter === "unreviewed") return file.trust_reviewed_at === null;
  return file.trust_tier === trustFilter;
}

function filtersMatchSnapshot(
  snap: ListSnapshot,
  typeFilter: FileKind | null,
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
  driveName, folderPath, view, tagFilter, typeFilter, trustFilter, sort, order, refreshKey, searchQuery, includeSceneClip, initialSnapshot,
}: UseFolderFilesParams): UseFolderFilesReturn {
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const isSearch = !!(searchQuery && searchQuery.trim());
  const isFavorites = view === "favorites";
  const isRecent = view === "recent" && !isSearch;
  const isRecentAdded = view === "recent-added";
  const isLiked = view === "liked";
  const isAll = view === "all";
  const isSpecialView = isFavorites || isRecent || isRecentAdded || isLiked || isAll;

  const snapshotKey = useMemo(
    () => buildListSnapshotKey({ driveName, folderPath, view, tagFilter }),
    [driveName, folderPath, view, tagFilter],
  );

  const [hydration] = useState<{
    initial: { items: FileItem[]; total: number; page: number } | null;
    folders: Folder[] | null;
    scrollY: number | null;
    searchCache: SearchCacheEntry | null;
  }>(() => {
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
        // The filename-match backend doesn't understand "relevance";
        // `sortMerged` reorders by hybrid score on the client.
        const backendSort: SortField = sort === "relevance" ? "created_at" : sort;
        const backendOrder: SortOrder = sort === "relevance" ? "desc" : order;
        const res = await getDriveFiles(driveName, {
          search: searchQuery!.trim(),
          type: typeFilter || undefined,
          trust: trustFilter || undefined,
          sort: backendSort,
          order: backendOrder,
          page,
          limit,
        });
        return { data: res.data, total: res.meta.total };
      }
      const res = await getDriveFiles(driveName, {
        // The folder path is passed straight through, `""` included: a
        // **non-recursive** `path=""` is an exact `folder_path` match and
        // so asks for the root's own children, while omitting `path`
        // applies no folder predicate and asks for the whole drive.
        // `path=""` *with* `recursive` is the drive again.
        path: isSpecialView ? undefined : folderPath,
        recursive: !!tagFilter,
        favorite: isFavorites ? true : undefined,
        liked: isLiked ? true : undefined,
        tag: tagFilter || undefined,
        type: typeFilter || undefined,
        trust: trustFilter || undefined,
        sort: isRecentAdded ? "created_at" : isLiked ? "liked_at" : sort,
        order: isRecentAdded || isLiked ? "desc" : order,
        page,
        limit,
      });
      return { data: res.data, total: res.meta.total };
    },
    [isSearch, searchQuery, driveName, folderPath, sort, order, isFavorites, isSpecialView, isRecentAdded, isLiked, tagFilter, typeFilter, trustFilter],
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

  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const fetchRecentFiles = useCallback(() => {
    if (!hasProfile) {
      setRecentFiles([]);
      return;
    }
    setRecentLoading(true);
    // The kind goes to the server: `file_type` is a column that never
    // holds `markdown` or `pdf`. Trust has no server parameter on this
    // endpoint.
    getWatchHistory(driveName, 50, "all", typeFilter).then((items) => {
      const filtered = items.filter((f) => matchesTrustFilter(f, trustFilter));
      setRecentFiles(filtered as FileItem[]);
    }).catch(() => {
      setRecentFiles([]);
    }).finally(() => {
      setRecentLoading(false);
    });
  }, [driveName, typeFilter, trustFilter, hasProfile]);

  useEffect(() => {
    if (isRecent) fetchRecentFiles();
  }, [isRecent, fetchRecentFiles]);

  const mergedSearch = useMemo(() => {
    if (!isSearch) return null;
    const merged = mergeResults({
      filenameMatches: paginatedFiles,
      semanticHits,
      filenameTotal: paginatedTotal,
    });
    // The semantic source cannot take the `trust` parameter, so its hits
    // arrive unfiltered.
    const kept = merged.files.filter((f) => matchesTrustFilter(f, trustFilter));
    return {
      files: sortMerged(kept, sort, order),
      total: merged.total - (merged.files.length - kept.length),
    };
  }, [isSearch, paginatedFiles, semanticHits, paginatedTotal, sort, order, trustFilter]);

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
        hydratedFoldersRef.current = false;
        return;
      }
      hydratedFoldersRef.current = false;
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    } else {
      setFolders([]);
    }
  }, [driveName, folderPath, isSpecialView, tagFilter, isSearch, shouldRevalidateHydratedSnapshot]);

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
