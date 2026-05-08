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
}

interface FolderTreeRowProps {
  row: FlatTreeRow;
  selected: boolean;
  onSelect: (row: FlatTreeRow) => void;
}

const INDENT_PX = 16;

export function FolderTreeRow({ row, selected, onSelect }: FolderTreeRowProps) {
  const t = useTranslations("tree");
  const { node, depth, isExpanded, isLoading } = row;
  const isFolder = node.kind === "folder";
  const hasChildren = isFolder && node.has_children;
  const padLeft = 8 + depth * INDENT_PX;

  const baseClass =
    "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm transition-colors";
  const stateClass = selected
    ? "bg-accent/15 text-text-primary"
    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary";

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className={`${baseClass} ${stateClass}`}
      style={{ paddingLeft: padLeft }}
      aria-expanded={isFolder ? isExpanded : undefined}
      aria-label={node.name}
      title={node.path}
    >
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-text-muted">
        {isFolder ? (
          hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : null
        ) : null}
      </span>
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
    </button>
  );
}
