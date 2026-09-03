"use client";

import { ChevronRight, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { getDownloadUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { ViewToggle } from "../ViewToggle";
import type { ArchiveContents, FileType } from "@/types";

type ArchiveSortKey = "name" | "size" | "type";
type ArchiveSortOrder = "asc" | "desc";

interface ArchiveToolbarProps {
  fileId: string;
  archive: ArchiveContents | null;
  breadcrumbs: Array<{ label: string; path: string }>;
  handleBreadcrumbClick: (path: string) => void;
  sort: ArchiveSortKey;
  order: ArchiveSortOrder;
  typeFilter: FileType | null;
  viewMode: "grid" | "list";
  onSortChange: (sort: ArchiveSortKey) => void;
  onOrderChange: (order: ArchiveSortOrder) => void;
  onTypeFilterChange: (filter: FileType | null) => void;
  onViewModeChange: (mode: "grid" | "list") => void;
}

const TYPE_FILTERS: Array<{ value: FileType | ""; label: string }> = [
  { value: "", label: "filterAll" },
  { value: "image", label: "filterImage" },
  { value: "document", label: "filterText" },
  { value: "video", label: "filterVideo" },
  { value: "audio", label: "filterAudio" },
  { value: "other", label: "filterOther" },
];

export function ArchiveToolbar({
  fileId,
  archive,
  breadcrumbs,
  handleBreadcrumbClick,
  sort,
  order,
  typeFilter,
  viewMode,
  onSortChange,
  onOrderChange,
  onTypeFilterChange,
  onViewModeChange,
}: ArchiveToolbarProps) {
  const t = useTranslations("archive");

  return (
    <div className="mb-3 overflow-hidden rounded-xl bg-bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-bg-border px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight size={14} className="text-text-muted" />
              )}
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(crumb.path)}
                className={`text-sm transition-colors ${
                  i === breadcrumbs.length - 1
                    ? "font-medium text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        {archive && (
          <span className="flex items-center gap-2 text-xs text-text-muted">
            <span>
              {t("fileCount", {
                count: archive.total_entries,
                size: formatFileSize(archive.total_size),
              })}
            </span>
            <a
              href={getDownloadUrl(fileId)}
              download
              className="rounded-lg p-1 transition-colors hover:bg-bg-elevated hover:text-text-primary"
              aria-label={t("downloadArchive")}
              title={t("downloadArchive")}
            >
              <Download size={14} />
            </a>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <select
          data-testid="archive-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as ArchiveSortKey)}
          className="rounded-lg border border-bg-border bg-bg-primary px-2 py-1 text-xs text-text-primary"
        >
          <option value="name">{t("sortName")}</option>
          <option value="size">{t("sortSize")}</option>
          <option value="type">{t("sortType")}</option>
        </select>

        <select
          value={order}
          onChange={(e) => onOrderChange(e.target.value as ArchiveSortOrder)}
          className="rounded-lg border border-bg-border bg-bg-primary px-2 py-1 text-xs text-text-primary"
        >
          <option value="asc">{t("sortAsc")}</option>
          <option value="desc">{t("sortDesc")}</option>
        </select>

        <select
          data-testid="archive-type-filter"
          value={typeFilter ?? ""}
          onChange={(e) => {
            const val = e.target.value as FileType | "";
            onTypeFilterChange(val === "" ? null : val);
          }}
          className="rounded-lg border border-bg-border bg-bg-primary px-2 py-1 text-xs text-text-primary"
        >
          {TYPE_FILTERS.map(({ value, label }) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>

        <div className="ml-auto">
          <ViewToggle mode={viewMode} onChange={onViewModeChange} />
        </div>
      </div>
    </div>
  );
}
