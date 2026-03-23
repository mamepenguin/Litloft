"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { getVideos } from "@/lib/api";
import type { PaginatedResponse, SortField, SortOrder, Video, ViewMode } from "@/types";
import { VideoGrid } from "@/components/VideoGrid";
import { VideoList } from "@/components/VideoList";
import { ViewToggle } from "@/components/ViewToggle";
import { EmptyState } from "@/components/EmptyState";

type EmptyVariant = "no-videos" | "no-results" | "needs-scan" | "no-favorites";

interface VideoListPageProps {
  label: string;
  searchPlaceholder?: string;
  emptyVariant?: EmptyVariant;
  fetchParams: Omit<Parameters<typeof getVideos>[0], "search" | "sort" | "order" | "page" | "limit">;
  onFavoriteToggle?: (videos: Video[], updated: Video) => Video[];
}

const defaultFavoriteToggle = (videos: Video[], updated: Video): Video[] =>
  videos.map((v) => (v.id === updated.id ? updated : v));

export function VideoListPage({
  label,
  searchPlaceholder = "動画を検索...",
  emptyVariant = "no-videos",
  fetchParams,
  onFavoriteToggle = defaultFavoriteToggle,
}: VideoListPageProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [loading, setLoading] = useState(true);

  const limit = 30;

  const fetchParamsKey = JSON.stringify(fetchParams);

  useEffect(() => {
    setLoading(true);
    getVideos({
      ...fetchParams,
      search: search || undefined,
      sort,
      order,
      page,
      limit,
    }).then((res: PaginatedResponse) => {
      setVideos(res.data);
      setTotal(res.meta.total);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchParamsKey, search, sort, order, page]);

  useEffect(() => {
    setPage(1);
  }, [fetchParamsKey]);

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleFavoriteToggle = useCallback(
    (updated: Video) => {
      setVideos((prev) => {
        const next = onFavoriteToggle(prev, updated);
        if (next.length < prev.length) {
          setTotal((t) => t - (prev.length - next.length));
        }
        return next;
      });
    },
    [onFavoriteToggle],
  );

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="w-full flex-1 px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder={searchPlaceholder}
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

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : videos.length === 0 ? (
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
        ) : (
          <EmptyState variant={emptyVariant} />
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
