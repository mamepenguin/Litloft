"use client";

import { useState } from "react";
import {
  CheckSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  X,
} from "lucide-react";

import { useTranslations } from "next-intl";
import type { FileKind, SortField, SortOrder, TrustFilter, ViewMode } from "@/types";
import { AddButton } from "@/components/AddButton";
import { FilterMenu } from "./FilterMenu";
import { Button } from "@/components/Button";
import { useViewModeState } from "@/components/viewMode";
import { AddonSlot } from "@/components/AddonSlot";
import { BAR_WIDE, MENU_SURFACE, MenuSeparator } from "./ToolbarMenu";
import { SortGroup, SortMenu } from "./SortMenu";
import { ViewGroup, ViewMenu } from "./ViewMenu";
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
  typeFilter: FileKind | null;
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
  onTypeFilterChange: (t: FileKind | null) => void;
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
  /**
   * Whether this folder is already pinned to the sidebar, and how to flip
   * it. Both or neither: without the flag the overflow row would have to
   * guess which of "Pin" and "Unpin" it is offering, and it is drawn on the
   * one folder a reader is already looking at.
   *
   * Omitted wherever there is no single folder to pin — search, the flat
   * virtual views, and the drive root, whose path is empty.
   */
  isPinned?: boolean;
  onTogglePin?: (folderPath: string) => void;
}

