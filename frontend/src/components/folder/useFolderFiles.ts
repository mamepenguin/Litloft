"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { batchGetFiles, getDriveFiles, getFolders } from "@/lib/api";
import { getRecentFileIds } from "@/lib/recentlyPlayed";
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
import type {
  FileItem,
  FileItemWithMatch,
  FileType,
  Folder,
  SortField,
  SortOrder,
} from "@/types";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

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
   * "シーン検索" toggle on the search page. Spec
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
  }>(() => {
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
      };
    }
    return { initial: null, folders: null, scrollY: null };
  });

  const [folders, setFolders] = useState<Folder[]>(() => hydration.folders ?? []);

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
  });

  // Semantic search hits — loaded once per search query/drive/typeFilter.
  // The intelligence addon is the canonical provider; absence of the
  // addon (or the search feature) means filename-only fallback.
  const [semanticHits, setSemanticHits] = useState<SemanticHit[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);

  useEffect(() => {
    if (!isSearch) {
      setSemanticHits([]);
      setSemanticLoading(false);
      return;
    }
    const trimmed = searchQuery!.trim();
    if (!trimmed) return;
    let cancelled = false;
    setSemanticLoading(true);
    (async () => {
      const available = await isSemanticSearchAvailable(driveName);
      if (cancelled) return;
      if (!available) {
        setSemanticHits([]);
        setSemanticLoading(false);
        return;
      }
      const hits = await fetchSemanticHits(trimmed, driveName, {
        limit: 50,
        type: typeFilter,
        includeSceneClip,
      });
      if (cancelled) return;
      setSemanticHits(hits);
      setSemanticLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSearch, searchQuery, driveName, typeFilter, includeSceneClip]);

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
      if (hydratedFoldersRef.current) {
        // Skip the initial folder fetch right after snapshot hydration —
        // subsequent refreshes / filter changes will still refetch below.
        hydratedFoldersRef.current = false;
        return;
      }
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    } else {
      setFolders([]);
    }
  }, [driveName, folderPath, isSpecialView, tagFilter, isSearch]);

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

  // Refresh effect
  useEffect(() => {
    if (refreshKey === 0) return;
    if (!isSearch && !isSpecialView && !tagFilter) {
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    }
    if (isRecent) {
      fetchRecentFiles();
    } else {
      reset();
      clearListSnapshot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally triggered only by refreshKey
  }, [refreshKey]);

  return {
    files, folders, total, loading, loadingMore, hasMore, pagesLoaded, sentinelRef,
    reset, setFiles, setPaginatedTotal, setFolders, isRecent,
    snapshotKey,
    hydratedScrollY: hydration.scrollY,
  };
}
