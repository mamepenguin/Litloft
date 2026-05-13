"use client";

import { useState } from "react";
import {
  Check,
  CheckSquare,
  Filter,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Play,
  RefreshCw,
  X,
} from "lucide-react";

import { useTranslations } from "next-intl";
import type { FileType, SortField, SortOrder, ViewMode } from "@/types";
import { SortButton } from "@/components/SortButton";
import { UploadButton } from "@/components/UploadButton";
import { ViewToggle } from "@/components/ViewToggle";
import { AddonSlot } from "@/components/AddonSlot";

interface FolderToolbarProps {
  isSpecialView: boolean;
  isSearch?: boolean;
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
  folderPath?: string;
  /**
   * Current viewMode. When provided, ViewToggle is controlled
   * (FolderBrowser owns persistence via useFolderViewMode); when
   * omitted, ViewToggle falls back to its uncontrolled mode and
   * persists to the global default key.
   */
  viewMode?: ViewMode;
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
  /**
   * When provided, render a "New File" button that creates a blank
   * Markdown file in the current folder. Omitting the prop hides the
   * button — used by FolderBrowser to disable file creation in
   * special views (favorites, search, tag filters) where there's no
   * concrete folder to write into.
   */
  onCreateFile?: () => void;
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
  isSpecialView, isSearch, tagFilter, hasPlayableFiles,
  sort, order, typeFilter, total, selectable, scanning,
  creatingFolder, newFolderName, folderError, fileIds, drive, folderPath,
  viewMode,
  onSortChange, onTypeFilterChange, onViewChange, onToggleSelectable,
  onScan, onPlayAll, onSetCreatingFolder, onSetNewFolderName,
  onSetFolderError, onCreateFolder, onCreateFile,
}: FolderToolbarProps) {
  // In search mode the file list is a virtual folder: upload / create
  // folder / scan / play-all don't make sense there. We treat search
  // mode as "read-only special view" for toolbar gating.
  const hideMutatingActions = isSpecialView || !!tagFilter || !!isSearch;
  const t = useTranslations("toolbar");
  const tc = useTranslations("common");
  const ts = useTranslations("selection");
  const tf = useTranslations("folder");

  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const activeTypeOption = TYPE_OPTION_KEYS.find((opt) => opt.value === typeFilter);
  const activeTypeLabel = activeTypeOption ? t(activeTypeOption.labelKey) : t("all");
  const isTypeFiltered = typeFilter !== null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {/* LEFT: mutating actions */}
      {!hideMutatingActions && (
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
                className="min-w-0 flex-1 rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring sm:w-40 sm:flex-initial"
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
              {folderError && <span className="text-xs text-danger">{folderError}</span>}
            </div>
          ) : (
            <button
              onClick={() => onSetCreatingFolder(true)}
              className="flex items-center gap-2 rounded-2xl border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
              aria-label={tf("newFolder")}
            >
              <FolderPlus size={16} />
              <span className="hidden sm:inline">{tf("newFolder")}</span>
            </button>
          )}

          {onCreateFile && !creatingFolder && (
            <button
              onClick={() => onCreateFile()}
              className="flex items-center gap-2 rounded-2xl border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
              aria-label={tf("newFile")}
            >
              <FilePlus size={16} />
              <span className="hidden sm:inline">{tf("newFile")}</span>
            </button>
          )}
        </>
      )}

      <AddonSlot id="folder-actions" layout="stack" props={{ fileIds, drive, path: folderPath ?? "" }} />

      <div className="flex-1" />

      {/* RIGHT: view controls */}
      {hasPlayableFiles && !hideMutatingActions && (
        <button
          onClick={onPlayAll}
          className="flex items-center gap-1.5 rounded-2xl bg-accent px-3 py-2 text-sm font-medium text-white transition-all hover:bg-accent-hover"
          aria-label={t("playAll")}
        >
          <Play size={16} />
          <span className="hidden sm:inline">{tc("play")}</span>
        </button>
      )}

      {/* Type filter — single chip + popover (replaces 7-tab row) */}
      <div className="relative">
        <button
          onClick={() => setTypeFilterOpen((s) => !s)}
          className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm transition-colors ${
            isTypeFiltered
              ? "border-bg-border bg-bg-elevated text-text-primary font-medium"
              : "border-bg-border bg-bg-card text-text-muted hover:text-text-primary"
          }`}
          aria-haspopup="menu"
          aria-expanded={typeFilterOpen}
          aria-label={t("fileType")}
        >
          <Filter size={16} />
          {isTypeFiltered && (
            <span className="text-sm font-medium">{activeTypeLabel}</span>
          )}
        </button>
        {typeFilterOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
              aria-hidden="true"
              onClick={() => setTypeFilterOpen(false)}
            />
            <div
              role="menu"
              className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-none sm:min-w-[160px] sm:overflow-visible sm:origin-top-right"
            >
            {TYPE_OPTION_KEYS.map((opt) => (
              <button
                key={opt.labelKey}
                role="menuitem"
                onClick={() => {
                  onTypeFilterChange(opt.value);
                  setTypeFilterOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  typeFilter === opt.value
                    ? "bg-bg-elevated text-text-primary font-medium"
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
          </>
        )}
      </div>

      {/* Sort + view toggle + overflow grouped in a single pill */}
      <div className="flex items-center gap-1 rounded-2xl bg-bg-elevated p-1">
        <SortButton
          sort={sort}
          order={order}
          onChange={onSortChange}
          allowRelevance={isSearch}
        />

        <ViewToggle mode={viewMode} onChange={onViewChange} />

        {/* Overflow: select-mode + rescan (low-frequency, not search-mode) */}
        <div className="relative">
          <button
            onClick={() => setMoreOpen((s) => !s)}
            className={`rounded-lg p-2 transition-colors ${
              selectable
                ? "bg-bg-card text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label={t("more")}
            title={t("more")}
          >
            <MoreHorizontal size={16} />
          </button>
          {moreOpen && (
            <>
              <div
                className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
                aria-hidden="true"
                onClick={() => setMoreOpen(false)}
              />
              <div
                role="menu"
                className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-none sm:min-w-[200px] sm:overflow-visible sm:origin-top-right"
              >
              <button
                role="menuitem"
                onClick={() => {
                  onToggleSelectable();
                  setMoreOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  selectable
                    ? "bg-bg-elevated text-text-primary font-medium"
                    : "text-text-primary hover:bg-bg-elevated"
                }`}
              >
                <CheckSquare size={16} className="flex-shrink-0" />
                <span className="flex-1">{ts("selectMode")}</span>
              </button>
              {!isSearch && (
                <button
                  role="menuitem"
                  onClick={() => {
                    if (!scanning) onScan();
                    setMoreOpen(false);
                  }}
                  disabled={scanning}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated disabled:opacity-50"
                >
                  <RefreshCw
                    size={16}
                    className={`flex-shrink-0 ${scanning ? "animate-spin" : ""}`}
                  />
                  <span className="flex-1">{t("rescan")}</span>
                </button>
              )}
              </div>
            </>
          )}
        </div>
      </div>

      {!isSearch && (
        <span className="text-sm text-text-muted whitespace-nowrap">
          {tc("items", { count: total })}
        </span>
      )}
    </div>
  );
}
