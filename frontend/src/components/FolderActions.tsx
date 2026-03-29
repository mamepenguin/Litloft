"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Move, Pencil, Pin, PinOff, Trash2 } from "lucide-react";

import { deleteFolder, moveFolder, renameFolder } from "@/lib/api";
import type { Folder } from "@/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoveDialog } from "./MoveDialog";
import { RenameDialog } from "./RenameDialog";

interface FolderActionsProps {
  folder: Folder;
  drive: string;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onUpdate?: () => void;
  onDelete?: () => void;
}

export function FolderActions({
  folder,
  drive,
  isPinned,
  onTogglePin,
  onUpdate,
  onDelete,
}: FolderActionsProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
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

  const handleMove = useCallback(
    async (targetPath: string) => {
      try {
        await moveFolder(drive, folder.path, targetPath);
        setMoveOpen(false);
        if (onUpdate) onUpdate();
      } catch {
        setError("移動に失敗しました");
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
        {onTogglePin && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePin();
            }}
            className={`rounded-lg p-1.5 transition-all ${
              isPinned
                ? "text-accent hover:bg-accent/10"
                : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            }`}
            aria-label={isPinned ? "ピン留め解除" : "ピン留め"}
          >
            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        )}
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
            setMoveOpen(true);
          }}
          className="rounded-lg p-1.5 text-text-muted transition-all hover:bg-bg-elevated hover:text-text-primary"
          aria-label="移動"
        >
          <Move size={14} />
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

      {renameOpen &&
        createPortal(
          <RenameDialog
            open={renameOpen}
            currentName={folder.name}
            onRename={handleRename}
            onCancel={() => setRenameOpen(false)}
          />,
          document.body
        )}

      {moveOpen &&
        createPortal(
          <MoveDialog
            open={moveOpen}
            drive={drive}
            currentPath={folder.path.split("/").slice(0, -1).join("/")}
            excludePath={folder.path}
            onMove={handleMove}
            onCancel={() => setMoveOpen(false)}
          />,
          document.body
        )}

      {deleteOpen &&
        createPortal(
          <ConfirmDialog
            open={deleteOpen}
            title="フォルダを削除"
            message={`「${folder.name}」を削除しますか？空のフォルダのみ削除できます。`}
            confirmLabel="削除"
            onConfirm={handleDelete}
            onCancel={() => setDeleteOpen(false)}
          />,
          document.body
        )}
    </>
  );
}
