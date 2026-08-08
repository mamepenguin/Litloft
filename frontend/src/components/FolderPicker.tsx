"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folder as FolderIcon,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { getFolders, getFolderTree } from "@/lib/api";
import type { Folder, FolderTreeNode } from "@/types";

interface FolderPickerProps {
  drive: string;
  /** Selected folder path. Empty string means drive root. */
  value: string;
  onChange: (path: string) => void;
}

export function FolderPicker({ drive, value, onChange }: FolderPickerProps) {
  const t = useTranslations("fileSaveDialog");
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  // browsePath tracks which level we're navigating; starts at the selected value.
  const [browsePath, setBrowsePath] = useState(value);
  const [currentFolders, setCurrentFolders] = useState<Folder[]>([]);
  const [allFolders, setAllFolders] = useState<FolderTreeNode[]>([]);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const allLoadedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Load current-level folders whenever browsePath or open state changes.
  useEffect(() => {
    if (!open) return;
    setLoadingCurrent(true);
    getFolders(drive, browsePath || undefined)
      .then(setCurrentFolders)
      .catch(() => setCurrentFolders([]))
      .finally(() => setLoadingCurrent(false));
  }, [drive, browsePath, open]);

  // Load all folders once (for keyword filtering).
  useEffect(() => {
    if (!open || allLoadedRef.current) return;
    allLoadedRef.current = true;
    getFolderTree(drive, { flat: true })
      .then((nodes) => setAllFolders(nodes.filter((n) => n.kind === "folder")))
      .catch(() => {});
  }, [open, drive]);

  const isFiltering = filter.trim().length > 0;

  const filteredFolders = useMemo(() => {
    if (!isFiltering) return [];
    const q = filter.toLowerCase();
    return [...allFolders]
      .filter((f) => f.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [allFolders, filter, isFiltering]);

  const breadcrumbParts = browsePath ? browsePath.split("/").filter(Boolean) : [];

  function navigate(path: string) {
    setBrowsePath(path);
    onChange(path);
    setFilter("");
  }

  function handleBreadcrumbClick(index: number) {
    const path =
      index < 0 ? "" : breadcrumbParts.slice(0, index + 1).join("/");
    navigate(path);
  }

  function handleFolderClick(path: string) {
    navigate(path);
  }

  // Clicking a filtered result selects it and closes the picker.
  function handleFilteredClick(path: string) {
    navigate(path);
    setOpen(false);
  }

  const displayValue = value ? `/${value}` : `/${t("folderRoot")}`;

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl border border-bg-border bg-bg-primary px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-bg-elevated focus:outline-none focus:ring-2 focus:ring-focus-ring"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
      >
        <span className="flex min-w-0 items-center gap-2">
          <FolderIcon size={14} className="shrink-0 text-text-muted" />
          <span className="text-text-muted">{t("folderSaveTo")}:</span>
          <span className="truncate font-medium">{displayValue}</span>
        </span>
        {open ? (
          <ChevronUp size={14} className="ml-2 shrink-0 text-text-muted" />
        ) : (
          <ChevronDown size={14} className="ml-2 shrink-0 text-text-muted" />
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          id={panelId}
          role="dialog"
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-bg-border bg-bg-primary shadow-lg"
        >
          {/* Filter input */}
          <div className="border-b border-bg-border px-3 py-2">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("folderFilter")}
                className="w-full rounded-2xl bg-bg-elevated py-1.5 pl-8 pr-8 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-card hover:text-text-primary"
                  aria-label={t("folderFilterClear")}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Breadcrumb (navigation mode only) */}
          {!isFiltering && (
            <div className="flex flex-wrap items-center gap-1 border-b border-bg-border px-3 py-2 text-xs text-text-muted">
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(-1)}
                className="rounded-xl px-2 py-1 transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                {drive}
              </button>
              {breadcrumbParts.map((part, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight size={12} className="shrink-0" />
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(i)}
                    className="rounded-xl px-2 py-1 transition-colors hover:bg-bg-elevated hover:text-text-primary"
                  >
                    {part}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Folder list */}
          <div className="max-h-48 overflow-y-auto">
            {isFiltering ? (
              filteredFolders.length === 0 ? (
                <p className="px-3 py-3 text-sm text-text-muted">
                  {t("folderEmpty")}
                </p>
              ) : (
                filteredFolders.map((folder) => (
                  <button
                    key={folder.path}
                    type="button"
                    onClick={() => handleFilteredClick(folder.path)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      value === folder.path
                        ? "bg-accent/10 text-accent"
                        : "text-text-primary hover:bg-bg-elevated"
                    }`}
                  >
                    <FolderIcon
                      size={14}
                      className={`shrink-0 ${value === folder.path ? "text-accent" : "text-text-muted"}`}
                    />
                    <span className="truncate">{folder.path}</span>
                  </button>
                ))
              )
            ) : (
              <>
                {loadingCurrent && (
                  <p className="px-3 py-3 text-sm text-text-muted">
                    {t("folderLoading")}
                  </p>
                )}
                {!loadingCurrent && currentFolders.length === 0 && (
                  <p className="px-3 py-3 text-sm text-text-muted">
                    {t("folderNoSubfolders")}
                  </p>
                )}
                {!loadingCurrent &&
                  currentFolders.map((folder) => (
                    <button
                      key={folder.path}
                      type="button"
                      onClick={() => handleFolderClick(folder.path)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                    >
                      <FolderIcon
                        size={14}
                        className="shrink-0 text-text-muted"
                      />
                      <span className="flex-1 truncate">{folder.name}</span>
                    </button>
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
