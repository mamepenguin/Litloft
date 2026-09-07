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
import { Button } from "@/components/Button";

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
              className={`group/trash-item flex items-center gap-3 rounded-lg bg-bg-card p-2.5 sm:p-2 transition-colors hover:bg-bg-elevated pointer-coarse:min-h-11 ${
                selectable ? "cursor-pointer select-none" : ""
              } ${fileSelected ? "ring-2 ring-accent" : ""}`}
              /* Not gated on `selectable`: Cmd/Ctrl-click is how a
                 selection is *started* here, which is why the host's
                 handler turns selection mode on before it toggles. With
                 the handler attached only in selection mode there was no
                 way in, and the press did nothing at all. */
              onClick={(e) => {
                // Shift first once a selection is running: Cmd/Ctrl+Shift
                // extends the range rather than toggling one file, which is
                // the order `useFileCardLink` uses in the ordinary listing.
                if (selectable && e.shiftKey && onShiftSelect) {
                  e.preventDefault();
                  onShiftSelect(file.id);
                  return;
                }
                if ((e.metaKey || e.ctrlKey) && onMetaSelect) {
                  e.preventDefault();
                  onMetaSelect(file.id);
                  return;
                }
                if (!selectable) return;
                onSelect?.(file.id);
              }}
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
                <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/trash-item:opacity-100 group-focus-within/trash-item:opacity-100 pointer-coarse:opacity-100">
                  {/* Icon only here, with the words in the accessible name:
                      a row already carries a title, a size and a date, and
                      two labels per row is what pushes the title into an
                      ellipsis. `title` is deliberately not set to the same
                      string — beside an `aria-label` it becomes the
                      accessible *description* and is announced a second
                      time (§Row Actions). */}
                  <Button
                    variant="ghost"
                    iconOnly
                    onClick={(e) => { e.stopPropagation(); onRestore(file.id); }}
                    aria-label={tt("restoreNamed", { name: file.title })}
                  >
                    <RotateCcw size={14} />
                  </Button>
                  <Button
                    variant="danger"
                    iconOnly
                    onClick={(e) => { e.stopPropagation(); onPurge(file.id); }}
                    aria-label={tt("purgeNamed", { name: file.title })}
                  >
                    <Trash2 size={14} />
                  </Button>
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
