"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckSquare, Filter, FolderPlus, Play, RefreshCw, X } from "lucide-react";

import { useTranslations } from "next-intl";
import type { FileType, SortField, SortOrder, ViewMode } from "@/types";
import { ViewToggle } from "@/components/ViewToggle";
import { SortButton } from "@/components/SortButton";
import { UploadButton } from "@/components/UploadButton";
import { AddonSlot } from "@/components/AddonSlot";

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
  fileIds: string[];
  drive: string;
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
}

const TYPE_OPTION_KEYS: ReadonlyArray<{ value: FileType | null; labelKey: string }> = [
  { value: null, labelKey: "all" },
  { value: "video", labelKey: "video" },
  { value: "image", labelKey: "image" },
  { value: "audio", labelKey: "audio" },
  { value: "document", labelKey: "document" },
  { value: "archive", labelKey: "archiveType" },
  { value: "other", labelKey: "other" },
];

export function FolderToolbar({
  isSpecialView, tagFilter, hasPlayableFiles,
  sort, order, typeFilter, total, selectable, scanning,
  creatingFolder, newFolderName, folderError, fileIds, drive,
  onSortChange, onTypeFilterChange, onViewChange, onToggleSelectable,
  onScan, onPlayAll, onSetCreatingFolder, onSetNewFolderName,
  onSetFolderError, onCreateFolder,
}: FolderToolbarProps) {
  const t = useTranslations("toolbar");
  const tc = useTranslations("common");
  const ts = useTranslations("selection");
  const tf = useTranslations("folder");
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
            <UploadButton />

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
                  placeholder={tf("namePlaceholder")}
                  className="min-w-0 flex-1 rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent sm:w-40 sm:flex-initial"
                />
                <button
                  onClick={onCreateFolder}
                  className="rounded-2xl bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  {tc("create")}
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
                className="flex items-center gap-2 rounded-2xl border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
                aria-label={tf("newFolder")}
              >
                <FolderPlus size={16} />
                <span className="hidden sm:inline">New Folder</span>
              </button>
            )}
          </>
        )}

        <AddonSlot id="folder-actions" layout="stack" props={{ fileIds, drive }} />

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {hasPlayableFiles && !isSpecialView && !tagFilter && (
            <button
              onClick={onPlayAll}
              className="flex items-center gap-1.5 rounded-2xl bg-accent px-3 py-2 text-sm font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.97]"
              aria-label={t("playAll")}
            >
              <Play size={16} />
              <span className="hidden sm:inline">{tc("play")}</span>
            </button>
          )}

          <div className="flex items-center gap-1 rounded-2xl bg-bg-elevated p-1">
            <SortButton sort={sort} order={order} onChange={onSortChange} />

            <button
              onClick={onToggleSelectable}
              className={`rounded-md p-2 transition-colors ${
                selectable
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
              aria-label={ts("selectMode")}
            >
              <CheckSquare size={16} />
            </button>

            <ViewToggle onChange={onViewChange} />

            <button
              onClick={onScan}
              disabled={scanning}
              className="rounded-md p-2 text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
              aria-label={t("rescan")}
              title={t("rescanTitle")}
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
            aria-label={t("fileType")}
          >
            <Filter size={16} />
          </button>
          {typeFilterOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-xl animate-fade-in-scale origin-top-left">
              {TYPE_OPTION_KEYS.map((opt) => (
                <button
                  key={opt.labelKey}
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
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Desktop: tabs */}
        <div className="hidden items-center gap-1 sm:flex">
          {TYPE_OPTION_KEYS.map((tab) => (
            <button
              key={tab.labelKey}
              onClick={() => onTypeFilterChange(tab.value)}
              className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                typeFilter === tab.value
                  ? "bg-accent/20 font-medium text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <span className="text-sm text-text-muted">{tc("items", { count: total })}</span>
      </div>
    </>
  );
}
