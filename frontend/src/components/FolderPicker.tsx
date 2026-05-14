"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder as FolderIcon, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { getFolderTree } from "@/lib/api";
import type { FolderTreeNode } from "@/types";

interface FolderPickerProps {
  drive: string;
  /** Selected folder path. Empty string means drive root. */
  value: string;
  onChange: (path: string) => void;
}

export function FolderPicker({ drive, value, onChange }: FolderPickerProps) {
  const t = useTranslations("fileSaveDialog");
  const [filter, setFilter] = useState("");
  const [folders, setFolders] = useState<FolderTreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFilter("");
    const controller = new AbortController();
    getFolderTree(drive, { flat: true }, { signal: controller.signal })
      .then((nodes) => {
        setFolders(nodes.filter((n) => n.kind === "folder"));
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [drive]);

  const isFiltering = filter.trim().length > 0;

  const displayItems = useMemo(() => {
    const sorted = [...folders].sort((a, b) => a.path.localeCompare(b.path));
    if (!isFiltering) return sorted;
    const q = filter.toLowerCase();
    return sorted.filter((f) => f.path.toLowerCase().includes(q));
  }, [folders, filter, isFiltering]);

  return (
    <div className="flex flex-col gap-2">
      {/* Filter input */}
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("folderFilter")}
          className="w-full rounded-2xl border border-bg-border bg-bg-primary py-2.5 pl-10 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-focus-ring focus:outline-none"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-primary"
            aria-label={t("folderFilterClear")}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Folder list */}
      <div className="max-h-48 overflow-y-auto rounded-xl border border-bg-border bg-bg-primary">
        {/* Drive root */}
        <button
          type="button"
          onClick={() => onChange("")}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            value === ""
              ? "bg-accent/10 text-accent"
              : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          }`}
        >
          <FolderIcon
            size={14}
            className={`shrink-0 ${value === "" ? "text-accent" : "text-text-muted"}`}
          />
          <span className="font-medium">
            {value === "" ? `/${t("folderRoot")}` : t("folderRoot")}
          </span>
        </button>

        {loading && (
          <div className="px-3 py-3 text-sm text-text-muted">
            {t("folderLoading")}
          </div>
        )}

        {!loading && isFiltering && displayItems.length === 0 && (
          <div className="px-3 py-3 text-sm text-text-muted">
            {t("folderEmpty")}
          </div>
        )}

        {!loading &&
          displayItems.map((folder) => {
            const depth = folder.path.split("/").length;
            const displayName = isFiltering ? folder.path : folder.name;
            const paddingLeft = isFiltering ? 12 : 8 + (depth - 1) * 16;
            const isSelected = value === folder.path;
            return (
              <button
                key={folder.path}
                type="button"
                onClick={() => onChange(folder.path)}
                style={{ paddingLeft: `${paddingLeft}px` }}
                className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-sm transition-colors ${
                  isSelected
                    ? "bg-accent/10 text-accent"
                    : "text-text-primary hover:bg-bg-elevated"
                }`}
              >
                <FolderIcon
                  size={14}
                  className={`shrink-0 ${isSelected ? "text-accent" : "text-text-muted"}`}
                />
                <span className="truncate">{displayName}</span>
              </button>
            );
          })}
      </div>

      {/* Selected path */}
      <div className="flex items-center gap-2 rounded-2xl border border-bg-border bg-bg-primary px-4 py-2.5 text-sm text-text-primary">
        <FolderIcon size={14} className="shrink-0 text-text-muted" />
        <span className="text-text-muted">{t("folderSelectedLabel")}:</span>
        <span className="truncate font-medium">
          {value ? `/${value}` : `/${t("folderRoot")}`}
        </span>
      </div>
    </div>
  );
}
