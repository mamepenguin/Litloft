"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { FileItem, FileItemWithMatch } from "@/types";
import { useContextMenu } from "@/hooks/useContextMenu";
import type { ExtraMenuItems } from "@/hooks/useFileMenuItems";
import { useJustifiedFlip } from "@/hooks/useJustifiedFlip";
import { useJustifiedHold } from "@/hooks/useJustifiedHold";
import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import { deriveListMeta } from "@/lib/listMeta";
import { FileCard } from "./FileCard";
import { JustifiedFileCell } from "./JustifiedFileCell";
import { FileContextMenu } from "./FileContextMenu";
import { MatchOverlay } from "./MatchOverlay";

export function FileGrid({
  files,
  moreMayFollow = false,
  onFavoriteToggle,
  onRefresh,
  selectable,
  selectedIds,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  sortQuery,
  appCardMenu = false,
  draggable,
  draggedIds,
  onDragStart,
  onDragEnd,
  extraMenuItems,
}: {
  files: FileItemWithMatch[];
  /** Whether a later page may still be appended to `files`. */
  moreMayFollow?: boolean;
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
  selectable?: boolean;
  /**
   * Selection is passed as a set, not as an `(id) => boolean`
   * predicate: the predicate's identity changes on every selection
   * change, which would make `FileCard`'s `memo` a no-op. Resolving it
   * to a per-card boolean here keeps the memo effective.
   */
  selectedIds?: ReadonlySet<string>;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
  /**
   * The app card menu, as on the Video and Reading cards: Open in new tab,
   * rows that act in the click, and no text selection on a card.
   */
  appCardMenu?: boolean;
  draggable?: boolean;
  /** Same reasoning as `selectedIds` — a `string[]` would defeat memo. */
  draggedIds?: ReadonlySet<string>;
  onDragStart?: (e: React.DragEvent, fileId: string) => void;
  onDragEnd?: () => void;
  /** Rows a caller draws above the shared file menu's own rows. */
  extraMenuItems?: ExtraMenuItems;
}) {
  const { menuState, close, handlers } = useContextMenu();
  const [target, setTarget] = useState<FileItem | null>(null);
  const { ref: gridRef, columns } = useCardColumns();
  const justifiedRef = useRef<HTMLDivElement | null>(null);
  // Carries the packed rows across a change to the set. Declared here
  // rather than inside the branch below because a hook cannot be: the
  // ref is null on every render that takes the card branch, and the hook
  // does nothing then.
  useJustifiedFlip(justifiedRef);
  // After the flip, which reads the hold this commit replaces.
  useJustifiedHold(justifiedRef, moreMayFollow);

  const { showExtensionBadge, justifyThumbnails } = useMemo(
    () => deriveListMeta(files),
    [files],
  );

  const { onContextMenu: openMenu, onTouchStart: startLongPress } = handlers;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: FileItem) => {
      setTarget(file);
      openMenu(e);
    },
    [openMenu],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, file: FileItem) => {
      setTarget(file);
      startLongPress(e);
    },
    [startLongPress],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, file: FileItem) => {
      onDragStart?.(e, file.id);
    },
    [onDragStart],
  );

  const openInNewTab =
    appCardMenu && target !== null
      ? () => {
          window.open(fileLinkHref(target, sortQuery), "_blank");
        }
      : undefined;

  const cardProps = (file: FileItemWithMatch) => ({
    file,
    onFavoriteToggle,
    onContextMenu: handleContextMenu,
    onTouchStart: handleTouchStart,
    onTouchEnd: handlers.onTouchEnd,
    onTouchMove: handlers.onTouchMove,
    selectable,
    selected: selectedIds?.has(file.id),
    onSelect,
    onMetaSelect,
    onShiftSelect,
    sortQuery,
    appCardMenu,
    draggable,
    isDragging: draggedIds?.has(file.id),
    onDragStart: onDragStart ? handleDragStart : undefined,
    onDragEnd,
  });

  // A search result set is not packed even when it is all photographs:
  // the match overlay is a per-row column that is saying something, and
  // a justified cell has nowhere to put it.
  const hasMatchMeta = files.some((file) => file.match_meta);

  if (justifyThumbnails && !hasMatchMeta) {
    return (
      <>
        <div className="justified-grid-host">
          <div className="justified-grid" ref={justifiedRef}>
            {files.map((file) => (
              <JustifiedFileCell key={file.id} {...cardProps(file)} />
            ))}
            {/* Absorbs the last line's slack. See globals.css. */}
            <div className="justified-grid-tail" aria-hidden />
          </div>
        </div>

        <FileContextMenu
          open={menuState.open}
          position={menuState.position}
          target={target}
          onClose={close}
          onUpdate={onRefresh}
          extraMenuItems={extraMenuItems}
          onOpenInNewTab={openInNewTab}
          immediateRows={appCardMenu}
        />
      </>
    );
  }

  return (
    <>
      <div
        ref={gridRef}
        className="grid gap-x-3 gap-y-6"
        style={{ gridTemplateColumns: cardGridTemplate(columns) }}
      >
        {files.map((file) => (
          <FileCard
            key={file.id}
            {...cardProps(file)}
            showExtensionBadge={showExtensionBadge}
            matchOverlay={
              file.match_meta ? (
                <MatchOverlay match={file.match_meta} fileId={file.id} file={file} />
              ) : undefined
            }
          />
        ))}
      </div>

      <FileContextMenu
        open={menuState.open}
        position={menuState.position}
        target={target}
        onClose={close}
        onUpdate={onRefresh}
        extraMenuItems={extraMenuItems}
        onOpenInNewTab={openInNewTab}
        immediateRows={appCardMenu}
      />
    </>
  );
}
