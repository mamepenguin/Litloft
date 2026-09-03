"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { deleteFile, moveFile, renameFile } from "@/lib/api";
import { useFileMenuItems } from "@/hooks/useFileMenuItems";
import type { FileItem } from "@/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu } from "./ContextMenu";
import { MoveDialog } from "./MoveDialog";
import { CollectionPicker } from "./CollectionPicker";
import { RenameDialog } from "./RenameDialog";

interface FileContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  target: FileItem | null;
  onClose: () => void;
  onUpdate?: () => void;
  onRemoveFromHistory?: () => Promise<void>;
  /**
   * Tree-pane opt-in. When provided the menu shows "Open in new tab"
   * and dispatches the callback (typically `window.open('/files/{id}',
   * '_blank')`). The right pane omits this since it already lives on
   * the file's own page.
   */
  onOpenInNewTab?: () => void;
  /**
   * Opt-in inline rename. When provided, Rename hands control back to the
   * host so it can edit the row in place instead of opening
   * {@link RenameDialog}. Hosts with no row to edit — the file detail
   * page, search results — omit it and keep the dialog.
   */
  onStartInlineRename?: () => void;
}

export function FileContextMenu({
  open,
  position,
  target,
  onClose,
  onUpdate,
  onRemoveFromHistory,
  onOpenInNewTab,
  onStartInlineRename,
}: FileContextMenuProps) {
  const tc = useTranslations("common");
  const tt = useTranslations("trash");
  const tf = useTranslations("file");
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);

  useEffect(() => {
    if (!target) {
      setRenameOpen(false);
      setMoveOpen(false);
      setDeleteOpen(false);
      setCollectionPickerOpen(false);
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

  const items = useFileMenuItems(target, {
    onOpenInNewTab,
    onAddToCollection: () => setCollectionPickerOpen(true),
    onStartInlineRename,
    onRename: () => setRenameOpen(true),
    onMove: () => setMoveOpen(true),
    onRemoveFromHistory: onRemoveFromHistory
      ? () => {
          void handleRemoveFromHistory();
        }
      : undefined,
    onTrash: () => setDeleteOpen(true),
  });

  if (!target) return null;

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
      <CollectionPicker
        open={collectionPickerOpen}
        drive={target.drive}
        fileIds={[target.id]}
        onClose={() => setCollectionPickerOpen(false)}
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
