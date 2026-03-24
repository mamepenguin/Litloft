"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Move, Pencil, Trash2 } from "lucide-react";

import { deleteFile, getDownloadUrl, moveFile, renameFile } from "@/lib/api";
import type { FileItem } from "@/types";
import { FileCard } from "./FileCard";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";

export function FileGrid({
  files,
  onFavoriteToggle,
  onRefresh,
}: {
  files: FileItem[];
  onFavoriteToggle?: (file: FileItem) => void;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [menuState, setMenuState] = useState<{ open: boolean; x: number; y: number; file: FileItem | null }>({
    open: false, x: 0, y: 0, file: null,
  });
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuState({ open: false, x: 0, y: 0, file: null }), []);

  const target = menuState.file;

  const menuItems: MenuItem[] = target ? [
    { icon: Download, label: "ダウンロード", onClick: () => window.open(getDownloadUrl(target.id), "_blank") },
    { icon: Pencil, label: "名前を変更", onClick: () => setRenameOpen(true) },
    { icon: Move, label: "移動", onClick: () => setMoveOpen(true) },
    { icon: Trash2, label: "削除", onClick: () => setDeleteOpen(true), danger: true },
  ] : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            onFavoriteToggle={onFavoriteToggle}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuState({ open: true, x: e.clientX, y: e.clientY, file });
            }}
          />
        ))}
      </div>

      <ContextMenu
        open={menuState.open}
        position={{ x: menuState.x, y: menuState.y }}
        items={menuItems}
        onClose={closeMenu}
      />

      {target && (
        <>
          <RenameDialog
            open={renameOpen}
            currentName={target.filename}
            onRename={async (name) => {
              await renameFile(target.id, name);
              setRenameOpen(false);
              if (onRefresh) onRefresh();
            }}
            onCancel={() => setRenameOpen(false)}
          />
          <MoveDialog
            open={moveOpen}
            drive={target.drive}
            currentPath={target.folder_path}
            onMove={async (path) => {
              await moveFile(target.id, path);
              setMoveOpen(false);
              if (onRefresh) onRefresh();
            }}
            onCancel={() => setMoveOpen(false)}
          />
          <ConfirmDialog
            open={deleteOpen}
            title="ファイルを削除"
            message={`「${target.filename}」を削除しますか？この操作は取り消せません。`}
            confirmLabel="削除"
            onConfirm={async () => {
              await deleteFile(target.id);
              setDeleteOpen(false);
              if (onRefresh) onRefresh();
            }}
            onCancel={() => setDeleteOpen(false)}
          />
        </>
      )}
    </>
  );
}
