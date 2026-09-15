import Link from "next/link";
import { Folder, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFolderMeta } from "@/hooks/useFolderMeta";
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
  const tFile = useTranslations("file");
  // While the name is being edited the row stops being a drag source: a
  // text selection inside a `draggable` ancestor is swallowed by the drag
  // system, so the field would be impossible to select in.
  const dragEnabled = draggable && !isEditing;
  const editing = isEditing && onRenameCommit && onRenameCancel;

  const { count, kinds } = useFolderMeta(folder);

  // As wide as `FileListRow`'s thumbnail but not as tall, so folder names
  // start on the file titles' left edge without the row growing to 56px.
  const thumbnail = (
    <div className="flex w-24 flex-shrink-0 justify-center">
      <Folder size={18} className="text-text-muted" />
    </div>
  );

  const countLabel = (
    <span className="ml-auto flex-shrink-0 text-xs tabular-nums text-text-muted">{count}</span>
  );

  return (
    <div
      className={`group flex items-center gap-3 border-b border-bg-border bg-bg-card p-2.5 transition-colors last:border-b-0 hover:bg-bg-elevated sm:p-2${
        // On a coarse pointer the 44px actions button is the row's height.
        onContextMenu ? ` pointer-coarse:py-0 ${ROW_FURNITURE_PADDING}` : ""
      }${
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
            {countLabel}
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
            <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
              {folder.name}
            </span>
            {countLabel}
            {/* Grows from zero into whatever the name leaves, so a long name
                truncates the breakdown away before it truncates itself. The
                negative margin hands back the row's gap, so a breakdown
                squeezed to nothing takes nothing from the name. */}
            {kinds && (
              <span className="-ml-2 hidden min-w-0 max-w-max flex-grow basis-0 truncate text-xs tabular-nums text-text-muted sm:block">
                {`\u00a0· ${kinds}`}
              </span>
            )}
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