export function FolderToolbar({
  isSpecialView, isFolderAnchored, isSearch, tagFilter, hasPlayableFiles,
  sort, order, typeFilter, trustFilter, total, folderCount, selectable, scanning,
  creatingFolder, newFolderName, folderError, fileIds, drive, folderPath,
  viewMode, widenTagScope,
  onSortChange, onTypeFilterChange, onTrustFilterChange, onViewChange, onToggleSelectable,
  onScan, onPlayAll, onSetCreatingFolder, onSetNewFolderName,
  onSetFolderError, onCreateFolder, onCreateFile, onReshuffle,
  isPinned, onTogglePin,
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
  const tf = useTranslations("folder");

  const [moreOpen, setMoreOpen] = useState(false);
  // Held here, not inside each menu. The same choice is offered twice — on
  // the bar above 640px and inside `…` below it — and two switchers each
  // holding their own uncontrolled state would answer differently on the two
  // sides of that width.
  const view = useViewModeState(viewMode, onViewChange);
  // A drive root has no path to pin, and `""` would pin the drive itself.
  const pinnablePath = folderPath && onTogglePin ? folderPath : null;


  // Left mutating actions — rendered in two places:
  // mobile (normal flow, above the sticky bar) and desktop (inside the sticky bar).
  const leftActions = !hideMutatingActions ? (
    <>
      <AddButton
        onCreateFolder={() => onSetCreatingFolder(true)}
        onCreateFile={onCreateFile}
        addonProps={{ fileIds, drive, path: folderPath ?? "" }}
      />

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
            className="min-w-0 flex-1 rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring pointer-coarse:min-h-11 sm:w-40 sm:flex-initial"
          />
          {/* Not a second accent fill. This row opens from the Add menu and
              Add stays on screen behind it, so filling Create would put two
              on the bar at once — the state §2.2 exists to prevent. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={onCreateFolder}
            // Cancel beside it is `iconOnly`, which carries `Button`'s own
            // `-inset-1.5` overhang: 6px of reach on each side into an 8px
            // gap, so it clears 44 without colliding with this button's box.
            // This one has a label and no overhang, so it needs the height.
            className="pointer-coarse:min-h-11"
          >
            {tc("create")}
          </Button>
          <Button
            iconOnly
            variant="ghost"
            aria-label={tc("cancel")}
            onClick={() => { onSetCreatingFolder(false); onSetNewFolderName(""); onSetFolderError(null); }}
          >
            <X size={16} />
          </Button>
          {folderError && <span className="text-xs text-danger">{folderError}</span>}
        </div>
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
        {/* The standalone form of the addon slot, superseded by the rows
            `AddButton` draws from `folder-actions-menu`. It is still
            rendered so an addon that has not moved yet keeps its entry
            point; an addon moves by changing which id its manifest
            declares, and this renders nothing once the old slot is empty.
            Delete the two call sites when no manifest names it. */}
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

        {/* Desktop only: the superseded `folder-actions` slot (see above) */}
        <div className="hidden sm:block">
          <AddonSlot id="folder-actions" layout="stack" props={{ fileIds, drive, path: folderPath ?? "" }} />
        </div>

        {/* The link takes the slack the spacer would have taken, rather than
            sitting beside it at its full width. `flex-1` gives it a base of
            zero, and wrapping is decided on base sizes — so a long label
            shortens the link instead of pushing `…` onto a second row. */}
        {widenTagScope ? (
          <div className="min-w-0 flex-1">
            <WidenTagScopeLink scope={widenTagScope} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* RIGHT: view controls */}
        {/* Not the overflow menu, and not accent-filled. hako
            `55N_yML35Q2jdVBsCxc06` settles both halves: playing a music album
            or a video folder is a first-class action, so it stays exposed
            wherever the folder has something to play — but §2.2 gives the
            screen one fill and `Add` holds it. */}
        {hasPlayableFiles && !hidePlayAll && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onPlayAll}
            // Its word survives 375px. The mobile rule reduces the *number*
            // of controls on the bar, and dropping the label instead would
            // put back the unnamed icon 案 2 is spending this whole PR
            // removing.
            className="pointer-coarse:min-h-11"
          >
            <Play size={16} />
            {tc("play")}
          </Button>
        )}

        {/* Arranging: which layout, which order, which subset. All three
            carry a word; below 640px the first two move into `…` so the row
            stays one row. */}
        {!hideArrangingControls && (
          <>
            <ViewMenu mode={view.mode} onSelect={view.select} {...BAR_WIDE} />
            <SortMenu
              sort={sort}
              order={order}
              onChange={onSortChange}
              allowRelevance={isSearch}
              onReshuffle={sort === "random" ? onReshuffle : undefined}
              {...BAR_WIDE}
            />
            {/* One way in to narrowing the listing, where there were two
                unlabelled chips. `FilterMenu` holds both axes as sections. */}
            <FilterMenu
              typeFilter={typeFilter}
              onTypeFilterChange={onTypeFilterChange}
              trustFilter={trustFilter}
              onTrustFilterChange={onTrustFilterChange}
            />
          </>
        )}

        {/* Overflow: the low-frequency actions at every width, and the two
            arranging menus at the widths where they are off the bar. */}
        <div className="relative">
            <button
              onClick={() => setMoreOpen((s) => !s)}
              className={`flex items-center justify-center rounded-2xl border border-bg-border p-2 transition-colors pointer-coarse:h-11 pointer-coarse:w-11 ${
                selectable
                  ? "bg-bg-card text-text-primary"
                  : "bg-bg-card text-text-muted hover:text-text-primary"
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
                <div role="menu" className={MENU_SURFACE}>
                {/* The two menus that are not on the bar below 768px, drawn
                    from the same rows they draw there. `md:hidden` and
                    `BAR_WIDE` are the two halves of one decision: a control
                    that leaves the bar has to arrive here, and a reader who
                    finds neither has lost the function. */}
                {!hideArrangingControls && (
                  <div className="md:hidden" role="presentation">
                    <ViewGroup
                      mode={view.mode}
                      onSelect={(next) => {
                        view.select(next);
                        setMoreOpen(false);
                      }}
                    />
                    <MenuSeparator />
                    <SortGroup
                      sort={sort}
                      order={order}
                      allowRelevance={isSearch}
                      onChange={(nextSort, nextOrder) => {
                        onSortChange(nextSort, nextOrder);
                        setMoreOpen(false);
                      }}
                      onReshuffle={
                        sort === "random" && onReshuffle
                          ? () => {
                              onReshuffle();
                              setMoreOpen(false);
                            }
                          : undefined
                      }
                    />
                    <MenuSeparator />
                  </div>
                )}
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
                {pinnablePath && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      onTogglePin!(pinnablePath);
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                  >
                    {isPinned ? (
                      <PinOff size={16} className="flex-shrink-0" />
                    ) : (
                      <Pin size={16} className="flex-shrink-0" />
                    )}
                    <span className="flex-1">
                      {isPinned ? t("unpinFolder") : t("pinFolder")}
                    </span>
                  </button>
                )}
                </div>
              </>
            )}
        </div>

      </div>
    </>
  );
}
