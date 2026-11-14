"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  CheckSquare,
  House,
  HousePlus,
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
import { AddonSlot } from "@/components/AddonSlot";
import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import { useImeKeyGuard } from "@/lib/ime";
import { FilterMenu } from "./FilterMenu";
import { Button } from "@/components/Button";
import { useViewModeState } from "@/components/viewMode";
import { ActionMenuItem } from "@/components/ActionMenuItem";
import { BAR_WIDE, MenuSeparator, useMenuSurface } from "@/components/ToolbarMenu";
import { SortGroup, SortMenu } from "./SortMenu";
import { DismissScrim } from "@/components/DismissScrim";
import { ViewGroup, ViewMenu } from "@/components/ViewMenu";
import { WidenTagScopeLink, type WidenTagScope } from "./WidenTagScopeLink";
import { SmartFolderMenuItems } from "@/components/SmartFolderSaveButton";
import { SegmentedControl } from "@/components/SegmentedControl";

/**
 * Addon rows in the `…` menu: commands over the files the listing holds.
 * Rows that put something into the folder belong to `ADD_MENU_SLOT` instead.
 * The row contract is the Add menu's.
 */
export const BULK_ACTIONS_MENU_SLOT = "folder-bulk-actions-menu";

/**
 * What the results bar shows on top of the ordinary toolbar. Present only on
 * the search page: every other listing has no Files / Passages switch, no
 * Scene search and no results count of its own.
 */
export interface FolderToolbarSearch {
  /** The switch renders only where a meaning search can run. */
  passagesApplicable: boolean;
  show: "files" | "passages";
  onShowChange: (next: "files" | "passages") => void;
  /** Absent for a query with operators: the filtered search ignores it. */
  showSceneSearch: boolean;
  sceneSearch: boolean;
  onSceneSearchChange: (next: boolean) => void;
  /** Files' count; `null` until the listing settles. */
  countLabel: string | null;
  /** Passages' counts; `null` while the meaning search is loading or failed. */
  passageCountLabel: string | null;
  passageCountShort: string | null;
  query: string;
  smartFolderId: string | null;
  /** The intelligence probe is asked for each time this is true. */
  showFind: boolean;
  onSelect: (url: string) => void;
  /** The tree pane is holding a selected file: Sort and View are put away. */
  hideArranging: boolean;
}

interface FolderToolbarProps {
  isSpecialView: boolean;
  /**
   * Is there a place to write into? Not the same as "is there a folder
   * path": the drive root is a place — its own `folder_path` is empty —
   * while a tag applied there widens the listing to the whole drive and
   * so is not.
   */
  isWriteDestination: boolean;
  isSearch?: boolean;
  search?: FolderToolbarSearch;
  /** The Passages view: sort, view mode, select, Play all and the … menu do not apply. */
  isPassages?: boolean;
  tagFilter?: string | null;
  hasPlayableFiles: boolean;
  sort: SortField;
  order: SortOrder;
  typeFilter: FileKind | null;
  trustFilter?: TrustFilter | null;
  total: number;
  /** Omitted means "not known", which is treated as "not empty". */
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
   * When omitted, `useViewModeState` holds it here and persists to the
   * global default key.
   */
  viewMode?: ViewMode;
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
  onReshuffle?: () => void;
  /**
   * Both or neither: without the flag the overflow row would have to
   * guess which of "Pin" and "Unpin" it is offering.
   */
  isPinned?: boolean;
  onTogglePin?: (folderPath: string) => void;
  /** Both or neither, like the pin pair; drawn only while the folder is pinned. */
  isOnHome?: boolean;
  onToggleHome?: (folderPath: string) => void;
  /**
   * Held by the page when a Smart Folder's overwrite button has to hand focus
   * here; the toolbar falls back to its own ref.
   */
  moreTriggerRef?: RefObject<HTMLButtonElement | null>;
}

