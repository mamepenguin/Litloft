"use client";

import { useRef, useState } from "react";
import { ArrowDownUp, ChevronRight, Download, Filter, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { getDownloadUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import {
  useMenuSurface,
  MenuRadioGroup,
  MenuSeparator,
  ToolbarMenu,
} from "@/components/ToolbarMenu";
import { DismissScrim } from "@/components/DismissScrim";
import { TRAIL_ANCESTOR } from "@/components/Breadcrumb";
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
 * `SortMenu` cannot be reused: its `SortField` is the folder's vocabulary
 * (`created_at`, `title`, `random`) and an archive entry has none of those.
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
 * A standard breakpoint rather than an arbitrary `min-[400px]`: the width the
 * controls need is a translation's width, not the layout's, and a longer word
 * in another locale moves it.
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
  const moreRef = useRef<HTMLButtonElement>(null);
  const moreSurface = useMenuSurface(moreOpen);

  // Without restoring focus the menu unmounts with focus on `<body>`.
  const closeMore = () => {
    setMoreOpen(false);
    moreRef.current?.focus();
  };

  const activeSort = SORT_OPTIONS.find(
    (o) => o.value.sort === sort && o.value.order === order
  );
  const activeFilter = TYPE_FILTERS.find((f) => f.value === typeFilter);

  return (
    // No `overflow-hidden`: every menu on this bar is `absolute` inside
    // this card, so clipping to the card's box would hide the popovers.
    <div className="mb-3 rounded-xl bg-bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-bg-border px-4 py-2.5">
        <div
          data-testid="archive-trail"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
        >
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span
                key={crumb.path}
                className={`flex items-center gap-1${isLast ? "" : ` ${TRAIL_ANCESTOR}`}`}
              >
                {i > 0 && (
                  <ChevronRight size={14} className="flex-shrink-0 text-text-muted" />
                )}
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(crumb.path)}
                  className={`truncate text-sm transition-colors ${
                    isLast
                      ? "font-medium text-text-primary"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {crumb.label}
                </button>
              </span>
            );
          })}
        </div>

        {archive && (
          <span className="flex flex-shrink-0 items-center gap-2 text-xs text-text-muted">
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

        {/* `sm:hidden` and `BAR_ROOMY` are the two halves of one decision:
            a control that leaves the bar has to arrive here. Written out,
            not built from `BAR_ROOMY`: Tailwind emits a utility only when
            it finds the literal token in a source file. */}
        <div
          ref={moreSurface.wrapperRef}
          className="relative sm:hidden"
          // On the box, not on the menu: opening this leaves focus on the
          // trigger, which is outside the menu. `stopPropagation` because a
          // React `onKeyDown` is invisible to the shortcut registry, and an
          // Escape that also reaches `ShortcutsProvider` gets answered twice.
          onKeyDown={(e) => {
            if (!moreOpen || e.key !== "Escape") return;
            e.stopPropagation();
            closeMore();
          }}
        >
          <button
            ref={moreRef}
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
            <DismissScrim onDismiss={closeMore}>
              <div
                ref={moreSurface.panelRef}
                role="menu"
                className={moreSurface.className}
              >
                <ArchiveSortGroup
                  sort={sort}
                  order={order}
                  onSelect={(v) => {
                    onSortChange(v.sort);
                    onOrderChange(v.order);
                    closeMore();
                  }}
                />
                <MenuSeparator />
                <ArchiveTypeGroup
                  typeFilter={typeFilter}
                  onSelect={(value) => {
                    onTypeFilterChange(value);
                    closeMore();
                  }}
                />
              </div>
            </DismissScrim>
          )}
        </div>

        <div className="ml-auto">
          <ViewMenu mode={viewMode} onSelect={onViewModeChange} />
        </div>
      </div>
    </div>
  );
}
