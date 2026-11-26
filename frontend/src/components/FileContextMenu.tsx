"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { deleteFile, moveFile, renameFile } from "@/lib/api";
import { copyText } from "@/lib/copyText";
import { useFileMenuItems, type ExtraMenuItems } from "@/hooks/useFileMenuItems";
import type { FileItem } from "@/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type MenuDivider, type MenuEntry } from "./ContextMenu";
import { CopyIdDialog } from "./CopyIdDialog";
import { MoveDialog } from "./MoveDialog";
import { CollectionPicker } from "./CollectionPicker";
import { RenameDialog } from "./RenameDialog";
import { sidecarErrorNames, sidecarErrorMessage, subtitleFailure } from "@/lib/subtitleErrors";
import { useToast } from "./ToastProvider";

interface FileContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  target: FileItem | null;
  onClose: () => void;
  onUpdate?: () => void;
  onRemoveFromHistory?: () => Promise<void>;
  onRemoveFromContinue?: () => Promise<void>;
  onOpenInNewTab?: () => void;
  onStartInlineRename?: () => void;
  /** Rows a caller draws above the shared rows, then one divider. */
  extraMenuItems?: ExtraMenuItems;
  /** Run a row's handler in the click itself rather than on the next frame. */
  immediateRows?: boolean;
  /** Called once the trash request succeeds, before `onUpdate`. */
  onTrashed?: (file: FileItem) => void;
  /** Called once the rename request succeeds, before `onUpdate`. */
  onRenamed?: (file: FileItem) => void;
  /** Called once the move request succeeds, before `onUpdate`. */
  onMoved?: (file: FileItem) => void;
  /**
   * Runs when the rename, move or trash dialog is confirmed; the request is
   * sent only when it calls `run`.
   */
  beforeChange?: (run: () => void) => void;
}

const DIVIDER: MenuDivider = { divider: true };

export function FileContextMenu({
  open,
  position,
  target,
  onClose,
  onUpdate,
  onRemoveFromHistory,
  onRemoveFromContinue,
  onOpenInNewTab,
  onStartInlineRename,
  extraMenuItems,
  immediateRows = false,
  onTrashed,
  onRenamed,
  onMoved,
  beforeChange,
}: FileContextMenuProps) {
  const tt = useTranslations("trash");
  const tf = useTranslations("file");
  const ts = useTranslations("subtitles");
  const te = useTranslations("subtitles.errors");
  const toast = useToast();
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [copyIdOpen, setCopyIdOpen] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setRenameOpen(false);
      setMoveOpen(false);
      setDeleteOpen(false);
      setCollectionPickerOpen(false);
      setCopyIdOpen(false);
      setRenameError(null);
    }
  }, [target]);

  const gated = useCallback(
    (send: () => Promise<void>) => {
      const run = () => {
        void send();
      };
      if (beforeChange) beforeChange(run);
      else run();
    },
    [beforeChange],
  );

  const handleRename = useCallback(
    async (newName: string) => {
      if (!target) return;
      setRenameError(null);
      try {
        const updated = await renameFile(target.id, newName);
        const carried = sidecarErrorNames(updated);
        if (carried.length > 0) {
          toast.error(sidecarErrorMessage(ts, carried));
        }
        setRenameOpen(false);
        onRenamed?.(target);
        onUpdate?.();
      } catch (cause) {
        const subtitle = subtitleFailure(cause, te);
        if (subtitle) setRenameError(subtitle);
      }
    },
    [target, onUpdate, onRenamed, te, toast, ts],
  );

  const handleMove = useCallback(
    async (path: string) => {
      if (!target) return;
      try {
        const updated = await moveFile(target.id, path);
        const carried = sidecarErrorNames(updated);
        if (carried.length > 0) {
          toast.error(sidecarErrorMessage(ts, carried));
        }
        setMoveOpen(false);
        onMoved?.(target);
        onUpdate?.();
      } catch (cause) {
        const subtitle = subtitleFailure(cause, te);
        if (subtitle) toast.error(subtitle);
      }
    },
    [target, onUpdate, onMoved, te, toast, ts],
  );

  const handleDelete = useCallback(async () => {
    if (!target) return;
    try {
      await deleteFile(target.id);
      setDeleteOpen(false);
      onTrashed?.(target);
      onUpdate?.();
    } catch {
      // dialog stays open on error
    }
  }, [target, onUpdate, onTrashed]);

  const handleCopyId = useCallback(async () => {
    if (!target) return;
    if (await copyText(target.id)) {
      toast.success(tf("idCopied"));
    } else {
      setCopyIdOpen(true);
    }
  }, [target, toast, tf]);

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

  const handleRemoveFromContinue = useCallback(async () => {
    if (!onRemoveFromContinue) return;
    try {
      await onRemoveFromContinue();
    } catch {
      // Surface failure via the parent; menu still closes for predictable UX.
    } finally {
      onClose();
    }
  }, [onRemoveFromContinue, onClose]);

  const extra = target && extraMenuItems ? extraMenuItems(target) : [];
  const items = useFileMenuItems(target, {
    onOpenInNewTab,
    onAddToCollection: () => setCollectionPickerOpen(true),
    onCopyId: () => {
      void handleCopyId();
    },
    onStartInlineRename,
    onRename: () => {
      setRenameError(null);
      setRenameOpen(true);
    },
    onMove: () => setMoveOpen(true),
    onRemoveFromHistory: onRemoveFromHistory
      ? () => {
          void handleRemoveFromHistory();
        }
      : undefined,
    onRemoveFromContinue: onRemoveFromContinue
      ? () => {
          void handleRemoveFromContinue();
        }
      : undefined,
    onTrash: () => setDeleteOpen(true),
  }, extra);

  const rows = immediateRows ? items.map((item) => ({ ...item, immediate: true })) : items;
  const entries: MenuEntry[] =
    extra.length > 0
      ? [...rows.slice(0, extra.length), DIVIDER, ...rows.slice(extra.length)]
      : rows;

  if (!target) return null;

  return (
    <>
      <ContextMenu
        open={open}
        position={position}
        items={entries}
        onClose={onClose}
      />
      <RenameDialog
        open={renameOpen}
        currentName={target.filename}
        error={renameError ?? undefined}
        onRename={(name) => gated(() => handleRename(name))}
        onCancel={() => {
          setRenameOpen(false);
          setRenameError(null);
        }}
      />
      <MoveDialog
        open={moveOpen}
        drive={target.drive}
        currentPath={target.folder_path}
        onMove={(path) => gated(() => handleMove(path))}
        onCancel={() => setMoveOpen(false)}
      />
      <CollectionPicker
        open={collectionPickerOpen}
        drive={target.drive}
        fileIds={[target.id]}
        onClose={() => setCollectionPickerOpen(false)}
      />
      <CopyIdDialog
        open={copyIdOpen}
        fileId={target.id}
        onClose={() => setCopyIdOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title={tt("moveToTrash")}
        message={tt("confirmMoveToTrash", { name: target.filename })}
        confirmLabel={tt("moveToTrash")}
        note={tt("autoDelete")}
        onConfirm={() => gated(handleDelete)}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
