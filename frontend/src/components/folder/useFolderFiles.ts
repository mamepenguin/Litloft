"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { batchGetFiles, getDriveFiles, getFolders } from "@/lib/api";
import { getRecentFileIds } from "@/lib/recentlyPlayed";
import {
  buildListSnapshotKey,
  clearListSnapshot,
  type ListSnapshot,
} from "@/lib/listSnapshot";
import type { FileItem, FileType, Folder, SortField, SortOrder } from "@/types";
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
  /** Snapshot loaded once by the parent; used only on initial mount. */
  initialSnapshot?: ListSnapshot | null;
}

interface UseFolderFilesReturn {
  files: FileItem[];
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
  driveName, folderPath, view, tagFilter, typeFilter, sort, order, refreshKey, initialSnapshot,
}: UseFolderFilesParams): UseFolderFilesReturn {
  const isFavorites = view === "favorites";
  const isRecent = view === "recent";
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
    if (
      snap &&
      !isRecent &&
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

  const hydratedFoldersRef = useRef(hydration.folders != null);
  useEffect(() => {
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
  }, [driveName, folderPath, isSpecialView, tagFilter]);

  // Reset infinite scroll on filter/sort/drive changes (scroll to top).
  // On first render after hydration the key matches, so neither reset nor the
  // scrollTo fires — which is exactly what we want for restoration.
  const prevResetKeyRef = useRef("");
  useEffect(() => {
    const key = `${driveName}|${folderPath}|${view}|${tagFilter}|${typeFilter}|${sort}|${order}`;
    if (prevResetKeyRef.current && prevResetKeyRef.current !== key) {
      reset();
      clearListSnapshot();
      window.scrollTo({ top: 0 });
    }
    prevResetKeyRef.current = key;
  }, [driveName, folderPath, view, tagFilter, typeFilter, sort, order, reset]);

  // Refresh effect
  useEffect(() => {
    if (refreshKey === 0) return;
    if (!isSpecialView && !tagFilter) {
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
