"use client";

import { useRelativeDate } from "@/hooks/useRelativeDate";
import { useCallback, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import { getDaysRemaining } from "@/lib/trash";
import { getThumbnailUrl } from "@/lib/api";
import { formatDuration, formatFileSize } from "@/lib/format";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { ContextMenu, type MenuItem } from "@/components/ContextMenu";

interface TrashFileListProps {
  files: FileItem[];
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
}

export function TrashFileList({
  files, selectable, isSelected, onSelect, onMetaSelect, onShiftSelect,
  onRestore, onPurge,
}: TrashFileListProps) {
  const formatRelativeDate = useRelativeDate();
  const tt = useTranslations("trash");
  const [menuPos, setMenuPos] = useState<{ open: boolean; x: number; y: number }>({
    open: false, x: 0, y: 0,
  });
  const [target, setTarget] = useState<FileItem | null>(null);

  const closeMenu = useCallback(() => {
    setMenuPos({ open: false, x: 0, y: 0 });
  }, []);

  const menuItems: MenuItem[] = target ? [
    {
      icon: RotateCcw,
      label: tt("restore"),
      onClick: () => onRestore(target.id),
    },
    {
      icon: Trash2,
      label: tt("purge"),
      onClick: () => onPurge(target.id),
      danger: true,
    },
  ] : [];

  return (
    <>
      <div className="flex flex-col gap-2.5 sm:gap-2">
        {files.map((file) => {
          const hasThumbnail = file.has_thumbnail || file.file_type === "video" || file.file_type === "image";
          const hasDuration = (file.file_type === "video" || file.file_type === "audio") && file.duration != null;
          const fileSelected = isSelected?.(file.id);
          const daysRemaining = file.deleted_at ? getDaysRemaining(file.deleted_at) : 0;

          return (
            <div
              key={file.id}
              className={`group flex items-center gap-3 rounded-lg bg-bg-card p-2.5 sm:p-2 transition-colors hover:bg-bg-elevated ${
                selectable ? "cursor-pointer select-none" : ""
              } ${fileSelected ? "ring-2 ring-accent" : ""}`}
              onClick={selectable
                ? (e) => {
                    if (e.shiftKey && onShiftSelect) {
                      e.preventDefault();
                      onShiftSelect(file.id);
                    } else {
                      onSelect?.(file.id);
                    }
                  }
                : undefined
              }
              onContextMenu={selectable ? undefined : (e) => {
                e.preventDefault();
                e.stopPropagation();
                setTarget(file);
                setMenuPos({ open: true, x: e.clientX, y: e.clientY });
              }}
            >
              {selectable && (
                <div
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-colors pointer-events-none ${
                    fileSelected
                      ? "border-accent bg-accent text-white"
                      : "border-text-muted/50"
                  }`}
                  aria-hidden
                >
                  {fileSelected && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              )}

              <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-bg-elevated sm:h-14 sm:w-24">
                {hasThumbnail ? (
                  <img
                    src={getThumbnailUrl(file.id)}
                    alt={file.title}
                    className="h-full w-full object-cover opacity-60"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center opacity-60">
                    <FileTypeIcon fileType={file.file_type} size={22} className="text-text-muted" />
                  </div>
                )}
                {hasDuration && (
                  <span className="absolute bottom-0.5 right-0.5 rounded-lg bg-black/70 px-1 py-0.5 text-[10px] text-white">
                    {formatDuration(file.duration)}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-muted">
                    {file.title}
                  </h3>
                  <span className="hidden flex-shrink-0 text-xs tabular-nums text-text-muted sm:inline">
                    {formatFileSize(file.file_size)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted">
                  <span>{tt("daysRemaining", { days: daysRemaining })}</span>
                  <span className="opacity-40">·</span>
                  <span className="tabular-nums">{formatRelativeDate(file.updated_at)}</span>
                  <span className="flex-shrink-0 sm:hidden">{formatFileSize(file.file_size)}</span>
                </div>
              </div>

              {!selectable && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRestore(file.id); }}
                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-card hover:text-accent"
                    aria-label={tt("restore")}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onPurge(file.id); }}
                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label={tt("purge")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ContextMenu
        open={menuPos.open}
        position={{ x: menuPos.x, y: menuPos.y }}
        items={menuItems}
        onClose={closeMenu}
      />
    </>
  );
}
