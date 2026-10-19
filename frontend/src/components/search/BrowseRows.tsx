"use client";

import type { ReactElement } from "react";
import { ChevronLeft, Folder, X } from "lucide-react";

import type { BrowseNode } from "@/lib/folderBrowse";
import type { FileType } from "@/types";
import { FileTypeIcon } from "../FileTypeIcon";
import { LauncherRow } from "./LauncherRow";

interface BrowseRowsProps {
  rows: readonly BrowseNode[];
  selectedIndex: number;
  mobile: boolean;
  emptyText: string;
  onOpen: (node: BrowseNode) => void;
  onEnterFolder: (path: string) => void;
}

export function BrowseRows({
  rows,
  selectedIndex,
  mobile,
  emptyText,
  onOpen,
  onEnterFolder,
}: BrowseRowsProps): ReactElement {
  if (rows.length === 0) {
    return (
      <div className={`text-center text-sm text-text-muted ${mobile ? "py-12" : "py-8"}`}>{emptyText}</div>
    );
  }
  const size = mobile ? 18 : 16;
  return (
    <div className={mobile ? "py-1.5" : "max-h-[50vh] overflow-y-auto py-1.5"}>
      {rows.map((node, idx) => (
        <LauncherRow
          key={`${node.kind}:${node.path}`}
          index={idx}
          selected={selectedIndex === idx}
          mobile={mobile}
          icon={
            node.kind === "folder" ? (
              <Folder size={size} className="flex-shrink-0 text-text-muted" />
            ) : (
              <FileTypeIcon fileType={(node.file_type ?? "other") as FileType} size={size} />
            )
          }
          label={node.name}
          onOpen={() => onOpen(node)}
          onEnter={node.kind === "folder" ? () => onEnterFolder(node.path) : undefined}
        />
      ))}
    </div>
  );
}

export function BrowseChip({
  label,
  removeLabel,
  upLabel,
  onRemove,
  onUp,
}: {
  label: string;
  removeLabel: string;
  upLabel: string;
  onRemove: () => void;
  /** Absent at the drive root. */
  onUp?: () => void;
}): ReactElement {
  const iconButton =
    "inline-flex flex-shrink-0 items-center justify-center rounded-full p-0.5 text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11 pointer-coarse:min-w-11";
  return (
    <span className="flex min-w-0 max-w-[50%] flex-shrink items-center gap-1 rounded-full bg-sand py-0.5 pr-1 pl-2 text-xs font-semibold text-text-primary">
      {onUp && (
        <button type="button" onClick={onUp} aria-label={upLabel} className={iconButton}>
          <ChevronLeft size={12} />
        </button>
      )}
      <Folder size={12} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className={iconButton}
      >
        <X size={12} />
      </button>
    </span>
  );
}
