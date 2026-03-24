"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckSquare, FolderPlus, Search, Upload, X } from "lucide-react";

import { createFolder, getDriveFiles, getFolders } from "@/lib/api";
import type { FileItem, Folder, PaginatedResponse, SortField, SortOrder, ViewMode } from "@/types";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { ViewToggle } from "@/components/ViewToggle";
import { EmptyState } from "@/components/EmptyState";
import { FolderCard } from "@/components/FolderCard";
import { Breadcrumb } from "@/components/Breadcrumb";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { useSelection } from "@/hooks/useSelection";

interface FolderBrowserProps {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
}

export function FolderBrowser({ driveName, folderPath, view, tagFilter }: FolderBrowserProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
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
      ? "すべてのファイル"
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
    getDriveFiles(driveName, {
      path: isFavorites || isAll ? undefined : (folderPath ?? ""),
      search: search || undefined,
      favorite: isFavorites ? true : undefined,
      tag: tagFilter || undefined,
      sort,
      order,
      page,
      limit,
    }).then((res: PaginatedResponse) => {
      setFiles(res.data);
      setTotal(res.meta.total);
      setLoading(false);
    }).catch(() => {
      setFiles([]);
      setTotal(0);
      setLoading(false);
    });
  }, [driveName, folderPath, search, sort, order, page, isFavorites, isAll, tagFilter]);

  useEffect(() => {
    setPage(1);
  }, [driveName, folderPath, view, tagFilter]);

  const [selectable, setSelectable] = useState(false);
  const selection = useSelection();

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (refreshKey === 0) return;
    if (!isFavorites && !isAll) {
      getFolders(driveName, folderPath).then(setFolders).catch(() => setFolders([]));
    }
    setLoading(true);
    getDriveFiles(driveName, {
      path: isFavorites || isAll ? undefined : (folderPath ?? ""),
      search: search || undefined,
      favorite: isFavorites ? true : undefined,
      tag: tagFilter || undefined,
      sort,
      order,
      page,
      limit,
    }).then((res: PaginatedResponse) => {
      setFiles(res.data);
      setTotal(res.meta.total);
      setLoading(false);
    }).catch(() => {
      setFiles([]);
      setTotal(0);
      setLoading(false);
    });
  }, [refreshKey]);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (name.includes("/") || name.includes("\\") || name === ".." || name === "." || name.startsWith(".")) {
      setFolderError("無効なフォルダ名です");
      return;
    }
    if (name.length > 255) {
      setFolderError("フォルダ名が長すぎます");
      return;
    }
    setFolderError(null);
    try {
      await createFolder(driveName, folderPath ?? "", name);
      setNewFolderName("");
      setCreatingFolder(false);
      refresh();
    } catch {
      setFolderError("フォルダの作成に失敗しました");
    }
  }

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleFavoriteToggle = useCallback(
    (updated: FileItem) => {
      if (isFavorites) {
        setFiles((prev) =>
          updated.is_favorite
            ? prev.map((f) => (f.id === updated.id ? updated : f))
            : prev.filter((f) => f.id !== updated.id)
        );
        if (!updated.is_favorite) {
          setTotal((t) => t - 1);
        }
      } else {
        setFiles((prev) =>
          prev.map((f) => (f.id === updated.id ? updated : f))
        );
      }
    },
    [isFavorites],
  );

  const totalPages = Math.ceil(total / limit);

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <UploadZone drive={driveName} folderPath={folderPath ?? ""} onUploadComplete={refresh}>
    <div className="w-full flex-1 px-4 py-6">
      <Breadcrumb driveName={driveName} folderPath={folderPath} />

      {/* Action buttons row */}
      {!isFavorites && !isAll && !tagFilter && (
        <div className="mb-4 flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const uploadZone = document.querySelector<HTMLElement>("[data-upload-zone]");
              if (uploadZone && e.target.files) {
                const event = new CustomEvent("upload-files", { detail: Array.from(e.target.files) });
                uploadZone.dispatchEvent(event);
              }
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
          >
            <Upload size={16} />
            Upload
          </button>

          {creatingFolder ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); setFolderError(null); }
                }}
                placeholder="フォルダ名..."
                className="rounded-lg bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                onClick={handleCreateFolder}
                className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/80"
              >
                作成
              </button>
              <button
                onClick={() => { setCreatingFolder(false); setNewFolderName(""); setFolderError(null); }}
                className="rounded-lg p-2 text-text-muted hover:text-text-primary"
              >
                <X size={16} />
              </button>
              {folderError && <span className="text-xs text-red-400">{folderError}</span>}
            </div>
          ) : (
            <button
              onClick={() => setCreatingFolder(true)}
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <FolderPlus size={16} />
              New Folder
            </button>
          )}
        </div>
      )}

      {/* Search / Sort / View row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="ファイルを検索..."
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

        <button
          onClick={() => {
            setSelectable((s) => {
              if (s) selection.clear();
              return !s;
            });
          }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            selectable
              ? "bg-accent text-white"
              : "bg-bg-card text-text-muted hover:text-text-primary"
          }`}
          aria-label="選択モード"
        >
          <CheckSquare size={16} />
        </button>

        <ViewToggle onChange={handleViewChange} />
      </div>

      <p className="mb-4 text-sm text-text-muted">
        {label} · {total} 件
      </p>

      {folders.length > 0 && !search && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((folder) => (
            <FolderCard key={folder.path} folder={folder} driveName={driveName} onUpdate={refresh} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : files.length === 0 && folders.length === 0 ? (
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
          <EmptyState variant="no-files" />
        )
      ) : viewMode === "grid" ? (
        <FileGrid
          files={files}
          onFavoriteToggle={handleFavoriteToggle}
          onRefresh={refresh}
          selectable={selectable}
          isSelected={selection.isSelected}
          onSelect={selection.toggle}
        />
      ) : (
        <FileList
          files={files}
          onFavoriteToggle={handleFavoriteToggle}
          onRefresh={refresh}
          selectable={selectable}
          isSelected={selection.isSelected}
          onSelect={selection.toggle}
        />
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
    </UploadZone>
  );
}
