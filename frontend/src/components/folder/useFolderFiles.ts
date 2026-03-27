"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { batchGetFiles, getDriveFiles, getFolders } from "@/lib/api";
import { getRecentFileIds } from "@/lib/recentlyPlayed";
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
}

interface UseFolderFilesReturn {
  files: FileItem[];
  folders: Folder[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  reset: () => void;
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  setPaginatedTotal: Dispatch<SetStateAction<number>>;
  setFolders: Dispatch<SetStateAction<Folder[]>>;
  isRecent: boolean;
}

export function useFolderFiles({
  driveName, folderPath, view, tagFilter, typeFilter, sort, order, refreshKey,
}: UseFolderFilesParams): UseFolderFilesReturn {
  const isFavorites = view === "favorites";
  const isRecent = view === "recent";
  const isRecentAdded = view === "recent-added";
  const isPopular = view === "popular";
  const isAll = view === "all";
  const isSpecialView = isFavorites || isRecent || isRecentAdded || isPopular || isAll;

  const [folders, setFolders] = useState<Folder[]>([]);

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
    sentinelRef,
    reset,
    setItems: setPaginatedFiles,
    setTotal: setPaginatedTotal,
  } = useInfiniteScroll<FileItem>({ fetchPage, limit: 30, disabled: isRecent });

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

  useEffect(() => {
    if (!isSpecialView && !tagFilter) {
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    } else {
      setFolders([]);
    }
  }, [driveName, folderPath, isSpecialView, tagFilter]);

  // Reset infinite scroll on filter/sort/drive changes (scroll to top)
  const prevResetKeyRef = useRef("");
  useEffect(() => {
    const key = `${driveName}|${folderPath}|${view}|${tagFilter}|${typeFilter}|${sort}|${order}`;
    if (prevResetKeyRef.current && prevResetKeyRef.current !== key) {
      reset();
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally triggered only by refreshKey
  }, [refreshKey]);

  return {
    files, folders, total, loading, loadingMore, hasMore, sentinelRef,
    reset, setFiles, setPaginatedTotal, setFolders, isRecent,
  };
}
