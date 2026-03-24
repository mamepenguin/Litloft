"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { getDriveVideos, getFolders } from "@/lib/api";
import type { Folder, PaginatedResponse, SortField, SortOrder, Video, ViewMode } from "@/types";
import { VideoGrid } from "@/components/VideoGrid";
import { VideoList } from "@/components/VideoList";
import { ViewToggle } from "@/components/ViewToggle";
import { EmptyState } from "@/components/EmptyState";
import { FolderCard } from "@/components/FolderCard";
import { Breadcrumb } from "@/components/Breadcrumb";

interface FolderBrowserProps {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
}

export function FolderBrowser({ driveName, folderPath, view, tagFilter }: FolderBrowserProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [loading, setLoading] = useState(true);

  const limit = 30;
  const isFavorites = view === "favorites";
  const isAll = view === "all";

  const label = isFavorites
    ? "お気に入り"
    : isAll
      ? "すべての動画"
      : tagFilter
        ? `#${tagFilter}`
        : folderPath
          ? folderPath.split("/").pop() || driveName
          : driveName;

  useEffect(() => {
    if (!isFavorites && !isAll) {
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    } else {
      setFolders([]);
    }
  }, [driveName, folderPath, isFavorites, isAll]);

  useEffect(() => {
    setLoading(true);
    getDriveVideos(driveName, {
      path: isFavorites || isAll ? undefined : (folderPath ?? ""),
      search: search || undefined,
      favorite: isFavorites ? true : undefined,
      tag: tagFilter || undefined,
      sort,
      order,
      page,
      limit,
    }).then((res: PaginatedResponse) => {
      setVideos(res.data);
      setTotal(res.meta.total);
      setLoading(false);
    }).catch(() => {
      setVideos([]);
      setTotal(0);
      setLoading(false);
    });
  }, [driveName, folderPath, search, sort, order, page, isFavorites, isAll, tagFilter]);

  useEffect(() => {
    setPage(1);
  }, [driveName, folderPath, view, tagFilter]);

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleFavoriteToggle = useCallback(
    (updated: Video) => {
      if (isFavorites) {
        setVideos((prev) =>
          updated.is_favorite
            ? prev.map((v) => (v.id === updated.id ? updated : v))
            : prev.filter((v) => v.id !== updated.id)
        );
        if (!updated.is_favorite) {
          setTotal((t) => t - 1);
        }
      } else {
        setVideos((prev) =>
          prev.map((v) => (v.id === updated.id ? updated : v))
        );
      }
    },
    [isFavorites],
  );

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="w-full flex-1 px-4 py-6">
      <Breadcrumb driveName={driveName} folderPath={folderPath} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="動画を検索..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg bg-bg-card py-2 pl-9 pr-8 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <select
          value={`${sort}-${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split("-") as [SortField, SortOrder];
            setSort(s);
            setOrder(o);
            setPage(1);
          }}
          className="rounded-lg bg-bg-card px-3 py-2 text-sm text-text-primary outline-none"
        >
          <option value="created_at-desc">新しい順</option>
          <option value="created_at-asc">古い順</option>
          <option value="title-asc">タイトル A→Z</option>
          <option value="title-desc">タイトル Z→A</option>
          <option value="file_size-desc">サイズ 大→小</option>
          <option value="file_size-asc">サイズ 小→大</option>
        </select>

        <ViewToggle onChange={handleViewChange} />
      </div>

      <p className="mb-4 text-sm text-text-muted">
        {label} · {total} 本
      </p>

      {folders.length > 0 && !search && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((folder) => (
            <FolderCard key={folder.path} folder={folder} driveName={driveName} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : videos.length === 0 && folders.length === 0 ? (
        search ? (
          <EmptyState
            variant="no-results"
            action={{
              label: "検索をクリア",
              onClick: () => {
                setSearch("");
                setPage(1);
              },
            }}
          />
        ) : isFavorites ? (
          <EmptyState variant="no-favorites" />
        ) : (
          <EmptyState variant="no-videos" />
        )
      ) : viewMode === "grid" ? (
        <VideoGrid videos={videos} onFavoriteToggle={handleFavoriteToggle} />
      ) : (
        <VideoList videos={videos} onFavoriteToggle={handleFavoriteToggle} />
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg bg-bg-card px-3 py-2 text-sm text-text-muted disabled:opacity-40 hover:text-text-primary"
          >
            前へ
          </button>
          <span className="text-sm text-text-muted">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg bg-bg-card px-3 py-2 text-sm text-text-muted disabled:opacity-40 hover:text-text-primary"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
