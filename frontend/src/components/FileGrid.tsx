"use client";

import { useCallback, useState } from "react";
import { Download, ListMusic, Move, Pencil, Trash2 } from "lucide-react";

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
  sortQuery,
}: {
  files: FileItem[];
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  onSelect?: (id: string) => void;
  sortQuery?: string;
}) {
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
      label: "ダウンロード",
      onClick: () => window.open(getDownloadUrl(target.id), "_blank"),
    },
    {
      icon: ListMusic,
      label: "プレイリストに追加",
      onClick: () => setPlaylistPickerOpen(true),
    },
    {
      icon: Pencil,
      label: "名前を変更",
      onClick: () => setRenameOpen(true),
    },
    {
      icon: Move,
      label: "移動",
      onClick: () => setMoveOpen(true),
    },
    {
      icon: Trash2,
      label: "削除",
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
            sortQuery={sortQuery}
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
            title="ファイルを削除"
            message={`「${target.filename}」を削除しますか？この操作は取り消せません。`}
            confirmLabel="削除"
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
