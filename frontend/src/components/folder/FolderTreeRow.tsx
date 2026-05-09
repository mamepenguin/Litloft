"use client";

import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { useTranslations } from "next-intl";

import { FileTypeIcon } from "@/components/FileTypeIcon";
import type { FolderTreeNode } from "@/types";

export interface FlatTreeRow {
  node: FolderTreeNode;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  /**
   * When the tree filter is active, ancestor rows are dimmed so the
   * matched leaf still reads cleanly. The tree pane sets this on rows
   * that are visible only as path context.
   */
  isAncestor?: boolean;
}

/**
 * Drag-and-drop event handlers exactly matching what
 * `useDragAndDrop.getDropTargetProps()` returns. The tree pane decides
 * whether to attach them per row (folders only, not self/descendant).
 */
export interface DropTargetEventProps {
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

interface FolderTreeRowProps {
  row: FlatTreeRow;
  selected: boolean;
  onSelect: (row: FlatTreeRow) => void;
  onToggle: (row: FlatTreeRow) => void;
  /**
   * Optional right-click handler. When provided, the row swallows the
   * browser context menu and bubbles a typed event up to the tree pane,
   * which mounts the appropriate FileContextMenu / FolderContextMenu.
   */
  onContextMenu?: (row: FlatTreeRow, event: React.MouseEvent) => void;
  /**
   * Drag-source callbacks. When both are set the row is `draggable`.
   * The pane decides between file-id and folder-path payloads based on
   * the row's node kind.
   */
  onDragStart?: (row: FlatTreeRow, event: React.DragEvent) => void;
  onDragEnd?: () => void;
  /**
   * Drop target wiring. When non-null, the row attaches the drop
   * handlers and is eligible to receive a drop. The pane returns null
   * for rows that are not folders or that would create an invalid move
   * (self / descendant of the dragged folder).
   */
  dropTargetProps?: DropTargetEventProps | null;
  /** True for the row currently being dragged — render at opacity 40. */
  isDragSource?: boolean;
  /** True for the row that holds the current drop highlight. */
  isDropHover?: boolean;
}

const INDENT_PX = 12;

export function FolderTreeRow({
  row,
  selected,
  onSelect,
  onToggle,
  onContextMenu,
  onDragStart,
  onDragEnd,
  dropTargetProps,
  isDragSource,
  isDropHover,
}: FolderTreeRowProps) {
  const t = useTranslations("tree");
  const { node, depth, isExpanded, isLoading } = row;
  const isFolder = node.kind === "folder";
  const hasChildren = isFolder && node.has_children;
  const padLeft = depth * INDENT_PX;

  const stateClass = selected
    ? isFolder
      ? "bg-bg-elevated font-medium text-text-primary"
      : "bg-accent/15 text-text-primary"
    : "text-text-primary hover:bg-bg-elevated";
  // Drop hover wins over the resting hover style: the accent ring +
  // tinted background must be visible regardless of the row's
  // selection or ancestor state.
  const dropHoverClass = isDropHover
    ? "ring-2 ring-accent ring-inset bg-accent/10"
    : "";
  const dragSourceClass = isDragSource ? "opacity-40" : "";
  const ancestorClass = row.isAncestor && !isDropHover ? "opacity-60" : "";
  const draggable = !!onDragStart;
  // `select-none` is required for the native HTML5 drag to actually
  // start: without it the browser interprets a mousedown-and-move on
  // the inner <span> text as a text-selection gesture instead of a
  // drag, even though the parent has draggable=true. (FolderCard
  // doesn't need this because its text lives inside an <a>, which
  // suppresses text selection naturally.) The cursor classes are
  // visual hints — `grab` invites the gesture, `grabbing` confirms it.
  const dragInteractClass = draggable
    ? isDragSource
      ? "cursor-grabbing select-none"
      : "cursor-grab select-none"
    : "";

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(row);
  };

  return (
    // NOTE: do NOT add role="button" / tabIndex={0} here. The
    // combination of `role="button" tabindex="0" draggable="true"`
    // makes browsers treat mousedown as a button-press waiting for
    // mouseup, and the native HTML5 drag never starts. The right pane's
    // FileList row is also a draggable <div> without role/tabIndex; we
    // match that pattern so the gesture works consistently. Keyboard
    // navigation across tree rows is not currently a feature; if/when
    // it is added, use arrow keys (the standard tree pattern), not tab.
    <div
      draggable={draggable}
      onDragStart={
        onDragStart
          ? (e) => {
              onDragStart(row, e);
            }
          : undefined
      }
      onDragEnd={onDragEnd}
      onDragEnter={dropTargetProps?.onDragEnter}
      onDragLeave={dropTargetProps?.onDragLeave}
      onDragOver={dropTargetProps?.onDragOver}
      onDrop={dropTargetProps?.onDrop}
      onClick={() => onSelect(row)}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(row, e);
            }
          : undefined
      }
      className={`mx-2 flex items-center gap-1 rounded-md pr-2 text-left text-sm transition-colors ${stateClass} ${dropHoverClass} ${dragSourceClass} ${ancestorClass} ${dragInteractClass}`.replace(/\s+/g, " ").trim()}
      style={{ paddingLeft: padLeft }}
      data-state={row.isAncestor ? "ancestor" : undefined}
      aria-current={selected ? "true" : undefined}
      title={node.path}
    >
      {/* Chevron: independent click target, never propagates to row.
          aria-expanded lives on the chevron (the disclosure control)
          rather than the row whose action is "select". */}
      {isFolder && hasChildren ? (
        <button
          type="button"
          onClick={handleChevronClick}
          aria-label={isExpanded ? t("collapse") : t("expand")}
          aria-expanded={isExpanded}
          className="flex h-7 w-6 flex-shrink-0 items-center justify-center text-text-muted hover:text-text-primary"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : (
        <span aria-hidden className="flex h-7 w-6 flex-shrink-0" />
      )}
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
        {isFolder ? (
          <Folder
            size={14}
            className={`flex-shrink-0 ${selected ? "text-accent" : "text-accent/70"}`}
          />
        ) : (
          <FileTypeIcon
            fileType={node.file_type}
            size={14}
            className={selected ? "text-accent" : "text-text-muted"}
          />
        )}
      </span>
      <span className="flex-1 truncate py-1.5">{node.name}</span>
      {isFolder && (
        <span className="ml-1 flex-shrink-0 text-xs text-text-muted">
          {isLoading ? t("loading") : node.file_count > 0 ? node.file_count : ""}
        </span>
      )}
    </div>
  );
}
