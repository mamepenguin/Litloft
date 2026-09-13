import Link from "next/link";
import { Folder, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { RENAME_FOCUS_ATTR } from "@/hooks/useInlineRename";
import type { Folder as FolderType } from "@/types";
import { InlineNameEditor } from "./InlineNameEditor";
import {
  ROW_FURNITURE_GROUP,
  ROW_FURNITURE_PADDING,
  ROW_OVERFLOW_BUTTON,
} from "./rowFurniture";

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
      className={`group flex items-center gap-3 border-b border-bg-border bg-bg-card p-2.5 transition-colors last:border-b-0 hover:bg-bg-elevated sm:p-2${onContextMenu ? ` ${ROW_FURNITURE_PADDING}` : ""}${
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
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
              {folder.name}
            </span>
            {meta}
          </div>
        </Link>
      )}
      {/* It holds its place with `opacity-0` rather than appearing on
          hover, so the row does not reflow under the pointer. */}
      {onContextMenu && (
        <div className={ROW_FURNITURE_GROUP}>
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
            className={ROW_OVERFLOW_BUTTON}
          >
            <MoreVertical size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
