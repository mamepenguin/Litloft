"use client";

import { useState } from "react";
import { ArrowDownUp, ChevronRight, Download, Filter, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { getDownloadUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import {
  MENU_SURFACE,
  MenuRadioGroup,
  MenuSeparator,
  ToolbarMenu,
} from "@/components/ToolbarMenu";
import { ViewMenu } from "@/components/ViewMenu";
import type { ArchiveContents, FileType } from "@/types";
import type { ArchiveSortKey, ArchiveSortOrder } from "./useArchiveSort";

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

interface SortValue {
  sort: ArchiveSortKey;
  order: ArchiveSortOrder;
}

/**
 * Field and direction as one table, the way the folder toolbar offers them.
 *
 * `SortMenu` itself cannot be reused: its `SortField` is the folder's
 * vocabulary (`created_at`, `title`, `random`) and an archive entry has none
 * of those — a ZIP carries no per-entry timestamp this viewer reads. What is
 * shared is the shape, so this table is built on the same `MenuRadioGroup`
 * rather than on a second menu primitive.
 */
const SORT_OPTIONS: Array<{ value: SortValue; labelKey: string }> = [
  { value: { sort: "name", order: "asc" }, labelKey: "sortNameAsc" },
  { value: { sort: "name", order: "desc" }, labelKey: "sortNameDesc" },
  { value: { sort: "size", order: "asc" }, labelKey: "sortSizeAsc" },
  { value: { sort: "size", order: "desc" }, labelKey: "sortSizeDesc" },
  { value: { sort: "type", order: "asc" }, labelKey: "sortTypeAsc" },
  { value: { sort: "type", order: "desc" }, labelKey: "sortTypeDesc" },
];

const TYPE_FILTERS: Array<{ value: FileType | null; labelKey: string }> = [
  { value: null, labelKey: "filterAll" },
  { value: "image", labelKey: "filterImage" },
  { value: "document", labelKey: "filterText" },
  { value: "video", labelKey: "filterVideo" },
  { value: "audio", labelKey: "filterAudio" },
  { value: "other", labelKey: "filterOther" },
];

/**
 * The scope a control on this bar keeps.
 *
 * `sm`, not the folder toolbar's `md`. Measured in Chromium with a coarse
 * pointer at 375 / 400 / 430 / 768 / 1512, both locales, all three orders:
 * the widest row is Japanese with the size order — `サイズ 大→小` 129 +
 * `すべて` 87 + `グリッド表示` 126, two 8px gaps and 32px of `px-4` =
 * **390**, and it is the one combination that took two rows at 375. So the
 * measured need is a fold below 390, not below 640.
 *
 * The breakpoint is 640 anyway, and deliberately: 390 is a *translation's*
 * width, not the layout's, and a longer word in a locale nobody measured
 * moves it. A standard breakpoint with 250px of headroom absorbs that; an
 * arbitrary `min-[400px]` fits today's strings exactly and breaks on the
 * next one. The cost is the 430-639 band folding two controls it had room
 * for, where the folder toolbar — six controls, not three — folds anyway.
 */
export const BAR_ROOMY = {
  className: "hidden sm:flex",
  "data-bar": "roomy",
} as const;

interface SortGroupProps {
  sort: ArchiveSortKey;
  order: ArchiveSortOrder;
  onSelect: (value: SortValue) => void;
}

/** The "which order" rows, without a control around them. */
function ArchiveSortGroup({ sort, order, onSelect }: SortGroupProps) {
  const t = useTranslations("archive");
  const tSort = useTranslations("sort");
  return (
    <MenuRadioGroup<SortValue>
      heading={tSort("label")}
      options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
      isSelected={(v) => v.sort === sort && v.order === order}
      onSelect={onSelect}
    />
  );
}

interface TypeGroupProps {
  typeFilter: FileType | null;
  onSelect: (value: FileType | null) => void;
}

/** The "which kind of entry" rows, without a control around them. */
function ArchiveTypeGroup({ typeFilter, onSelect }: TypeGroupProps) {
  const t = useTranslations("archive");
  const tToolbar = useTranslations("toolbar");
  return (
    <MenuRadioGroup<FileType | null>
      heading={tToolbar("fileType")}
      options={TYPE_FILTERS.map((f) => ({ value: f.value, label: t(f.labelKey) }))}
      isSelected={(value) => value === typeFilter}
      onSelect={onSelect}
    />
  );
}

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
  const tSort = useTranslations("sort");
  const tToolbar = useTranslations("toolbar");
  const [moreOpen, setMoreOpen] = useState(false);

  const activeSort = SORT_OPTIONS.find(
    (o) => o.value.sort === sort && o.value.order === order
  );
  const activeFilter = TYPE_FILTERS.find((f) => f.value === typeFilter);

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

      <div
        data-testid="archive-controls"
        className="flex items-center gap-2 px-4 py-2"
      >
        <ToolbarMenu
          label={tSort("label")}
          value={activeSort ? t(activeSort.labelKey) : tSort("label")}
          icon={ArrowDownUp}
          {...BAR_ROOMY}
          align="start"
        >
          {(close) => (
            <ArchiveSortGroup
              sort={sort}
              order={order}
              onSelect={(v) => {
                // Two setters behind one row: `useArchiveSort` keeps field
                // and direction apart, and this menu is the only caller that
                // moves both. Collapsing them in the hook would leave its own
                // tests asserting a shape nothing renders.
                onSortChange(v.sort);
                onOrderChange(v.order);
                close();
              }}
            />
          )}
        </ToolbarMenu>

        <ToolbarMenu
          label={tToolbar("fileType")}
          value={activeFilter ? t(activeFilter.labelKey) : t("filterAll")}
          icon={Filter}
          {...BAR_ROOMY}
          align="start"
        >
          {(close) => (
            <ArchiveTypeGroup
              typeFilter={typeFilter}
              onSelect={(value) => {
                onTypeFilterChange(value);
                close();
              }}
            />
          )}
        </ToolbarMenu>

        {/* The same rows, at the widths where the two controls are off the
            bar. `sm:hidden` and `BAR_ROOMY` are the two halves of one
            decision: a control that leaves the bar has to arrive here, or a
            reader who finds neither has lost the function. */}
        {/* `sm:hidden` written out, not built from `BAR_ROOMY`: Tailwind
            emits a utility only when it finds the literal token in a source
            file, and a class assembled at runtime produces no CSS at all.
            That the two widths agree is asserted in the test instead. */}
        <div className="relative sm:hidden">
          <button
            onClick={() => setMoreOpen((open) => !open)}
            className="flex items-center justify-center rounded-2xl border border-bg-border bg-bg-card p-2 text-text-muted transition-colors hover:text-text-primary pointer-coarse:h-11 pointer-coarse:w-11"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label={tToolbar("more")}
            title={tToolbar("more")}
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
              <div role="menu" className={MENU_SURFACE}>
                <ArchiveSortGroup
                  sort={sort}
                  order={order}
                  onSelect={(v) => {
                    onSortChange(v.sort);
                    onOrderChange(v.order);
                    setMoreOpen(false);
                  }}
                />
                <MenuSeparator />
                <ArchiveTypeGroup
                  typeFilter={typeFilter}
                  onSelect={(value) => {
                    onTypeFilterChange(value);
                    setMoreOpen(false);
                  }}
                />
              </div>
            </>
          )}
        </div>

        <div className="ml-auto">
          <ViewMenu mode={viewMode} onSelect={onViewModeChange} />
        </div>
      </div>
    </div>
  );
}
