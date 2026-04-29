"use client";

import { useCallback, useEffect, useState } from "react";
import { Move, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { deleteFolder, moveFolder, renameFolder } from "@/lib/api";
import type { Folder } from "@/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { MoveDialog } from "./MoveDialog";
import { RenameDialog } from "./RenameDialog";

interface FolderContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  target: Folder | null;
  drive: string;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onUpdate?: () => void;
  onClose: () => void;
}

export function FolderContextMenu({
  open,
  position,
  target,
  drive,
  isPinned,
  onTogglePin,
  onUpdate,
  onClose,
}: FolderContextMenuProps) {
  const t = useTranslations("folder");
  const tc = useTranslations("common");
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleRename = useCallback(
    async (newName: string) => {
      if (!target) return;
      try {
        await renameFolder(drive, target.path, newName);
        setRenameOpen(false);
        if (onUpdate) onUpdate();
      } catch {
        setError(t("renameFailed"));
      }
    },
    [drive, target, onUpdate, t],
  );

  const handleMove = useCallback(
    async (targetPath: string) => {
      if (!target) return;
      try {
        await moveFolder(drive, target.path, targetPath);
        setMoveOpen(false);
        if (onUpdate) onUpdate();
      } catch {
        setError(t("moveFailed"));
      }
    },
    [drive, target, onUpdate, t],
  );

  const handleDelete = useCallback(async () => {
    if (!target) return;
    try {
      await deleteFolder(drive, target.path);
      setDeleteOpen(false);
      if (onUpdate) onUpdate();
    } catch {
      setError(t("deleteFailed"));
    }
  }, [drive, target, onUpdate, t]);

  if (!target) return null;

  const items: MenuItem[] = [];
  if (onTogglePin) {
    items.push({
      icon: isPinned ? PinOff : Pin,
      label: isPinned ? t("unpin") : t("pin"),
      onClick: onTogglePin,
    });
  }
  items.push({
    icon: Pencil,
    label: tc("rename"),
    onClick: () => setRenameOpen(true),
  });
  items.push({
    icon: Move,
    label: tc("move"),
    onClick: () => setMoveOpen(true),
  });
  items.push({
    icon: Trash2,
    label: tc("delete"),
    onClick: () => setDeleteOpen(true),
    danger: true,
  });

  return (
    <>
      <ContextMenu
        open={open}
        position={position}
        items={items}
        onClose={onClose}
      />
      {renameOpen && (
        <RenameDialog
          open={renameOpen}
          currentName={target.name}
          onRename={handleRename}
          onCancel={() => setRenameOpen(false)}
        />
      )}
      {moveOpen && (
        <MoveDialog
          open={moveOpen}
          drive={drive}
          currentPath={target.path.split("/").slice(0, -1).join("/")}
          excludePath={target.path}
          onMove={handleMove}
          onCancel={() => setMoveOpen(false)}
        />
      )}
      {deleteOpen && (
        <ConfirmDialog
          open={deleteOpen}
          title={t("deleteTitle")}
          message={t("deleteMessage", { name: target.name })}
          confirmLabel={tc("delete")}
          onConfirm={handleDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-danger px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </>
  );
}
