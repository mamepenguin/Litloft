"use client";

import { useState } from "react";
import {
  Check,
  CheckSquare,
  Filter,
  FilePlus,
  MoreHorizontal,
  Play,
  RefreshCw,
  ShieldCheck,
  Shuffle,
  X,
} from "lucide-react";

import { useTranslations } from "next-intl";
import type { FileType, SortField, SortOrder, TrustFilter, ViewMode } from "@/types";
import { SortButton } from "@/components/SortButton";
import { UploadButton } from "@/components/UploadButton";
import { ViewToggle } from "@/components/ViewToggle";
import { AddonSlot } from "@/components/AddonSlot";
import { WidenTagScopeLink, type WidenTagScope } from "./WidenTagScopeLink";

interface FolderToolbarProps {
  isSpecialView: boolean;
  /**
   * Is there a concrete folder to write into? Decided once by
   * FolderBrowser and passed down rather than re-derived here — this
   * component's own predicate used to disagree with FolderBrowser's, so
   * handing it `onCreateFile` during a tag filter changed nothing visible
   * (spec 2026-08-21-folder-scoped-tag-filter §6.2).
   */
  isFolderAnchored: boolean;
  isSearch?: boolean;
  tagFilter?: string | null;
  hasPlayableFiles: boolean;
  sort: SortField;
  order: SortOrder;
  typeFilter: FileType | null;
  trustFilter?: TrustFilter | null;
  total: number;
  /**
   * How many subfolders the listing holds, when the caller knows.
   * `total` counts files only, and a folder of eight folders and no
   * files is not empty — the view toggle lays those folders out too.
   * Omitted means "not known", which is treated as "not empty".
   */
  folderCount?: number;
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
  /**
   * The drive-wide destination for a tag currently scoped to a folder, or
   * null when there is nothing to widen. Decided by FolderBrowser so this
   * component and the empty state cannot disagree about when the door out
   * of folder scope is offered (spec
   * 2026-08-21-folder-scoped-tag-filter §8).
   */
  widenTagScope?: WidenTagScope | null;
  onSortChange: (s: SortField, o: SortOrder) => void;
  onTypeFilterChange: (t: FileType | null) => void;
  onTrustFilterChange?: (t: TrustFilter | null) => void;
  onViewChange: (mode: ViewMode) => void;
  onToggleSelectable: () => void;
  onScan: () => void;
  onPlayAll: () => void;
  onSetCreatingFolder: (v: boolean) => void;
  onSetNewFolderName: (v: string) => void;
  onSetFolderError: (v: string | null) => void;
  onCreateFolder: () => void;
  /**
   * When provided, render a "New Note" button that creates a blank
   * Markdown file in the current folder. Omitting the prop hides the
   * button — used by FolderBrowser to disable file creation where there
   * is no concrete folder to write into (search and the flat virtual
   * views). A folder-scoped tag filter does have one, so it keeps the
   * button (spec 2026-08-21-folder-scoped-tag-filter §6.1).
   */
  onCreateFile?: () => void;
  onReshuffle?: () => void;
}

