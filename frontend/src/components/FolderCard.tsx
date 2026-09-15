import Link from "next/link";
import { Folder } from "lucide-react";
import { RENAME_FOCUS_ATTR } from "@/hooks/useInlineRename";
import { useFolderMeta } from "@/hooks/useFolderMeta";
import type { Folder as FolderType } from "@/types";
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
  isEditing?: boolean;
  /** Rejecting with an `Error` shows its message inside the card. */
  onRenameCommit?: (next: string) => Promise<void>;
  onRenameCancel?: (error?: string) => void;
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
  // While the name is being edited the card stops being a drag source: a
  // text selection inside a `draggable` ancestor is swallowed by the drag
  // system, so the field would be impossible to select in.
  const dragEnabled = draggable && !isEditing;
  const editing = isEditing && onRenameCommit && onRenameCancel;

  const icon = (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated">
      <Folder size={20} className="text-text-muted" />
    </div>
  );

  const { count, kinds } = useFolderMeta(folder);
  const meta = kinds ? `${count} · ${kinds}` : count;

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
            {/* Not a heading: an `<h3>` on every title makes the drive
                root's outline read as section names with file and folder
                names spliced between them at the same depth. */}
            <span className="min-w-0 truncate font-semibold text-text-primary">
              {folder.name}
            </span>
          </div>
          <p className="truncate text-sm text-text-muted">{meta}</p>
        </Link>
      )}
    </div>
  );
}
