"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, FileText, FolderPlus, Play, RefreshCw, Upload, X } from "lucide-react";

import { createFolder, getDriveFiles, scanDrive } from "@/lib/api";
import type { FileItem, FileType, SortField, SortOrder, ViewMode } from "@/types";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { ViewToggle } from "@/components/ViewToggle";
import { SortButton } from "@/components/SortButton";
import { EmptyState } from "@/components/EmptyState";
import { UploadZone } from "@/components/UploadZone";
import { SelectionBar } from "@/components/SelectionBar";
import { useSelection } from "@/hooks/useSelection";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

interface RootFileListingProps {
  driveName: string;
  onFileAction?: () => void;
  onFolderChange?: () => void;
}

const LIMIT = 30;

export function RootFileListing({ driveName, onFileAction, onFolderChange }: RootFileListingProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortField>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [typeFilter, setTypeFilter] = useState<FileType | null>(null);

  const fetchPage = useCallback(
    async (page: number, limit: number) => {
      const res = await getDriveFiles(driveName, {
        path: "",
        type: typeFilter || undefined,
        sort,
        order,
        page,
        limit,
      });
      return { data: res.data, total: res.meta.total };
    },
    [driveName, sort, order, typeFilter],
  );

  const {
    items: files,
    total,
    loading,
    loadingMore,
    hasMore,
    sentinelRef,
    reset,
    setItems: setFiles,
  } = useInfiniteScroll<FileItem>({ fetchPage, limit: LIMIT });

  const [selectable, setSelectable] = useState(false);
  const selection = useSelection();

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    if (scanning) return;
    setScanning(true);
    try {
      await scanDrive(driveName);
      refresh();
      onFolderChange?.();
    } catch {
      // 409 = already scanning, ignore
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (refreshKey === 0) return;
    reset();
    onFileAction?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally triggered only by refreshKey
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
      await createFolder(driveName, "", name);
      setNewFolderName("");
      setCreatingFolder(false);
      refresh();
      onFolderChange?.();
    } catch {
      setFolderError("フォルダの作成に失敗しました");
    }
  }

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleFavoriteToggle = useCallback(
    (updated: FileItem) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === updated.id ? updated : f))
      );
      onFileAction?.();
    },
    [onFileAction],
  );

  const sortQuery = sort === "random"
    ? ""
    : `?sort=${sort}&order=${order}`;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const hasPlayableFiles = files.some(
    (f) => f.file_type === "audio" || f.file_type === "video"
  );

  const handlePlayAll = useCallback(() => {
    const firstPlayable = files.find(
      (f) => f.file_type === "audio" || f.file_type === "video"
    );
    if (!firstPlayable) return;
    const params = new URLSearchParams();
    params.set("folder_play", "1");
    if (sort !== "random") {
      params.set("sort", sort);
      params.set("order", order);
    }
    router.push(`/files/${firstPlayable.id}?${params.toString()}`);
  }, [files, sort, order, router]);

  const handleUploadComplete = useCallback(() => {
    refresh();
    onFolderChange?.();
  }, [refresh, onFolderChange]);

  return (
    <UploadZone drive={driveName} folderPath="" onUploadComplete={handleUploadComplete}>
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
            <FileText size={20} className="text-accent" />
            ファイル
          </h2>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-all hover:bg-accent/80 active:scale-[0.97]"
            aria-label="アップロード"
          >
            <Upload size={16} />
            <span className="hidden sm:inline">Upload</span>
          </button>

          {creatingFolder ? (
            <div className="flex w-full items-center gap-2 sm:w-auto">
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
                className="min-w-0 flex-1 rounded-lg bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent sm:w-40 sm:flex-initial"
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
              className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
              aria-label="新規フォルダ"
            >
              <FolderPlus size={16} />
              <span className="hidden sm:inline">New Folder</span>
            </button>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {hasPlayableFiles && (
              <button
                onClick={handlePlayAll}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-all hover:bg-accent/80 active:scale-[0.97]"
                aria-label="全曲再生"
              >
                <Play size={16} />
                <span className="hidden sm:inline">再生</span>
              </button>
            )}

            <div className="flex items-center gap-1 rounded-lg bg-bg-card p-1">
              <SortButton
                sort={sort}
                order={order}
                onChange={(s, o) => { setSort(s); setOrder(o); }}
              />

              <button
                onClick={() => {
                  setSelectable((s) => {
                    if (s) selection.clear();
                    return !s;
                  });
                }}
                className={`rounded-md p-2 transition-colors ${
                  selectable
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-primary"
                }`}
                aria-label="選択モード"
              >
                <CheckSquare size={16} />
              </button>

              <ViewToggle onChange={handleViewChange} />

              <button
                onClick={handleScan}
                disabled={scanning}
                className="rounded-md p-2 text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                aria-label="再スキャン"
                title="ドライブを再スキャン"
              >
                <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>

        {/* Type filter tabs */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {([
              { value: null, label: "すべて" },
              { value: "video" as FileType, label: "動画" },
              { value: "image" as FileType, label: "画像" },
              { value: "audio" as FileType, label: "音声" },
              { value: "document" as FileType, label: "文書" },
              { value: "other" as FileType, label: "その他" },
            ] as const).map((tab) => (
              <button
                key={tab.label}
                onClick={() => setTypeFilter(tab.value)}
                className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                  typeFilter === tab.value
                    ? "bg-accent/20 font-medium text-accent"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-text-muted">{total} 件</span>
        </div>

        {/* File listing */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : files.length === 0 ? (
          <EmptyState variant="no-files" />
        ) : viewMode === "grid" ? (
          <FileGrid
            files={files}
            onFavoriteToggle={handleFavoriteToggle}
            onRefresh={refresh}
            selectable={selectable}
            isSelected={selection.isSelected}
            onSelect={selection.toggle}
            sortQuery={sortQuery}
          />
        ) : (
          <FileList
            files={files}
            onFavoriteToggle={handleFavoriteToggle}
            onRefresh={refresh}
            selectable={selectable}
            isSelected={selection.isSelected}
            onSelect={selection.toggle}
            sortQuery={sortQuery}
          />
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore && (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
        </div>

        {/* Selection bar */}
        {selectable && (
          <SelectionBar
            count={selection.count}
            selectedIds={selection.selectedIds}
            totalCount={files.length}
            drive={driveName}
            currentPath=""
            onSelectAll={() => selection.selectAll(files.map((f) => f.id))}
            onClear={() => {
              selection.clear();
              setSelectable(false);
            }}
            onComplete={refresh}
          />
        )}
      </section>
    </UploadZone>
  );
}
