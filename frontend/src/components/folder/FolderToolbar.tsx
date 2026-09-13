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
import { ActionMenuItem } from "@/components/ActionMenuItem";
import { BAR_WIDE, MenuSeparator, useMenuSurface } from "@/components/ToolbarMenu";
import { SortGroup, SortMenu } from "./SortMenu";
import { DismissScrim } from "@/components/DismissScrim";
import { ViewGroup, ViewMenu } from "@/components/ViewMenu";
import { WidenTagScopeLink, type WidenTagScope } from "./WidenTagScopeLink";

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
  /** Omitting the prop hides the "New Note" button. */
  onCreateFile?: () => void;
  onReshuffle?: () => void;
  /**
   * Both or neither: without the flag the overflow row would have to
   * guess which of "Pin" and "Unpin" it is offering.
   */
  isPinned?: boolean;
  onTogglePin?: (folderPath: string) => void;
}

export function FolderToolbar({
  isSpecialView, isWriteDestination, isSearch, tagFilter, hasPlayableFiles,
  sort, order, typeFilter, trustFilter, total, folderCount, selectable, scanning,
  creatingFolder, newFolderName, folderError, fileIds, drive, folderPath,
  viewMode, widenTagScope,
  onSortChange, onTypeFilterChange, onTrustFilterChange, onViewChange, onToggleSelectable,
  onScan, onPlayAll, onSetCreatingFolder, onSetNewFolderName,
  onSetFolderError, onCreateFolder, onCreateFile, onReshuffle,
  isPinned, onTogglePin,
}: FolderToolbarProps) {
  const hideMutatingActions = !isWriteDestination;
  const hidePlayAll = isSpecialView || !!tagFilter || !!isSearch;
  // When a filter is what emptied the listing, the chip that produced the
  // empty result is also the way back out of it.
  const isFiltered =
    typeFilter !== null || !!trustFilter || !!tagFilter || !!isSearch;

  const hideArrangingControls = total === 0 && folderCount === 0 && !isFiltered;
  const t = useTranslations("toolbar");
  const tc = useTranslations("common");
  const ts = useTranslations("selection");
  const tf = useTranslations("folder");

  const [moreOpen, setMoreOpen] = useState(false);
  const moreSurface = useMenuSurface(moreOpen);
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
      onCreateFile={onCreateFile}
      addonProps={{ fileIds, drive, path: folderPath ?? "" }}
    />
  ) : null;

  /**
   * `w-full` and a **direct child of the wrapping row**, not a sibling of
   * `Add` inside the left group. Nested there, `w-full` is 100% of the
   * group rather than of the row, so the group grows and the row it sits
   * on wraps instead.
   */
  const createFolderRow = creatingFolder ? (
    <div className="flex w-full items-center gap-2">
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

  return (
    <>
      {/* `md`, not `sm`, and the same 768 the arranging menus use: the left
          group on the bar at 640 wraps it as soon as the New Folder field
          opens. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-1 md:hidden">
        {leftActions}
        {createFolderRow}
      </div>

      {/* Must be a direct child of the flex column containing block so that
          sticky has sufficient height to actually stick.
          z-20 matches the Header so that FilterField's absolute search icon
          (z-10) is covered when the bar sticks. */}
      <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 bg-bg-primary px-4 py-2">
        {leftActions && (
          <div className="hidden items-center gap-2 md:flex">
            {leftActions}
          </div>
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

        {/* Not the overflow menu, and not accent-filled: playing a music
            album or a video folder is a first-class action, but the screen
            gets one fill and `Add` holds it. */}
        {hasPlayableFiles && !hidePlayAll && (
          <Button
            // Its word survives 375px. The mobile rule reduces the *number*
            // of controls on the bar, not their labels.
            variant="secondary"
            size="sm"
            onClick={onPlayAll}
          >
            <Play size={16} />
            {tc("play")}
          </Button>
        )}

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
            <FilterMenu
              typeFilter={typeFilter}
              onTypeFilterChange={onTypeFilterChange}
              trustFilter={trustFilter}
              onTrustFilterChange={onTrustFilterChange}
            />
          </>
        )}

        <div ref={moreSurface.wrapperRef} className="relative">
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
              <DismissScrim onDismiss={() => setMoreOpen(false)}>
                <div
                  ref={moreSurface.panelRef}
                  role="menu"
                  className={moreSurface.className}
                >
                {/* `md:hidden` and `BAR_WIDE` are the two halves of one
                    decision: a control that leaves the bar has to arrive
                    here. */}
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
                <ActionMenuItem
                  icon={CheckSquare}
                  label={ts("selectMode")}
                  active={selectable}
                  onClick={() => {
                    onToggleSelectable();
                    setMoreOpen(false);
                  }}
                />
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
              </DismissScrim>
            )}
        </div>

        {/* The wrapper is inside the condition, not around the contents: an
            always-rendered `w-full` box is a flex item whether or not it
            holds anything, so an empty one takes a line and the row-gap
            with it. */}
        {createFolderRow && (
          <div className="hidden w-full md:block">{createFolderRow}</div>
        )}
      </div>
    </>
  );
}
