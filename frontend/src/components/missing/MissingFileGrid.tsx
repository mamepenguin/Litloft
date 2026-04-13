"use client";

import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import { getThumbnailUrl } from "@/lib/api";
import { formatFileSize, formatRelativeDate } from "@/lib/format";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { ContextMenu, type MenuItem } from "@/components/ContextMenu";

interface MissingFileGridProps {
  files: FileItem[];
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  onPurge: (id: string) => void;
}

export function MissingFileGrid({
  files, selectable, isSelected, onSelect, onShiftSelect, onPurge,
}: MissingFileGridProps) {
  const tm = useTranslations("missing");
  const [menuPos, setMenuPos] = useState<{ open: boolean; x: number; y: number }>({
    open: false, x: 0, y: 0,
  });
  const [target, setTarget] = useState<FileItem | null>(null);

  const closeMenu = useCallback(() => {
    setMenuPos({ open: false, x: 0, y: 0 });
  }, []);

  const menuItems: MenuItem[] = target ? [
    {
      icon: Trash2,
      label: tm("purge"),
      onClick: () => onPurge(target.id),
      danger: true,
    },
  ] : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {files.map((file) => {
          const hasThumbnail = file.has_thumbnail || file.file_type === "video" || file.file_type === "image";
          const selected = isSelected?.(file.id);

          return (
            <div
              key={file.id}
              className={`group relative block rounded-xl overflow-hidden transition-all duration-200 ease-out hover:bg-bg-card ${
                selectable ? "cursor-pointer select-none" : ""
              } ${selected ? "ring-2 ring-accent bg-bg-card" : ""}`}
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
                <div className="absolute top-2 left-2 z-10">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors pointer-events-none ${
                      selected
                        ? "border-accent bg-accent text-white"
                        : "border-text-muted/50 bg-black/40"
                    }`}
                    aria-hidden
                  >
                    {selected && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
              )}

              <div className="relative aspect-video bg-bg-elevated">
                {hasThumbnail ? (
                  <img
                    src={getThumbnailUrl(file.id)}
                    alt={file.title}
                    className="h-full w-full object-cover grayscale opacity-50"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center opacity-40">
                    <FileTypeIcon fileType={file.file_type} size={48} className="text-text-muted" />
                  </div>
                )}

                <div className="absolute bottom-2 left-2 rounded bg-amber-500/90 px-1.5 py-0.5 text-xs font-medium text-white">
                  {tm("badge")}
                </div>

                {!selectable && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onPurge(file.id); }}
                      className="rounded-lg bg-black/60 p-1.5 text-white transition-colors hover:bg-red-500"
                      aria-label={tm("purge")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3">
                <h3 className="line-clamp-2 text-sm font-semibold text-text-muted">
                  {file.title}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted">
                  <span className="tabular-nums">{formatFileSize(file.file_size)}</span>
                  {file.missing_since && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="tabular-nums">{formatRelativeDate(file.missing_since)}</span>
                    </>
                  )}
                </div>
              </div>
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
