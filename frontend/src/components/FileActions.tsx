"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";

import { useTranslations } from "next-intl";
import {
  deleteFile,
  moveFile,
  renameFile,
} from "@/lib/api";
import {
  ANCHORED_VERTICAL,
  useAnchoredDirection,
} from "@/hooks/useAnchoredDirection";
import { useFileMenuItems } from "@/hooks/useFileMenuItems";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import type { FileItem } from "@/types";
import { ActionMenuItem } from "./ActionMenuItem";
import { DismissScrim } from "./DismissScrim";
import { useDialogPortalTarget } from "./DialogPortal";
import { AddonSlot } from "./AddonSlot";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";
import { CollectionPicker } from "./CollectionPicker";

/**
 * The gap is part of the room the menu needs, so it belongs inside the
 * comparison: without it a menu whose height lands in the last 4px of the
 * space below is kept downward and its final pixels sit past the edge.
 */
export const MENU_GAP_PX = ANCHORED_VERTICAL[1].px;

interface FileActionsProps {
  file: FileItem;
  onUpdate?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  /**
   * The opt-in that renders the `file-actions-menu` slot at all: an entry
   * cannot do anything useful without knowing which file it is acting on.
   */
  addonProps?: Record<string, unknown>;
}

export function FileActions({
  file,
  onUpdate,
  onDelete,
  onEdit,
  addonProps,
}: FileActionsProps) {
  const t = useTranslations("file");
  const tt = useTranslations("trash");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [addonDialogOpen, setAddonDialogOpen] = useState(false);
  const dialogHost = useDialogPortalTarget();
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuBoxRef = useRef<HTMLDivElement>(null);
  const { openUp, side } = useAnchoredDirection({
    triggerRef: menuRef,
    panelRef: menuBoxRef,
    open: menuOpen,
    gapPx: MENU_GAP_PX,
  });

  useEffect(() => {
    // Set by an addon in another repository. Clearing it here means a caller
    // that forgets `onDialogOpenChange(false)` cannot strand `anyDialogOpen`
    // at true and leave the menu unclosable.
    if (!menuOpen) setAddonDialogOpen(false);
  }, [menuOpen]);

  const anyDialogOpen =
    renameOpen || moveOpen || deleteOpen || addonDialogOpen;

  // On the stack, not on `document`: the menu can open a dialog, and two
  // listeners would answer one press.
  useShortcuts(
    "file-actions-menu",
    "Dialog",
    [
      {
        key: "escape",
        label: "Close",
        editingOnly: false,
        hidden: true,
        handler: () => {
          setMenuOpen(false);
          triggerRef.current?.focus();
        },
      },
    ],
    menuOpen && !anyDialogOpen,
    OVERLAY_PRIORITY,
  );

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleRename = useCallback(
    async (newName: string) => {
      try {
        await renameFile(file.id, newName);
        setRenameOpen(false);
        if (onUpdate) onUpdate();
      } catch {
        setError(t("renameFailed"));
      }
    },
    [file.id, onUpdate, t]
  );

  const handleMove = useCallback(
    async (targetPath: string) => {
      try {
        await moveFile(file.id, targetPath);
        setMoveOpen(false);
        if (onUpdate) onUpdate();
      } catch {
        setError(t("moveFailed"));
      }
    },
    [file.id, onUpdate, t]
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteFile(file.id);
      setDeleteOpen(false);
      if (onDelete) onDelete();
    } catch {
      setError(t("deleteFailed"));
    }
  }, [file.id, onDelete, t]);

  // Each handler closes the menu first: the dialogs portal out of this
  // subtree, and leaving it open would stack a menu over them.
  const menuItems = useFileMenuItems(file, {
    onEdit: onEdit
      ? () => {
          setMenuOpen(false);
          onEdit();
        }
      : undefined,
    onAddToCollection: () => {
      setMenuOpen(false);
      setCollectionPickerOpen(true);
    },
    onRename: () => {
      setMenuOpen(false);
      setRenameOpen(true);
    },
    onMove: () => {
      setMenuOpen(false);
      setMoveOpen(true);
    },
    onTrash: () => {
      setMenuOpen(false);
      setDeleteOpen(true);
    },
  });

  const menu = (
    <div
      ref={menuBoxRef}
      role="menu"
      className={`absolute z-30 w-40 overflow-hidden rounded-2xl border border-bg-border bg-bg-card shadow-lg ${
        ANCHORED_VERTICAL[1][openUp ? "up" : "down"]
      } ${side === "left" ? "left-0" : "right-0"}`}
    >
      {menuItems.map((item) => (
        <ActionMenuItem
          key={item.label}
          icon={item.icon}
          label={item.label}
          onClick={item.onClick}
          disabled={item.disabled}
          danger={item.danger}
        />
      ))}
      {addonProps && (
        /* `empty:hidden` carries the separator: an entry that claims this
           slot may still render nothing for a given file.

           An entry here must NOT close the menu when it opens a
           dialog: closing unmounts this subtree, taking the dialog
           with it. Entries report it through `onDialogOpenChange` and
           call `onRequestClose` only once the dialog is dismissed. */
        <div
          role="none"
          className="mt-1 border-t border-bg-border pt-1 empty:hidden"
        >
          <AddonSlot
            id="file-actions-menu"
            layout="stack"
            props={{
              ...addonProps,
              onRequestClose: () => {
                setAddonDialogOpen(false);
                setMenuOpen(false);
                // The entry that had focus is about to unmount with
                // the menu; without this, focus lands on <body>.
                triggerRef.current?.focus();
              },
              onDialogOpenChange: setAddonDialogOpen,
            }}
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          ref={triggerRef}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          // The touch floor on the control, because the row's rule cannot
          // reach it: `.file-action-row-touch > *` grows the *direct child*,
          // and this button sits inside the `.relative` wrapper the menu
          // needs. `p-1.5` has no `display`, so `h-11 w-11` alone would leave
          // the glyph against the left padding edge.
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary pointer-coarse:h-11 pointer-coarse:w-11"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("actions")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>

        {menuOpen &&
          (anyDialogOpen ? (
            menu
          ) : (
            <DismissScrim
              onDismiss={() => setMenuOpen(false)}
              // Not while a dialog raised from this menu is up: the dialog
              // portals out of this subtree and a layer behind it would
              // answer the presses meant for it.
              className="fixed inset-0 z-30"
            >
              {menu}
            </DismissScrim>
          ))}

        {error && (
          <div
            /* This box does not wrap, so its width is whatever the message
               is: on a trigger near its column's left edge a `right-0` toast
               crosses exactly the edge the side decision exists to keep the
               menu inside. */
            className={`absolute z-30 whitespace-nowrap rounded-2xl bg-danger px-3 py-1.5 text-xs text-white ${
              ANCHORED_VERTICAL[1][openUp ? "up" : "down"]
            } ${side === "left" ? "left-0" : "right-0"}`}
          >
            {error}
          </div>
        )}
      </div>

      {renameOpen && dialogHost &&
        createPortal(
          <RenameDialog
            open={renameOpen}
            currentName={file.filename}
            onRename={handleRename}
            onCancel={() => setRenameOpen(false)}
          />,
          dialogHost
        )}

      {moveOpen && dialogHost &&
        createPortal(
          <MoveDialog
            open={moveOpen}
            drive={file.drive}
            currentPath={file.folder_path}
            onMove={handleMove}
            onCancel={() => setMoveOpen(false)}
          />,
          dialogHost
        )}

      {/* Opened from inside the mobile Bottom Sheet, a dialog rendered in
          place is buried by the sheet it was opened from. */}
      {collectionPickerOpen && dialogHost &&
        createPortal(
          <CollectionPicker
            open={collectionPickerOpen}
            drive={file.drive}
            fileIds={[file.id]}
            onClose={() => setCollectionPickerOpen(false)}
          />,
          dialogHost
        )}

      {deleteOpen && dialogHost &&
        createPortal(
          <ConfirmDialog
            open={deleteOpen}
            title={tt("moveToTrash")}
            message={tt("confirmMoveToTrash", { name: file.filename })}
            confirmLabel={tt("moveToTrash")}
            onConfirm={handleDelete}
            onCancel={() => setDeleteOpen(false)}
            note={tt("autoDelete")}
          />,
          dialogHost
        )}
    </>
  );
}