const TRUST_OPTION_KEYS: ReadonlyArray<{ value: TrustFilter | null; labelKey: string }> = [
  { value: null, labelKey: "filterAll" },
  { value: "verified", labelKey: "filterVerified" },
  { value: "unreviewed", labelKey: "filterUnreviewed" },
];

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
  isSpecialView, isFolderAnchored, isSearch, tagFilter, hasPlayableFiles,
  sort, order, typeFilter, trustFilter, total, folderCount, selectable, scanning,
  creatingFolder, newFolderName, folderError, fileIds, drive, folderPath,
  viewMode, widenTagScope,
  onSortChange, onTypeFilterChange, onTrustFilterChange, onViewChange, onToggleSelectable,
  onScan, onPlayAll, onSetCreatingFolder, onSetNewFolderName,
  onSetFolderError, onCreateFolder, onCreateFile, onReshuffle,
}: FolderToolbarProps) {
  // Upload / New folder / New note all need the same thing: a folder to
  // write into. A folder-scoped tag filter now has one — the folder the
  // breadcrumb shows and the listing is scoped to. Search and the flat
  // virtual views genuinely have none.
  const hideMutatingActions = !isFolderAnchored;
  // Play All is not a mutating action; it has simply always been hidden
  // wherever the left group was. Keep its existing scope rather than
  // widening it as a side effect of the folder-anchor split.
  const hidePlayAll = isSpecialView || !!tagFilter || !!isSearch;
  // Sort order, view mode and the type chip are ways of arranging
  // things; with nothing to arrange they are a row of controls above an
  // empty page. Not so when a filter is what emptied it — the chip that
  // produced the empty result is also the way back out of it, and a
  // search still needs its sort to be widened.
  const isFiltered =
    typeFilter !== null || !!trustFilter || !!tagFilter || !!isSearch;
  const hideArrangingControls = total === 0 && folderCount === 0 && !isFiltered;
  const t = useTranslations("toolbar");
  const tc = useTranslations("common");
  const ts = useTranslations("selection");
  const tTrust = useTranslations("trustTier");
  const tf = useTranslations("folder");

  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [trustFilterOpen, setTrustFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const activeTypeOption = TYPE_OPTION_KEYS.find((opt) => opt.value === typeFilter);
  const activeTypeLabel = activeTypeOption ? t(activeTypeOption.labelKey) : t("all");
  const isTypeFiltered = typeFilter !== null;

  // Left mutating actions — rendered in two places:
  // mobile (normal flow, above the sticky bar) and desktop (inside the sticky bar).
  const leftActions = !hideMutatingActions ? (
    <>
      <UploadButton onCreateFolder={() => onSetCreatingFolder(true)} />

      {creatingFolder && (
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
  ) : null;

  return (
    <>
      {/* Mobile only: left actions + AddonSlot in normal flow (not sticky).
          Always rendered so AddonSlot appears in the left group on mobile
          even when hideMutatingActions is true. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-1 sm:hidden">
        {leftActions}
        <AddonSlot id="folder-actions" layout="stack" props={{ fileIds, drive, path: folderPath ?? "" }} />
      </div>

      {/* Sticky control bar.
          - Mobile: right-side controls only (sort/view/filter/more/count).
            Left actions + AddonSlot scroll away in the normal-flow row above.
          - Desktop (sm+): left actions + AddonSlot + right controls in one row.
          Must be a direct child of the flex column containing block so that
          sticky has sufficient height to actually stick.
          z-20 matches the Header so that FilterField's absolute search icon
          (z-10) is covered when the bar sticks. */}
      <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 bg-bg-primary px-4 py-2">
        {/* Desktop: left actions inside sticky bar */}
        {leftActions && (
          <div className="hidden items-center gap-2 sm:flex">
            {leftActions}
          </div>
        )}

        {/* Desktop only: AddonSlot in sticky bar */}
        <div className="hidden sm:block">
          <AddonSlot id="folder-actions" layout="stack" props={{ fileIds, drive, path: folderPath ?? "" }} />
        </div>

        {widenTagScope && <WidenTagScopeLink scope={widenTagScope} />}

        <div className="flex-1" />

        {/* RIGHT: view controls */}
        {hasPlayableFiles && !hidePlayAll && (
          <button
            onClick={onPlayAll}
            className="flex items-center gap-1.5 rounded-2xl bg-accent px-3 py-2 text-sm font-medium text-white transition-all hover:bg-accent-hover"
            aria-label={t("playAll")}
          >
            <Play size={16} />
            <span className="hidden sm:inline">{tc("play")}</span>
          </button>
        )}

        {/* Trust filter — sibling chip. Hidden where no handler is wired
            (archive listings and other non-drive surfaces). */}
        {onTrustFilterChange && !hideArrangingControls && (
          <div className="relative">
            <button
              onClick={() => setTrustFilterOpen((s) => !s)}
              className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm transition-colors ${
                trustFilter
                  ? "border-bg-border bg-bg-elevated text-text-primary font-medium"
                  : "border-bg-border bg-bg-card text-text-muted hover:text-text-primary"
              }`}
              aria-haspopup="menu"
              aria-expanded={trustFilterOpen}
              aria-label={tTrust("filterLabel")}
            >
              <ShieldCheck size={16} />
              {trustFilter && (
                <span className="text-sm font-medium">
                  {tTrust(
                    TRUST_OPTION_KEYS.find((o) => o.value === trustFilter)
                      ?.labelKey ?? "filterAll"
                  )}
                </span>
              )}
            </button>
            {trustFilterOpen && (
              <>
                <div
                  className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
                  aria-hidden="true"
                  onClick={() => setTrustFilterOpen(false)}
                />
                <div
                  role="menu"
                  className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-none sm:min-w-[160px] sm:overflow-visible sm:origin-top-right"
                >
                  {TRUST_OPTION_KEYS.map((opt) => (
                    <button
                      key={opt.labelKey}
                      role="menuitem"
                      onClick={() => {
                        onTrustFilterChange(opt.value);
                        setTrustFilterOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        (trustFilter ?? null) === opt.value
                          ? "bg-bg-elevated text-text-primary font-medium"
                          : "text-text-primary hover:bg-bg-elevated"
                      }`}
                    >
                      <span className="w-4 flex-shrink-0">
                        {(trustFilter ?? null) === opt.value && <Check size={14} />}
                      </span>
                      {tTrust(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Type filter — single chip + popover */}
        {!hideArrangingControls && (
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
        )}

        {sort === "random" && onReshuffle && !hideArrangingControls && (
          <button
            onClick={onReshuffle}
            className="rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary"
            aria-label={t("reshuffle")}
            title={t("reshuffle")}
          >
            <Shuffle size={16} />
          </button>
        )}

        {/* Sort + view toggle + overflow grouped in a single pill */}
        <div className="flex items-center gap-1 rounded-2xl bg-bg-elevated p-1">
          {!hideArrangingControls && (
            <>
              <SortButton
                sort={sort}
                order={order}
                onChange={onSortChange}
                allowRelevance={isSearch}
              />

              <ViewToggle mode={viewMode} onChange={onViewChange} />
            </>
          )}

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
    </>
  );
}
