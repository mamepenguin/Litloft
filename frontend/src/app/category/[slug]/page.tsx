"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";
import Link from "next/link";

import { getCategories, getVideos } from "@/lib/api";
import type { Category, PaginatedResponse, SortField, SortOrder, Video, ViewMode } from "@/types";
import { CategoryNav } from "@/components/CategoryNav";
import { VideoGrid } from "@/components/VideoGrid";
import { VideoList } from "@/components/VideoList";
import { ViewToggle } from "@/components/ViewToggle";
import { EmptyState } from "@/components/EmptyState";

export default function CategoryPage() {
  const params = useParams();
  const slug = decodeURIComponent(params.slug as string);
  const isAll = slug === "all";

  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [loading, setLoading] = useState(true);

  const limit = 30;

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    getVideos({
      category: isAll ? undefined : slug,
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
  }, [slug, isAll, search, sort, order, page]);

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const totalPages = Math.ceil(total / limit);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={16} />
          トップへ戻る
        </Link>
      </div>

      <div className="mb-4">
        <CategoryNav
          categories={categories}
          activeCategory={isAll ? undefined : slug}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
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
        {isAll ? "すべて" : slug} · {total} 本
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
          <EmptyState variant="no-videos" />
        )
      ) : viewMode === "grid" ? (
        <VideoGrid videos={videos} />
      ) : (
        <VideoList videos={videos} />
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
    </main>
  );
}
