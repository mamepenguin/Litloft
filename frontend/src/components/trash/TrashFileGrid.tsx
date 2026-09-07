"use client";

import { useRelativeDate } from "@/hooks/useRelativeDate";
import { useCallback, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import { getDaysRemaining } from "@/lib/trash";
import { getThumbnailUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { ContextMenu, type MenuItem } from "@/components/ContextMenu";
import { Button } from "@/components/Button";

interface TrashFileGridProps {
  files: FileItem[];
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
}

export function TrashFileGrid({
  files,
  selectable,
  isSelected,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  onRestore,
  onPurge,
}: TrashFileGridProps) {
  const formatRelativeDate = useRelativeDate();
  const tt = useTranslations("trash");
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
          const daysRemaining = file.deleted_at
            ? getDaysRemaining(file.deleted_at)
            : 0;

          return (
            <div
              key={file.id}
              className={`group/trash-item relative block rounded-xl overflow-hidden transition-all duration-200 ease-out hover:bg-bg-card ${
                selectable ? "cursor-pointer select-none" : ""
              } ${selected ? "ring-2 ring-accent bg-bg-card" : ""}`}
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
                    className="h-full w-full object-cover opacity-60"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center opacity-60">
                    <FileTypeIcon
                      fileType={file.file_type}
                      size={48}
                      className="text-text-muted"
                    />
                  </div>
                )}

                <div className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
                  {tt("daysRemaining", { days: daysRemaining })}
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
                  <span className="opacity-40">·</span>
                  <span className="tabular-nums">
                    {formatRelativeDate(file.updated_at)}
                  </span>
                </div>

                {/* In the footer, with words on them. These were two
                    unlabelled 26px glyphs over the thumbnail: no room for a
                    label, no way to tell restore from delete-forever except
                    by the picture, and one of the two cannot be undone.

                    §Row Actions: the row carries the named group and the
                    44px floor, the action carries the reveal.
                    `opacity-0` and not `hidden`, so the button stays in the
                    tab order for `group-focus-within` to fire on;
                    `pointer-coarse:opacity-100` because `group-hover`
                    compiles inside `@media (hover: hover)` and a touch
                    device would otherwise never see either control. */}
                {/* Mounted in both modes, and made `invisible` in
                    selection mode rather than dropped. In the footer the
                    strip is in flow, so unmounting it takes ~40px off every
                    card at once — and in the trash the gesture that *starts*
                    a selection is a Cmd/Ctrl-click on a card, so the grid
                    would jump under the pointer that had just aimed at it.
                    `visibility: hidden` keeps the box and still drops the
                    tab stop, which is the pair `hidden` cannot give. */}
                <div
                  className={`mt-2 flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-hover/trash-item:opacity-100 group-focus-within/trash-item:opacity-100 pointer-coarse:min-h-11 pointer-coarse:opacity-100 ${
                    selectable ? "invisible" : ""
                  }`}
                >
                  <Button
                    variant="ghost"
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
                      onRestore(file.id);
                    }}
                    aria-label={tt("restoreNamed", { name: file.title })}
                  >
                    <RotateCcw size={14} />
                    {tt("restore")}
                  </Button>
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
                    aria-label={tt("purgeNamed", { name: file.title })}
                  >
                    <Trash2 size={14} />
                    {tt("purge")}
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
