"use client";

import { useCallback, useState } from "react";
import { Download, ListMusic, Move, Pencil, Trash2 } from "lucide-react";

import { useTranslations } from "next-intl";
import { deleteFile, getDownloadUrl, moveFile, renameFile } from "@/lib/api";
import type { FileItem } from "@/types";
import { FileCard } from "./FileCard";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";
import { PlaylistPicker } from "./PlaylistPicker";

export function FileGrid({
  files,
  onFavoriteToggle,
  onRefresh,
  selectable,
  isSelected,
  onSelect,
  onMetaSelect,
  onShiftSelect,
  sortQuery,
  draggable,
  draggedFileIds,
  onDragStart,
  onDragEnd,
}: {
  files: FileItem[];
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onSelect?: (id: string) => void;
  onMetaSelect?: (id: string) => void;
  onShiftSelect?: (id: string) => void;
  sortQuery?: string;
  draggable?: boolean;
  draggedFileIds?: string[];
  onDragStart?: (e: React.DragEvent, fileId: string) => void;
  onDragEnd?: () => void;
}) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const [menuPos, setMenuPos] = useState<{ open: boolean; x: number; y: number }>({
    open: false, x: 0, y: 0,
  });
  const [target, setTarget] = useState<FileItem | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuPos({ open: false, x: 0, y: 0 });
  }, []);

  const clearTarget = useCallback(() => {
    setTarget(null);
  }, []);

  const menuItems: MenuItem[] = target ? [
    {
      icon: Download,
      label: tc("download"),
      onClick: () => window.open(getDownloadUrl(target.id), "_blank"),
    },
    {
      icon: ListMusic,
      label: t("addToPlaylist"),
      onClick: () => setPlaylistPickerOpen(true),
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
      label: tc("delete"),
      onClick: () => setDeleteOpen(true),
      danger: true,
    },
  ] : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            onFavoriteToggle={onFavoriteToggle}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTarget(file);
              setMenuPos({ open: true, x: e.clientX, y: e.clientY });
            }}
            selectable={selectable}
            selected={isSelected?.(file.id)}
            onSelect={onSelect}
            onMetaSelect={onMetaSelect}
            onShiftSelect={onShiftSelect}
            sortQuery={sortQuery}
            draggable={draggable}
            isDragging={draggedFileIds?.includes(file.id)}
            onDragStart={onDragStart ? (e) => onDragStart(e, file.id) : undefined}
            onDragEnd={onDragEnd}
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
          <PlaylistPicker
            open={playlistPickerOpen}
            drive={target.drive}
            fileIds={[target.id]}
            onClose={() => { setPlaylistPickerOpen(false); clearTarget(); }}
          />
          <ConfirmDialog
            open={deleteOpen}
            title={t("deleteTitle")}
            message={t("deleteMessage", { name: target.filename })}
            confirmLabel={tc("delete")}
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
