"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Search, X } from "lucide-react";
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
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("folderFilter")}
          className="w-full rounded-2xl border border-bg-border bg-bg-elevated py-2 pl-8 pr-8 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-text-muted transition-colors hover:text-text-primary"
            aria-label={t("folderFilterClear")}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Folder list */}
      <div className="max-h-44 overflow-y-auto rounded-xl border border-bg-border bg-bg-elevated">
        {/* Drive root — always visible */}
        <button
          type="button"
          onClick={() => onChange("")}
          className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors ${
            value === ""
              ? "bg-accent/10 font-semibold text-accent"
              : "text-text-muted hover:bg-bg-card hover:text-text-primary"
          }`}
        >
          <FolderOpen
            size={14}
            className={`shrink-0 ${value === "" ? "text-accent" : "text-text-muted"}`}
          />
          <span className="font-mono">/</span>
          <span className="text-text-muted">{t("folderRoot")}</span>
        </button>

        {/* Separator */}
        <div className="mx-3 border-t border-bg-border" />

        {loading && (
          <div className="px-3 py-4 text-center text-xs text-text-muted">
            {t("folderLoading")}
          </div>
        )}

        {!loading && isFiltering && displayItems.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-text-muted">
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
                className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-xs transition-colors ${
                  isSelected
                    ? "bg-accent/10 font-semibold text-accent"
                    : "text-text-primary hover:bg-bg-card"
                }`}
              >
                <FolderOpen
                  size={13}
                  className={`shrink-0 ${isSelected ? "text-accent" : "text-text-muted"}`}
                />
                <span className="truncate font-mono">{displayName}</span>
              </button>
            );
          })}
      </div>

      {/* Selected path badge */}
      <div className="flex items-center gap-1.5 rounded-xl bg-bg-elevated px-3 py-1.5">
        <span className="text-xs text-text-muted">{t("folderSelectedLabel")}:</span>
        <span className="truncate font-mono text-xs font-medium text-text-primary">
          {value || "/"}
        </span>
      </div>
    </div>
  );
}
