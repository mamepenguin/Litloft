import Link from "next/link";
import { Folder } from "lucide-react";
import { useTranslations } from "next-intl";
import { RENAME_FOCUS_ATTR } from "@/hooks/useInlineRename";
import type { Folder as FolderType } from "@/types";
import { folderKindBreakdown } from "@/lib/folderKindBreakdown";
import { InlineNameEditor } from "./InlineNameEditor";

interface FolderCardProps {
  folder: FolderType;
  driveName: string;
  isDropTarget?: boolean;
  dropTargetProps?: Record<string, (e: React.DragEvent) => void>;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  /**
   * Renders the name as an editable field instead of a label. Folder
   * cards show the real folder name, so editing here edits exactly the
   * string on screen (spec 2026-08-21-inline-rename-and-spring-loaded-
   * drag §2).
   */
  isEditing?: boolean;
  /** Rejecting with an `Error` shows its message inside the card. */
  onRenameCommit?: (next: string) => Promise<void>;
  onRenameCancel?: (error?: string) => void;
  /** Focus tracking so the host can bind F2 to the focused card. */
  onCardFocus?: () => void;
  onCardBlur?: () => void;
}

export function FolderCard({
  folder,
  driveName,
  isDropTarget,
  dropTargetProps,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  isEditing,
  onRenameCommit,
  onRenameCancel,
  onCardFocus,
  onCardBlur,
}: FolderCardProps) {
  const t = useTranslations("folder");
  const tFilter = useTranslations("filter");
  // While the name is being edited the card stops being a drag source: a
  // text selection inside a `draggable` ancestor is swallowed by the drag
  // system, so the field would be impossible to select in.
  const dragEnabled = draggable && !isEditing;
  const editing = isEditing && onRenameCommit && onRenameCancel;

  // One glyph, always. A folder card used to show a photograph borrowed
  // from the first video or image anywhere beneath it, and this glyph
  // when there was none — so a row of folders mixed pictures and line art
  // in the same column, and the picture said nothing about the folder
  // that a name and a count did not (D-4). Which of the two a folder got
  // was decided by what happened to be inside it, so the column could not
  // be made consistent by choosing the other side.
  const icon = (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated">
      <Folder size={20} className="text-text-muted" />
    </div>
  );

  // What the count is made of, in place of the picture.
  const breakdown = folderKindBreakdown(folder.kind_counts);
  const meta = [
    t("items", { count: folder.file_count }),
    // A single kind is named without repeating the number that is already
    // to its left.
    ...(breakdown.length === 1
      ? [tFilter(`type.${breakdown[0].kind}`)]
      : breakdown.map((s) => `${tFilter(`type.${s.kind}`)} ${s.count}`)),
  ].join(" · ");

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-2xl bg-bg-card p-4 shadow-card transition-colors duration-200 hover:bg-bg-elevated${
        isDropTarget ? " ring-2 ring-accent bg-bg-elevated" : ""
      }${isDragging ? " opacity-40" : ""}${dragEnabled ? " select-none" : ""}`}
      draggable={dragEnabled}
      onDragStart={dragEnabled ? onDragStart : undefined}
      onDragEnd={dragEnabled ? onDragEnd : undefined}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onFocus={onCardFocus}
      onBlur={onCardBlur}
      {...dropTargetProps}
    >
      {editing ? (
        // No <Link> around the field: a text input inside an anchor
        // navigates away the moment it is clicked.
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <InlineNameEditor
              initialName={folder.name}
              onCommit={onRenameCommit}
              onCancel={onRenameCancel}
            />
          </div>
          <p className="truncate text-sm text-text-muted">{meta}</p>
        </div>
      ) : (
        <Link
          href={`/drive/${encodeURIComponent(driveName)}/${folder.path.split("/").map(encodeURIComponent).join("/")}`}
          className="flex min-w-0 flex-1 flex-col gap-1.5"
          draggable="false"
          {...{ [RENAME_FOCUS_ATTR]: folder.path }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            {/* Not a heading. A grid of cards used to put an `<h3>` on
                every title, so the drive root's outline read as six
                section names with thirty file and folder names spliced
                between them at the same depth (D-5). The accessible name
                is the link's, which is unchanged. */}
            <span className="min-w-0 truncate font-semibold text-text-primary">
              {folder.name}
            </span>
          </div>
          {/* Its own row, spanning the card. Beside the glyph it had the
              68px left over inside a 160px card at 375px, which cut
              "3 件 · Markdown" mid-word — less than the bare count it
              replaced. Full width it is 136px there, and the count plus
              the first kind fit. */}
          <p className="truncate text-sm text-text-muted">{meta}</p>
        </Link>
      )}
    </div>
  );
}
