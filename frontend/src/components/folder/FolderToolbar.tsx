"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, CheckSquare, Filter, FolderPlus, Play, RefreshCw, Upload, X } from "lucide-react";

import type { FileType, SortField, SortOrder, ViewMode } from "@/types";
import { ViewToggle } from "@/components/ViewToggle";
import { SortButton } from "@/components/SortButton";

interface FolderToolbarProps {
  isSpecialView: boolean;
  tagFilter?: string | null;
  hasPlayableFiles: boolean;
  sort: SortField;
  order: SortOrder;
  typeFilter: FileType | null;
  total: number;
  selectable: boolean;
  scanning: boolean;
  creatingFolder: boolean;
  newFolderName: string;
  folderError: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onSortChange: (s: SortField, o: SortOrder) => void;
  onTypeFilterChange: (t: FileType | null) => void;
  onViewChange: (mode: ViewMode) => void;
  onToggleSelectable: () => void;
  onScan: () => void;
  onPlayAll: () => void;
  onSetCreatingFolder: (v: boolean) => void;
  onSetNewFolderName: (v: string) => void;
  onSetFolderError: (v: string | null) => void;
  onCreateFolder: () => void;
  onUploadClick: () => void;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: FileType | null; label: string }> = [
  { value: null, label: "すべて" },
  { value: "video", label: "動画" },
  { value: "image", label: "画像" },
  { value: "audio", label: "音声" },
  { value: "document", label: "文書" },
  { value: "archive", label: "書庫" },
  { value: "other", label: "その他" },
];

export function FolderToolbar({
  isSpecialView, tagFilter, hasPlayableFiles,
  sort, order, typeFilter, total, selectable, scanning,
  creatingFolder, newFolderName, folderError, fileInputRef,
  onSortChange, onTypeFilterChange, onViewChange, onToggleSelectable,
  onScan, onPlayAll, onSetCreatingFolder, onSetNewFolderName,
  onSetFolderError, onCreateFolder, onUploadClick,
}: FolderToolbarProps) {
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const typeFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typeFilterOpen) return;
    function handleClick(e: MouseEvent) {
      if (typeFilterRef.current && !typeFilterRef.current.contains(e.target as Node)) {
        setTypeFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [typeFilterOpen]);

  return (
    <>
      {/* Toolbar row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!isSpecialView && !tagFilter && (
          <>
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
              onClick={onUploadClick}
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
                  onChange={(e) => onSetNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCreateFolder();
                    if (e.key === "Escape") { onSetCreatingFolder(false); onSetNewFolderName(""); onSetFolderError(null); }
                  }}
                  placeholder="フォルダ名..."
                  className="min-w-0 flex-1 rounded-lg bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent sm:w-40 sm:flex-initial"
                />
                <button
                  onClick={onCreateFolder}
                  className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/80"
                >
                  作成
                </button>
                <button
                  onClick={() => { onSetCreatingFolder(false); onSetNewFolderName(""); onSetFolderError(null); }}
                  className="rounded-lg p-2 text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
                {folderError && <span className="text-xs text-red-400">{folderError}</span>}
              </div>
            ) : (
              <button
                onClick={() => onSetCreatingFolder(true)}
                className="flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
                aria-label="新規フォルダ"
              >
                <FolderPlus size={16} />
                <span className="hidden sm:inline">New Folder</span>
              </button>
            )}
          </>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {hasPlayableFiles && !isSpecialView && !tagFilter && (
            <button
              onClick={onPlayAll}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-all hover:bg-accent/80 active:scale-[0.97]"
              aria-label="全曲再生"
            >
              <Play size={16} />
              <span className="hidden sm:inline">再生</span>
            </button>
          )}

          <div className="flex items-center gap-1 rounded-lg bg-bg-card p-1">
            <SortButton sort={sort} order={order} onChange={onSortChange} />

            <button
              onClick={onToggleSelectable}
              className={`rounded-md p-2 transition-colors ${
                selectable
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
              aria-label="選択モード"
            >
              <CheckSquare size={16} />
            </button>

            <ViewToggle onChange={onViewChange} />

            <button
              onClick={onScan}
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Mobile: popover dropdown */}
        <div ref={typeFilterRef} className="relative sm:hidden">
          <button
            onClick={() => setTypeFilterOpen((s) => !s)}
            className={`flex items-center gap-1.5 rounded-md p-2 text-sm transition-colors ${
              typeFilter
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            aria-label="ファイルタイプ"
          >
            <Filter size={16} />
          </button>
          {typeFilterOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-xl border border-bg-border bg-bg-primary py-1 shadow-xl animate-fade-in-scale origin-top-left">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => {
                    onTypeFilterChange(opt.value);
                    setTypeFilterOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    typeFilter === opt.value
                      ? "text-accent"
                      : "text-text-primary hover:bg-bg-elevated"
                  }`}
                >
                  <span className="w-4 flex-shrink-0">
                    {typeFilter === opt.value && <Check size={14} />}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Desktop: tabs */}
        <div className="hidden items-center gap-1 sm:flex">
          {TYPE_OPTIONS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => onTypeFilterChange(tab.value)}
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
    </>
  );
}