export function FolderToolbar({
  isSpecialView, isWriteDestination, isSearch, search, isPassages, tagFilter, hasPlayableFiles,
  sort, order, typeFilter, trustFilter, total, folderCount, selectable, scanning,
  creatingFolder, newFolderName, folderError, fileIds, drive, folderPath,
  viewMode, widenTagScope,
  onSortChange, onTypeFilterChange, onTrustFilterChange, onViewChange, onToggleSelectable,
  onScan, onPlayAll, onSetCreatingFolder, onSetNewFolderName,
  onSetFolderError, onCreateFolder, onReshuffle,
  isPinned, onTogglePin, isOnHome, onToggleHome, moreTriggerRef: sharedMoreTriggerRef,
}: FolderToolbarProps) {
  const hideMutatingActions = !isWriteDestination;
  const hidePlayAll = isSpecialView || !!tagFilter || !!isSearch || !!isPassages;
  // When a filter is what emptied the listing, the chip that produced the
  // empty result is also the way back out of it.
  const isFiltered =
    typeFilter !== null || !!trustFilter || !!tagFilter || !!isSearch;

  const hideArrangingControls = total === 0 && folderCount === 0 && !isFiltered;
  const hideArranging = hideArrangingControls || !!search?.hideArranging;
  const t = useTranslations("toolbar");
  const tDrive = useTranslations("drive");
  const tc = useTranslations("common");
  const ts = useTranslations("selection");
  const tf = useTranslations("folder");
  const tSearch = useTranslations("search");
  const ime = useImeKeyGuard();

  const [moreOpen, setMoreOpen] = useState(false);
  const [moreDialogOpen, setMoreDialogOpen] = useState(false);
  const ownMoreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = sharedMoreTriggerRef ?? ownMoreTriggerRef;
  const moreSurface = useMenuSurface(moreOpen);
  const { hasSlot } = useAddonSlots();
  const showBulkRows = !hideMutatingActions && hasSlot(BULK_ACTIONS_MENU_SLOT);

  // Focus moves before the focused row unmounts, or it lands on `<body>`.
  const closeMore = useCallback(() => {
    setMoreDialogOpen(false);
    setMoreOpen(false);
    moreTriggerRef.current?.focus();
  }, []);

  // An entry that never reports `false` must not leave the next menu
  // ignoring Escape and outside presses.
  useEffect(() => {
    if (!moreOpen) setMoreDialogOpen(false);
  }, [moreOpen]);

  // `editingOnly: false`: nothing traps focus in this menu, and the default
  // would leave Escape inert once Tab walks out into a field.
  useShortcuts(
    "folder-more-menu",
    "Dialog",
    [
      {
        key: "escape",
        label: "Close",
        editingOnly: false,
        hidden: true,
        handler: () => {
          closeMore();
        },
      },
    ],
    moreOpen && !moreDialogOpen,
    OVERLAY_PRIORITY,
  );
  // Held here, not inside each menu. The same choice is offered twice — on
  // the bar from 768 up and inside `…` below it — and two switchers each
  // holding their own state would answer differently on the two sides of
  // that width.
  const view = useViewModeState(viewMode, onViewChange);
  // A drive root has no path to pin, and `""` would pin the drive itself.
  const pinnablePath = folderPath && onTogglePin ? folderPath : null;


  const leftActions = !hideMutatingActions ? (
    <AddButton
      onCreateFolder={() => onSetCreatingFolder(true)}
      addonProps={{ fileIds, drive, path: folderPath ?? "", surface: "library" }}
    />
  ) : null;

  /**
   * `w-full` and a **direct child of the wrapping row**. Nested in a group,
   * `w-full` is 100% of the group rather than of the row, so the group grows
   * and the controls beside it wrap instead.
   */
  const createFolderRow = creatingFolder ? (
    <div className="flex w-full items-center gap-2">
      <input
        type="text"
        autoFocus
        value={newFolderName}
        onChange={(e) => onSetNewFolderName(e.target.value)}
        onCompositionEnd={ime.onCompositionEnd}
        onKeyDown={(e) => {
          if (ime.isImeKeystroke(e)) return;
          if (e.key === "Enter") onCreateFolder();
          if (e.key === "Escape") {
            // A React `onKeyDown` is invisible to the shortcut registry; without
            // this an open `…` menu answers the same press.
            e.stopPropagation();
            onSetCreatingFolder(false); onSetNewFolderName(""); onSetFolderError(null);
          }
        }}
        placeholder={tf("namePlaceholder")}
        className="min-w-0 flex-1 rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring pointer-coarse:min-h-11 md:w-40 md:flex-initial"
      />
      {/* Not a second accent fill: Add stays on screen behind this row, so
          filling Create would put two on the bar at once. */}
      <Button
        variant="secondary"
        size="sm"
        onClick={onCreateFolder}
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
  ) : null;

  const showPlayAll = hasPlayableFiles && !hidePlayAll;

  return (
    <>
      {/* Must be a direct child of the flex column containing block so that
          sticky has sufficient height to actually stick.
          z-20 matches the Header so that FilterField's absolute search icon
          (z-10) is covered when the bar sticks. */}
      <div
        // The search bar never wraps: when a wide font leaves no room, the
        // Scene search label truncates instead of pushing `…` to a second row.
        className={`sticky top-0 z-20 mb-2 flex items-center gap-2 bg-bg-primary px-4 py-2 ${
          isSearch ? "flex-nowrap border-b border-bg-border" : "flex-wrap"
        }`}
      >
        {leftActions}

        {isSearch && search?.passagesApplicable && (
          <div className="w-[148px] flex-none sm:w-48">
            <SegmentedControl
              label={tSearch("viewLabel")}
              options={[
                { value: "files", label: tSearch("viewFiles") },
                { value: "passages", label: tSearch("viewPassages") },
              ]}
              value={search.show}
              onChange={search.onShowChange}
            />
          </div>
        )}

        {isSearch && search?.showSceneSearch && (
          <label className="inline-flex min-w-0 cursor-pointer select-none items-center gap-1.5 text-sm text-text-primary pointer-coarse:min-h-11 sm:gap-2">
            <input
              type="checkbox"
              checked={search.sceneSearch}
              onChange={(e) => search.onSceneSearchChange(e.target.checked)}
              className="h-4 w-4 flex-none"
            />
            <span className="min-w-0 truncate sm:hidden">{tSearch("sceneSearchToggleShort")}</span>
            <span className="hidden min-w-0 truncate sm:inline">{tSearch("sceneSearchToggle")}</span>
          </label>
        )}

        {/* `flex` on this div is what keeps the link at its content width.
            Without it the div is a block and the link fills it.

            `flex-1` gives the wrapper a base of zero. Wrapping is decided on
            base sizes, so that is what stops a long label pushing `…` onto a
            second row; `min-w-0` is what lets the link shrink below its
            content once the slack is gone. */}
        {widenTagScope ? (
          <div className="flex min-w-0 flex-1">
            <WidenTagScopeLink scope={widenTagScope} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {isSearch && search && (
          isPassages ? (
            <>
              {search.passageCountLabel && (
                <span
                  data-testid="passage-count"
                  className="hidden whitespace-nowrap text-xs text-text-muted sm:inline"
                >
                  {search.passageCountLabel}
                </span>
              )}
              {search.passageCountShort && (
                <span
                  data-testid="passage-count"
                  className="whitespace-nowrap text-xs text-text-muted sm:hidden"
                >
                  {search.passageCountShort}
                </span>
              )}
            </>
          ) : (
            search.countLabel && (
              <span className="whitespace-nowrap text-xs text-text-muted">
                {search.countLabel}
              </span>
            )
          )
        )}

        {/* Not accent-filled: the screen gets one fill and `Add` holds it.
            Below 768 Play is the control that leaves the bar, so Add, Filter
            and `…` share one row down to 320px. */}
        {showPlayAll && (
          <div {...BAR_WIDE}>
            <Button variant="secondary" size="sm" onClick={onPlayAll}>
              <Play size={16} />
              {tc("play")}
            </Button>
          </div>
        )}

        {!hideArranging && (
          <>
            {!isPassages && <ViewMenu mode={view.mode} onSelect={view.select} {...BAR_WIDE} />}
            {!isPassages && (
              <SortMenu
                sort={sort}
                order={order}
                onChange={onSortChange}
                allowRelevance={isSearch}
                onReshuffle={sort === "random" ? onReshuffle : undefined}
                {...BAR_WIDE}
              />
            )}
            {!isSearch && (
              <FilterMenu
                typeFilter={typeFilter}
                onTypeFilterChange={onTypeFilterChange}
                trustFilter={trustFilter}
                onTrustFilterChange={onTrustFilterChange}
              />
            )}
          </>
        )}

        {(!isPassages || isSearch) && (
        <div ref={moreSurface.wrapperRef} className="relative">
            <button
              ref={moreTriggerRef}
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
              <DismissScrim onDismiss={() => setMoreOpen(false)} disabled={moreDialogOpen}>
                <div
                  ref={moreSurface.panelRef}
                  role="menu"
                  className={moreSurface.className}
                >
                {/* `md:hidden` and `BAR_WIDE` are the two halves of one
                    decision: a control that leaves the bar has to arrive
                    here. */}
                {showPlayAll && (
                  <div className="md:hidden" role="presentation">
                    <ActionMenuItem
                      icon={Play}
                      label={tc("play")}
                      onClick={() => {
                        onPlayAll();
                        closeMore();
                      }}
                    />
                    <MenuSeparator />
                  </div>
                )}
                {!hideArranging && !isPassages && (
                  <div className="md:hidden" role="presentation">
                    <ViewGroup
                      mode={view.mode}
                      onSelect={(next) => {
                        view.select(next);
                        closeMore();
                      }}
                    />
                    <MenuSeparator />
                    <SortGroup
                      sort={sort}
                      order={order}
                      allowRelevance={isSearch}
                      onChange={(nextSort, nextOrder) => {
                        onSortChange(nextSort, nextOrder);
                        closeMore();
                      }}
                      onReshuffle={
                        sort === "random" && onReshuffle
                          ? () => {
                              onReshuffle();
                              closeMore();
                            }
                          : undefined
                      }
                    />
                    <MenuSeparator />
                  </div>
                )}
                {isSearch && search ? (
                  <>
                    <SmartFolderMenuItems
                      closeMenu={closeMore}
                      separated={!isPassages}
                    />
                    {!isPassages && (
                      <ActionMenuItem
                        icon={CheckSquare}
                        label={ts("selectMode")}
                        active={selectable}
                        onClick={() => {
                          onToggleSelectable();
                          closeMore();
                        }}
                      />
                    )}
                    {search.showFind && (
                      <AddonSlot
                        id="search-modes"
                        layout="stack"
                        props={{
                          query: search.query,
                          drive,
                          filter: typeFilter ?? "all",
                          onSelect: search.onSelect,
                          closeMenu: closeMore,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <ActionMenuItem
                      icon={CheckSquare}
                      label={ts("selectMode")}
                      active={selectable}
                      onClick={() => {
                        onToggleSelectable();
                        closeMore();
                      }}
                    />
                    {!isSearch && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          if (!scanning) onScan();
                          closeMore();
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
                          closeMore();
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
                    {pinnablePath && isPinned && onToggleHome && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          onToggleHome(pinnablePath);
                          closeMore();
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                      >
                        {isOnHome ? (
                          <House size={16} className="flex-shrink-0" />
                        ) : (
                          <HousePlus size={16} className="flex-shrink-0" />
                        )}
                        <span className="flex-1">
                          {isOnHome
                            ? tDrive("removeFromHome")
                            : tDrive("putOnHome")}
                        </span>
                      </button>
                    )}
                    {showBulkRows && (
                      /* The rule is this element's own border so `empty:hidden`
                         removes it with the rows when every entry draws nothing. */
                      <div
                        role="none"
                        className="mt-1 border-t border-bg-border pt-1 empty:hidden"
                      >
                        <AddonSlot
                          id={BULK_ACTIONS_MENU_SLOT}
                          layout="stack"
                          props={{
                            drive,
                            path: folderPath ?? "",
                            fileIds,
                            surface: "library",
                            onRequestClose: closeMore,
                            onDialogOpenChange: setMoreDialogOpen,
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
                </div>
              </DismissScrim>
            )}
        </div>
        )}

        {createFolderRow}
      </div>
    </>
  );
}
