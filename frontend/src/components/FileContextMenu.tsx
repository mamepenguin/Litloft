"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClipboardCopy,
  Download,
  ListMusic,
  Move,
  Pencil,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { deleteFile, getDownloadUrl, moveFile, renameFile } from "@/lib/api";
import type { FileItem } from "@/types";
import { useClipboard } from "./ClipboardProvider";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { MoveDialog } from "./MoveDialog";
import { PlaylistPicker } from "./PlaylistPicker";
import { RenameDialog } from "./RenameDialog";

interface FileContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  target: FileItem | null;
  onClose: () => void;
  onUpdate?: () => void;
  onRemoveFromHistory?: () => Promise<void>;
}

export function FileContextMenu({
  open,
  position,
  target,
  onClose,
  onUpdate,
  onRemoveFromHistory,
}: FileContextMenuProps) {
  const tc = useTranslations("common");
  const tcb = useTranslations("clipboard");
  const tt = useTranslations("trash");
  const tf = useTranslations("file");
  const clipboard = useClipboard();
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);

  useEffect(() => {
    if (!target) {
      setRenameOpen(false);
      setMoveOpen(false);
      setDeleteOpen(false);
      setPlaylistPickerOpen(false);
    }
  }, [target]);

  const handleRename = useCallback(
    async (newName: string) => {
      if (!target) return;
      try {
        await renameFile(target.id, newName);
        setRenameOpen(false);
        onUpdate?.();
      } catch {
        // dialog stays open on error
      }
    },
    [target, onUpdate],
  );

  const handleMove = useCallback(
    async (path: string) => {
      if (!target) return;
      try {
        await moveFile(target.id, path);
        setMoveOpen(false);
        onUpdate?.();
      } catch {
        // dialog stays open on error
      }
    },
    [target, onUpdate],
  );

  const handleDelete = useCallback(async () => {
    if (!target) return;
    try {
      await deleteFile(target.id);
      setDeleteOpen(false);
      onUpdate?.();
    } catch {
      // dialog stays open on error
    }
  }, [target, onUpdate]);

  const handleRemoveFromHistory = useCallback(async () => {
    if (!onRemoveFromHistory) return;
    try {
      await onRemoveFromHistory();
    } catch {
      // Surface failure via the parent; menu still closes for predictable UX.
    } finally {
      onClose();
    }
  }, [onRemoveFromHistory, onClose]);

  if (!target) return null;

  const items: MenuItem[] = [
    {
      icon: Download,
      label: tc("download"),
      onClick: () => {
        window.open(getDownloadUrl(target.id), "_blank");
      },
    },
    {
      icon: ListMusic,
      label: tf("addToPlaylist"),
      onClick: () => setPlaylistPickerOpen(true),
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
  ];

  if (onRemoveFromHistory) {
    items.push({
      icon: X,
      label: tf("removeFromHistory"),
      onClick: () => {
        void handleRemoveFromHistory();
      },
    });
  }

  items.push({
    icon: Trash2,
    label: tt("moveToTrash"),
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
      <RenameDialog
        open={renameOpen}
        currentName={target.filename}
        onRename={handleRename}
        onCancel={() => setRenameOpen(false)}
      />
      <MoveDialog
        open={moveOpen}
        drive={target.drive}
        currentPath={target.folder_path}
        onMove={handleMove}
        onCancel={() => setMoveOpen(false)}
      />
      <PlaylistPicker
        open={playlistPickerOpen}
        drive={target.drive}
        fileIds={[target.id]}
        onClose={() => setPlaylistPickerOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title={tt("moveToTrash")}
        message={tt("confirmMoveToTrash", { name: target.filename })}
        confirmLabel={tt("moveToTrash")}
        note={tt("autoDelete")}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
