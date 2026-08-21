"use client";

import { useCallback, useState } from "react";
import { Download, ListMusic, Move, Pencil, Trash2 } from "lucide-react";

import { ClipboardCopy, Scissors } from "lucide-react";
import { useTranslations } from "next-intl";
import { deleteFile, getDownloadUrl, moveFile, renameFile } from "@/lib/api";
import { useClipboard } from "./ClipboardProvider";
import type { FileItem, FileItemWithMatch } from "@/types";
import { FileListRow } from "./FileListRow";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";
import { CollectionPicker } from "./CollectionPicker";

export function FileList({
  files,
  onFavoriteToggle,
  onRefresh,
  selectable,
  selectedIds,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  sortQuery,
  draggable,
  draggedIds,
  onDragStart,
  onDragEnd,
}: {
  files: FileItemWithMatch[];
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
  selectable?: boolean;
  /** A set, not a predicate — see `FileListRow`'s prop-shape note. */
  selectedIds?: ReadonlySet<string>;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
  draggable?: boolean;
  draggedIds?: ReadonlySet<string>;
  onDragStart?: (e: React.DragEvent, fileId: string) => void;
  onDragEnd?: () => void;
}) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const tcb = useTranslations("clipboard");
  const tt = useTranslations("trash");
  const clipboard = useClipboard();
  const [menuPos, setMenuPos] = useState<{ open: boolean; x: number; y: number }>({
    open: false, x: 0, y: 0,
  });
  const [target, setTarget] = useState<FileItem | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuPos({ open: false, x: 0, y: 0 });
  }, []);

  const clearTarget = useCallback(() => {
    setTarget(null);
  }, []);

  // Stable identities so the memoized rows keep their props between
  // renders. Each row hands its own `file` back.
  const handleContextMenu = useCallback((e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setTarget(file);
    setMenuPos({ open: true, x: e.clientX, y: e.clientY });
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, file: FileItem) => {
      onDragStart?.(e, file.id);
    },
    [onDragStart],
  );

  const menuItems: MenuItem[] = target ? [
    {
      icon: Download,
      label: tc("download"),
      onClick: () => window.open(getDownloadUrl(target.id), "_blank"),
    },
    {
      icon: ListMusic,
      label: t("addToCollection"),
      onClick: () => setCollectionPickerOpen(true),
    },
    {
      icon: ClipboardCopy,
      label: tcb("copy"),
      onClick: () => clipboard.copy([target.id], target.drive, target.folder_path),
    },
    {
      icon: Scissors,
      label: tcb("cut"),
      onClick: () => clipboard.cut([target.id], target.drive, target.folder_path),
    },
    {
      icon: Pencil,
      label: tc("rename"),
      onClick: () => setRenameOpen(true),
    },
    {
      icon: Move,
      label: tc("move"),
      onClick: () => setMoveOpen(true),
    },
    {
      icon: Trash2,
      label: tt("moveToTrash"),
      onClick: () => setDeleteOpen(true),
      danger: true,
    },
  ] : [];

  return (
    <>
      <div className="flex flex-col">
        {files.map((file) => (
          <FileListRow
            key={file.id}
            file={file}
            selectable={selectable}
            selected={selectedIds?.has(file.id)}
            isDragging={draggedIds?.has(file.id)}
            draggable={draggable}
            sortQuery={sortQuery}
            onFavoriteToggle={onFavoriteToggle}
            onSelect={onSelect}
            onMetaSelect={onMetaSelect}
            onShiftSelect={onShiftSelect}
            onDragStart={onDragStart ? handleDragStart : undefined}
            onDragEnd={onDragEnd}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      <ContextMenu
        open={menuPos.open}
        position={{ x: menuPos.x, y: menuPos.y }}
        items={menuItems}
        onClose={closeMenu}
      />

      {target && (
        <>
          <RenameDialog
            open={renameOpen}
            currentName={target.filename}
            onRename={async (name) => {
              try {
                await renameFile(target.id, name);
                setRenameOpen(false);
                clearTarget();
                if (onRefresh) onRefresh();
              } catch { /* dialog stays open on error */ }
            }}
            onCancel={() => { setRenameOpen(false); clearTarget(); }}
          />
          <MoveDialog
            open={moveOpen}
            drive={target.drive}
            currentPath={target.folder_path}
            onMove={async (path) => {
              try {
                await moveFile(target.id, path);
                setMoveOpen(false);
                clearTarget();
                if (onRefresh) onRefresh();
              } catch { /* dialog stays open on error */ }
            }}
            onCancel={() => { setMoveOpen(false); clearTarget(); }}
          />
          <CollectionPicker
            open={collectionPickerOpen}
            drive={target.drive}
            fileIds={[target.id]}
            onClose={() => { setCollectionPickerOpen(false); clearTarget(); }}
          />
          <ConfirmDialog
            open={deleteOpen}
            title={tt("moveToTrash")}
            message={tt("confirmMoveToTrash", { name: target.filename })}
            confirmLabel={tt("moveToTrash")}
            note={tt("autoDelete")}
            onConfirm={async () => {
              try {
                await deleteFile(target.id);
                setDeleteOpen(false);
                clearTarget();
                if (onRefresh) onRefresh();
              } catch { /* dialog stays open on error */ }
            }}
            onCancel={() => { setDeleteOpen(false); clearTarget(); }}
          />
        </>
      )}
    </>
  );
}
