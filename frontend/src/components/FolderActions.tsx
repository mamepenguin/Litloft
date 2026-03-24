"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { deleteFolder, renameFolder } from "@/lib/api";
import type { Folder } from "@/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";

interface FolderActionsProps {
  folder: Folder;
  drive: string;
  onUpdate?: () => void;
  onDelete?: () => void;
}

export function FolderActions({
  folder,
  drive,
  onUpdate,
  onDelete,
}: FolderActionsProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleRename = useCallback(
    async (newName: string) => {
      try {
        await renameFolder(drive, folder.path, newName);
        setRenameOpen(false);
        if (onUpdate) onUpdate();
      } catch {
        setError("名前の変更に失敗しました");
      }
    },
    [drive, folder.path, onUpdate]
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteFolder(drive, folder.path);
      setDeleteOpen(false);
      if (onDelete) onDelete();
      if (onUpdate) onUpdate();
    } catch {
      setError("削除に失敗しました（フォルダが空でない可能性があります）");
    }
  }, [drive, folder.path, onDelete, onUpdate]);

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRenameOpen(true);
          }}
          className="rounded-lg p-1.5 text-text-muted transition-all hover:bg-bg-elevated hover:text-text-primary"
          aria-label="名前を変更"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDeleteOpen(true);
          }}
          className="rounded-lg p-1.5 text-text-muted transition-all hover:bg-red-400/10 hover:text-red-400"
          aria-label="削除"
        >
          <Trash2 size={14} />
        </button>
        {error && (
          <span className="ml-1 text-xs text-red-400">{error}</span>
        )}
      </div>

      <RenameDialog
        open={renameOpen}
        currentName={folder.name}
        onRename={handleRename}
        onCancel={() => setRenameOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="フォルダを削除"
        message={`「${folder.name}」を削除しますか？空のフォルダのみ削除できます。`}
        confirmLabel="削除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
