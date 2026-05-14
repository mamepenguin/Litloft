"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder, Search, X } from "lucide-react";
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
    <div className="flex flex-col gap-1">
      {/* Filter input */}
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
          className="w-full rounded-lg border border-bg-border bg-bg-primary py-1.5 pl-8 pr-7 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            aria-label={t("folderFilterClear")}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Folder list */}
      <div className="max-h-44 overflow-y-auto rounded-lg border border-bg-border bg-bg-elevated">
        {/* Drive root option — always visible */}
        <button
          type="button"
          onClick={() => onChange("")}
          className={`flex w-full items-center gap-2 border-b border-bg-border px-3 py-2 text-left text-xs transition-colors last:border-b-0 ${
            value === ""
              ? "bg-accent/10 font-medium text-accent"
              : "text-text-muted hover:bg-bg-card hover:text-text-primary"
          }`}
        >
          <Folder size={14} className="shrink-0" />
          <span className="font-mono">/</span>
          <span>{t("folderRoot")}</span>
        </button>

        {loading && (
          <div className="px-3 py-3 text-center text-xs text-text-muted">
            {t("folderLoading")}
          </div>
        )}

        {!loading && isFiltering && displayItems.length === 0 && (
          <div className="px-3 py-3 text-center text-xs text-text-muted">
            {t("folderEmpty")}
          </div>
        )}

        {!loading &&
          displayItems.map((folder) => {
            const depth = folder.path.split("/").length;
            const displayName = isFiltering ? folder.path : folder.name;
            const paddingLeft = isFiltering ? 12 : 8 + (depth - 1) * 16;
            return (
              <button
                key={folder.path}
                type="button"
                onClick={() => onChange(folder.path)}
                style={{ paddingLeft: `${paddingLeft}px` }}
                className={`flex w-full items-center gap-2 border-b border-bg-border py-2 pr-3 text-left text-xs transition-colors last:border-b-0 ${
                  value === folder.path
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-text-primary hover:bg-bg-card"
                }`}
              >
                <Folder size={14} className="shrink-0 text-text-muted" />
                <span className="truncate font-mono">{displayName}</span>
              </button>
            );
          })}
      </div>

      {/* Selected path indicator */}
      <p className="truncate text-xs text-text-muted">
        {t("folderSelectedLabel")}:{" "}
        <span className="font-mono text-text-primary">{value || "/"}</span>
      </p>
    </div>
  );
}
