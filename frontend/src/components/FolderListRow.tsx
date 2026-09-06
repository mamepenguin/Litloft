import Link from "next/link";
import { Folder, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { RENAME_FOCUS_ATTR } from "@/hooks/useInlineRename";
import type { Folder as FolderType } from "@/types";
import { InlineNameEditor } from "./InlineNameEditor";

/**
 * A folder as one row of the list view, beside `FileListRow`.
 *
 * A separate component rather than a second layout inside `FolderCard`:
 * that card already carries the drop target, the inline rename and the
 * context menu, and a part holding two layouts has no line left to draw
 * between what it is and how it looks
 * (`.claude/rules/frontend-conventions.md`, Container/Presenter).
 *
 * Every one of those behaviours reaches this row through the same props
 * the card takes, from the same call site — there is one folder menu
 * definition and one rename hook, not a second set for the list.
 */
interface FolderListRowProps {
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
  isEditing?: boolean;
  /** Rejecting with an `Error` shows its message inside the row. */
  onRenameCommit?: (next: string) => Promise<void>;
  onRenameCancel?: (error?: string) => void;
  /** Focus tracking so the host can bind F2 to the focused row. */
  onCardFocus?: () => void;
  onCardBlur?: () => void;
}

export function FolderListRow({
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
}: FolderListRowProps) {
  const t = useTranslations("folder");
  const tFile = useTranslations("file");
  // While the name is being edited the row stops being a drag source: a
  // text selection inside a `draggable` ancestor is swallowed by the drag
  // system, so the field would be impossible to select in.
  const dragEnabled = draggable && !isEditing;
  const editing = isEditing && onRenameCommit && onRenameCancel;

  // The same 14×24 frame `FileListRow` gives a thumbnail, so folder rows
  // and file rows line their text up on the same left edge.
  //
  // A glyph, never a photograph, for the reason the folder card gives:
  // borrowing a picture from somewhere beneath the folder mixed pictures
  // and line art in one column and said nothing the name did not (D-4).
  // The row keeps its bare count rather than the card's breakdown — it is
  // a fixed-width column beside a name that already truncates.
  const thumbnail = (
    <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-bg-elevated">
      <Folder size={22} className="text-text-muted" />
    </div>
  );

  const meta = (
    <span className="flex-shrink-0 text-xs tabular-nums text-text-muted">
      {t("items", { count: folder.file_count })}
    </span>
  );

  return (
    <div
      className={`group flex items-center gap-3 border-b border-bg-border bg-bg-card p-2.5 transition-colors last:border-b-0 hover:bg-bg-elevated sm:p-2${
        isDropTarget ? " bg-bg-elevated ring-2 ring-accent ring-inset" : ""
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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {thumbnail}
          <div className="flex min-w-0 max-w-list-row flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <InlineNameEditor
                initialName={folder.name}
                onCommit={onRenameCommit}
                onCancel={onRenameCancel}
              />
            </div>
            {meta}
          </div>
        </div>
      ) : (
        <Link
          href={`/drive/${encodeURIComponent(driveName)}/${folder.path.split("/").map(encodeURIComponent).join("/")}`}
          className="flex min-w-0 flex-1 items-center gap-3"
          draggable="false"
          {...{ [RENAME_FOCUS_ATTR]: folder.path }}
        >
          {thumbnail}
          <div className="flex min-w-0 max-w-list-row flex-1 items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
              {folder.name}
            </h3>
            {meta}
          </div>
        </Link>
      )}
      {/* The same reason `FileListRow` has one: right-click and long-press
          are the only other ways in, and a keyboard has neither. Without
          it a column of rows shows a `⋮` on every file and none on the
          folders, which reads as the folder being a different kind of
          thing rather than as an omission.

          It holds its place with `opacity-0` rather than appearing on
          hover, so the row does not reflow under the pointer; it shows on
          focus for the keyboard and stays put on touch, where there is no
          hover to reveal it. Sized past its 16px glyph to a 24px target
          (hako `Prwd_iaXmCjWfY24KjFz2`), and 44px where the pointer is a
          finger (`00-basis.md`). */}
      {onContextMenu && (
        <button
          type="button"
          aria-label={tFile("actionsFor", { name: folder.name })}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Enter and Space on a button produce a click with no pointer,
            // so `clientX/clientY` are 0 and the menu opens clamped to the
            // top-left of the window — rows away from the one it belongs
            // to. Anchor it to the button, which is where a pointer click
            // would have put it anyway.
            if (e.clientX === 0 && e.clientY === 0) {
              const box = e.currentTarget.getBoundingClientRect();
              onContextMenu({
                ...e,
                preventDefault: () => {},
                stopPropagation: () => {},
                clientX: box.left,
                clientY: box.bottom,
              } as unknown as React.MouseEvent);
              return;
            }
            onContextMenu(e);
          }}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-text-muted opacity-0 transition-opacity hover:bg-bg-elevated hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100"
        >
          <MoreVertical size={16} />
        </button>
      )}
    </div>
  );
}
