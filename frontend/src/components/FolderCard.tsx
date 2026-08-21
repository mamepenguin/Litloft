import Link from "next/link";
import { Folder } from "lucide-react";
import { useTranslations } from "next-intl";
import { RENAME_FOCUS_ATTR } from "@/hooks/useInlineRename";
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
  // While the name is being edited the card stops being a drag source: a
  // text selection inside a `draggable` ancestor is swallowed by the drag
  // system, so the field would be impossible to select in.
  const dragEnabled = draggable && !isEditing;
  const editing = isEditing && onRenameCommit && onRenameCancel;

  const thumbnail = folder.thumbnail_file_id ? (
    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl">
      <img
        src={`/api/files/${folder.thumbnail_file_id}/thumbnail`}
        alt={folder.name}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  ) : (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated">
      <Folder size={24} className="text-text-muted" />
    </div>
  );

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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {thumbnail}
          <div className="flex min-w-0 flex-1 flex-col">
            <InlineNameEditor
              initialName={folder.name}
              onCommit={onRenameCommit}
              onCancel={onRenameCancel}
            />
            <p className="mt-1 text-sm text-text-muted">
              {t("items", { count: folder.file_count })}
            </p>
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
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-text-primary">
              {folder.name}
            </h3>
            <p className="text-sm text-text-muted">
              {t("items", { count: folder.file_count })}
            </p>
          </div>
        </Link>
      )}
    </div>
  );
}
