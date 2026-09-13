"use client";

import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { useTranslations } from "next-intl";

import { FileTypeIcon } from "@/components/FileTypeIcon";
import { InlineNameEditor } from "@/components/InlineNameEditor";
import { RENAME_FOCUS_ATTR } from "@/hooks/useInlineRename";
import type { FolderTreeNode } from "@/types";

export interface FlatTreeRow {
  node: FolderTreeNode;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  /** Set on rows that are visible only as path context. */
  isAncestor?: boolean;
}

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
  onContextMenu?: (row: FlatTreeRow, event: React.MouseEvent) => void;
  onDragStart?: (row: FlatTreeRow, event: React.DragEvent) => void;
  onDragEnd?: () => void;
  dropTargetProps?: DropTargetEventProps | null;
  isDragSource?: boolean;
  isDropHover?: boolean;
  isEditing?: boolean;
  onRenameCommit?: (next: string) => Promise<void>;
  onRenameCancel?: (error?: string) => void;
  onRowFocus?: () => void;
  onRowBlur?: () => void;
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
  isEditing,
  onRenameCommit,
  onRenameCancel,
  onRowFocus,
  onRowBlur,
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
  const dropHoverClass = isDropHover
    ? "ring-2 ring-accent ring-inset bg-accent/10"
    : "";
  const dragSourceClass = isDragSource ? "opacity-40" : "";
  const ancestorClass = row.isAncestor && !isDropHover ? "opacity-60" : "";
  // A text selection inside a `draggable` ancestor is swallowed by the drag
  // system, so the field would be impossible to select in.
  const draggable = !!onDragStart && !isEditing;
  // `select-none` is required for the native HTML5 drag to actually
  // start: without it the browser interprets a mousedown-and-move on
  // the inner <span> text as a text-selection gesture instead of a
  // drag, even though the parent has draggable=true.
  const dragInteractClass = draggable
    ? isDragSource
      ? "cursor-grabbing select-none"
      : "cursor-grab select-none"
    : "";

  const icon = isFolder ? (
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
  );

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(row);
  };

  // Critical structure: the draggable container <div> must NOT carry the
  // primary click handler. When `draggable=true` and `onClick` live on
  // the same element AND the visible click area is inline text in a
  // <span>, browsers prefer the click gesture and the native HTML5
  // dragstart never fires.
  return (
    <div
      draggable={draggable}
      onDragStart={
        onDragStart && !isEditing
          ? (e) => {
              onDragStart(row, e);
            }
          : undefined
      }
      onDragEnd={isEditing ? undefined : onDragEnd}
      onFocus={onRowFocus}
      onBlur={onRowBlur}
      onDragEnter={dropTargetProps?.onDragEnter}
      onDragLeave={dropTargetProps?.onDragLeave}
      onDragOver={dropTargetProps?.onDragOver}
      onDrop={dropTargetProps?.onDrop}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(row, e);
            }
          : undefined
      }
      className={`mx-2 flex items-center gap-1 rounded-lg pr-2 text-left text-sm transition-colors ${stateClass} ${dropHoverClass} ${dragSourceClass} ${ancestorClass} ${dragInteractClass}`.replace(/\s+/g, " ").trim()}
      style={{ paddingLeft: padLeft }}
      data-state={row.isAncestor ? "ancestor" : undefined}
      aria-current={selected ? "true" : undefined}
      title={node.path}
    >
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
      {/* While editing this degrades to a plain container — a text field
          inside a <button> would both be invalid and navigate on every
          click. */}
      {isEditing && onRenameCommit && onRenameCancel ? (
        <span className="flex flex-1 items-center gap-1 overflow-hidden py-0.5">
          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
            {icon}
          </span>
          <InlineNameEditor
            initialName={node.name}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onSelect(row)}
          {...{ [RENAME_FOCUS_ATTR]: node.path }}
          className="flex flex-1 items-center gap-1 overflow-hidden rounded-lg text-left"
        >
          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
            {icon}
          </span>
          <span className="flex-1 truncate py-1.5">{node.name}</span>
        </button>
      )}
      {isFolder && (
        <span className="ml-1 flex-shrink-0 text-xs text-text-muted">
          {isLoading ? t("loading") : node.file_count > 0 ? node.file_count : ""}
        </span>
      )}
    </div>
  );
}
