"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Move, Pencil, Pin, PinOff, Trash2 } from "lucide-react";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("folder");
  const tc = useTranslations("common");
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
        setError(t("renameFailed"));
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
        setError(t("moveFailed"));
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
      setError(t("deleteFailed"));
    }
  }, [drive, folder.path, onDelete, onUpdate, t]);

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
            aria-label={isPinned ? t("unpin") : t("pin")}
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
          aria-label={t("rename")}
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
          aria-label={tc("move")}
        >
          <Move size={14} />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDeleteOpen(true);
          }}
          className="rounded-lg p-1.5 text-text-muted transition-all hover:bg-danger/10 hover:text-danger"
          aria-label={tc("delete")}
        >
          <Trash2 size={14} />
        </button>
        {error && (
          <span className="ml-1 text-xs text-danger">{error}</span>
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
            title={t("deleteTitle")}
            message={t("deleteMessage", { name: folder.name })}
            confirmLabel={tc("delete")}
            onConfirm={handleDelete}
            onCancel={() => setDeleteOpen(false)}
          />,
          document.body
        )}
    </>
  );
}
