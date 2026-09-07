"use client";

import { useRelativeDate } from "@/hooks/useRelativeDate";
import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import { getThumbnailUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { ContextMenu, type MenuItem } from "@/components/ContextMenu";
import { Button } from "@/components/Button";

interface MissingFileGridProps {
  files: FileItem[];
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  onPurge: (id: string) => void;
}

export function MissingFileGrid({
  files,
  selectable,
  isSelected,
  onSelect,
  onShiftSelect,
  onPurge,
}: MissingFileGridProps) {
  const formatRelativeDate = useRelativeDate();
  const tm = useTranslations("missing");
  const [menuPos, setMenuPos] = useState<{
    open: boolean;
    x: number;
    y: number;
  }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [target, setTarget] = useState<FileItem | null>(null);
  const { ref: gridRef, columns } = useCardColumns();

  const closeMenu = useCallback(() => {
    setMenuPos({ open: false, x: 0, y: 0 });
  }, []);

  const menuItems: MenuItem[] = target
    ? [
        {
          icon: Trash2,
          label: tm("purge"),
          onClick: () => onPurge(target.id),
          danger: true,
        },
      ]
    : [];

  return (
    <>
      <div
        ref={gridRef}
        className="grid gap-x-3 gap-y-6"
        style={{ gridTemplateColumns: cardGridTemplate(columns) }}
      >
        {files.map((file) => {
          const hasThumbnail =
            file.has_thumbnail ||
            file.file_type === "video" ||
            file.file_type === "image";
          const selected = isSelected?.(file.id);

          return (
            <div
              key={file.id}
              className={`group/missing-item relative block rounded-xl overflow-hidden transition-all duration-200 ease-out hover:bg-bg-card ${
                selectable ? "cursor-pointer select-none" : ""
              } ${selected ? "ring-2 ring-accent bg-bg-card" : ""}`}
              onClick={
                selectable
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
              onContextMenu={
                selectable
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTarget(file);
                      setMenuPos({ open: true, x: e.clientX, y: e.clientY });
                    }
              }
            >
              {selectable && (
                <div className="absolute top-2 left-2 z-10">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-lg border-2 transition-colors pointer-events-none ${
                      selected
                        ? "border-accent bg-accent text-white"
                        : "border-text-muted/50 bg-black/40"
                    }`}
                    aria-hidden
                  >
                    {selected && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2 6L5 9L10 3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
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
                    <FileTypeIcon
                      fileType={file.file_type}
                      size={48}
                      className="text-text-muted"
                    />
                  </div>
                )}

                <div className="absolute bottom-2 left-2 rounded-lg bg-warm-silver/80 px-1.5 py-0.5 text-xs font-medium text-white">
                  {tm("badge")}
                </div>
              </div>

              <div className="p-3">
                <h3 className="line-clamp-2 text-sm font-semibold text-text-muted">
                  {file.title}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted">
                  <span className="tabular-nums">
                    {formatFileSize(file.file_size)}
                  </span>
                  {file.missing_since && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="tabular-nums">
                        {formatRelativeDate(file.missing_since)}
                      </span>
                    </>
                  )}
                </div>

                {/* See `TrashFileGrid` for why this is in the footer with a
                    word on it rather than an unlabelled glyph over the
                    thumbnail. This one is the irreversible half on its own,
                    which is the stronger case for saying what it does. */}
                {/* Mounted in both modes, and made `invisible` in
                    selection mode rather than dropped. In the footer the
                    strip is in flow, so unmounting it takes ~40px off every
                    card at once — and in the trash the gesture that *starts*
                    a selection is a Cmd/Ctrl-click on a card, so the grid
                    would jump under the pointer that had just aimed at it.
                    `visibility: hidden` keeps the box and still drops the
                    tab stop, which is the pair `hidden` cannot give. */}
                <div
                  className={`mt-2 flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-hover/missing-item:opacity-100 group-focus-within/missing-item:opacity-100 pointer-coarse:min-h-11 pointer-coarse:opacity-100 ${
                    selectable ? "invisible" : ""
                  }`}
                >
                  <Button
                    variant="danger"
                    size="sm"
                    // The strip carries the floor but is `items-center`,
                    // which stops a child inheriting the height — and
                    // `Button` grows the hit area only for `iconOnly`.
                    // §Row Actions names this case: give the row's own
                    // controls the class where the alignment stops them
                    // taking it.
                    className="pointer-coarse:min-h-11"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPurge(file.id);
                    }}
                    aria-label={tm("purgeNamed", { name: file.title })}
                  >
                    <Trash2 size={14} />
                    {tm("purge")}
                  </Button>
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
