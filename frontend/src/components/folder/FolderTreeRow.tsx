"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
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

interface FolderTreeRowProps {
  row: FlatTreeRow;
  selected: boolean;
  onSelect: (row: FlatTreeRow) => void;
  onToggle: (row: FlatTreeRow) => void;
}

const INDENT_PX = 16;
const CHEVRON_HIT_PX = 24;

export function FolderTreeRow({ row, selected, onSelect, onToggle }: FolderTreeRowProps) {
  const t = useTranslations("tree");
  const { node, depth, isExpanded, isLoading } = row;
  const isFolder = node.kind === "folder";
  const hasChildren = isFolder && node.has_children;
  const padLeft = depth * INDENT_PX;

  const baseClass =
    "flex w-full items-center gap-1 pr-2 text-left text-sm transition-colors";
  const stateClass = selected
    ? "bg-accent/15 text-text-primary"
    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary";
  const ancestorClass = row.isAncestor ? "opacity-60" : "";

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(row);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(row);
        }
      }}
      className={`${baseClass} ${stateClass} ${ancestorClass}`.trim()}
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
          className="flex flex-shrink-0 items-center justify-center text-text-muted hover:text-text-primary"
          style={{ width: CHEVRON_HIT_PX, height: CHEVRON_HIT_PX }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : (
        <span
          aria-hidden
          className="flex flex-shrink-0 items-center justify-center"
          style={{ width: CHEVRON_HIT_PX, height: CHEVRON_HIT_PX }}
        />
      )}
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
        {isFolder ? (
          <span aria-hidden className="text-base leading-none">📁</span>
        ) : (
          <FileTypeIcon fileType={node.file_type} size={14} />
        )}
      </span>
      <span className="flex-1 truncate">{node.name}</span>
      {isFolder && (
        <span className="ml-1 flex-shrink-0 text-xs text-text-muted">
          {isLoading ? t("loading") : node.file_count > 0 ? node.file_count : ""}
        </span>
      )}
    </div>
  );
}
