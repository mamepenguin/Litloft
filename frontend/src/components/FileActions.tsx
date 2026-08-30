"use client";

import { useCallback, useLayoutEffect, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Move, Pencil, SquarePen, Trash2 } from "lucide-react";

import { useTranslations } from "next-intl";
import {
  deleteFile,
  getDownloadUrl,
  moveFile,
  renameFile,
} from "@/lib/api";
import type { FileItem } from "@/types";
import { ActionMenuItem } from "./ActionMenuItem";
import { AddonSlot } from "./AddonSlot";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";

/** Must match the menu's `w-40`; used to decide which side it opens on. */
const MENU_WIDTH_PX = 160;

interface FileActionsProps {
  file: FileItem;
  onUpdate?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  /**
   * File context handed to the `file-actions-menu` slot, and the opt-in
   * that renders the slot at all: an entry cannot do anything useful
   * without knowing which file it is acting on, so a call site with no
   * context to give gets no addon entries. Today only the file detail page
   * passes it.
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
  const tc = useTranslations("common");
  const tt = useTranslations("trash");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addonDialogOpen, setAddonDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The menu hangs to the left of the trigger, which only works while the
  // trigger sits near its column's right edge. It does not in a wrapped
  // action row or a narrow pane, where the menu would spill over whatever is
  // to the left. Measured on open rather than guessed from a breakpoint,
  // because what matters is the enclosing column, not the viewport.
  const [alignLeft, setAlignLeft] = useState(false);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setAlignLeft(false);
      // The flag belongs to a subtree that only exists while the menu is
      // open, and it is set by an addon in another repository. Clearing it
      // here means a caller that forgets `onDialogOpenChange(false)` cannot
      // strand `anyDialogOpen` at true and leave the menu unclosable.
      setAddonDialogOpen(false);
      return;
    }
    const trigger = menuRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    let boundsLeft = 0;
    for (let el = trigger.parentElement; el; el = el.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(el);
      const clips = /auto|scroll|hidden/.test(overflowX + overflowY);
      if (clips) {
        boundsLeft = el.getBoundingClientRect().left;
        break;
      }
    }
    setAlignLeft(triggerRect.right - MENU_WIDTH_PX < boundsLeft);
  }, [menuOpen]);

  const anyDialogOpen =
    renameOpen || moveOpen || deleteOpen || addonDialogOpen;

  useEffect(() => {
    if (!menuOpen || anyDialogOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen, anyDialogOpen]);

  // A popup must be dismissable from the keyboard. Without this the only
  // ways out are an outside click or picking an item, so a keyboard user
  // who opens the menu cannot back out of it.
  useEffect(() => {
    if (!menuOpen || anyDialogOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen, anyDialogOpen]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleDownload = useCallback(() => {
    setMenuOpen(false);
    window.open(getDownloadUrl(file.id), "_blank");
  }, [file.id]);

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

  const menuItems = [
    ...(onEdit ? [{
      icon: SquarePen,
      label: t("edit"),
      onClick: () => {
        setMenuOpen(false);
        onEdit();
      },
    }] : []),
    {
      icon: Download,
      label: tc("download"),
      onClick: handleDownload,
    },
    {
      icon: Pencil,
      label: tc("rename"),
      onClick: () => {
        setMenuOpen(false);
        setRenameOpen(true);
      },
    },
    {
      icon: Move,
      label: tc("move"),
      onClick: () => {
        setMenuOpen(false);
        setMoveOpen(true);
      },
    },
    {
      icon: Trash2,
      label: tt("moveToTrash"),
      onClick: () => {
        setMenuOpen(false);
        setDeleteOpen(true);
      },
      danger: true,
    },
  ];

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
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
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

        {menuOpen && (
          <div
            role="menu"
            className={`absolute top-full z-30 mt-1 w-40 overflow-hidden rounded-2xl border border-bg-border bg-bg-card shadow-lg ${
              alignLeft ? "left-0" : "right-0"
            }`}
          >
            {menuItems.map((item) => (
              <ActionMenuItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                onClick={item.onClick}
                danger={item.danger}
              />
            ))}
            {addonProps && (
              /* `empty:hidden` carries the separator: no addon claims this
                 slot on a stock install, and an entry that does claim it may
                 still render nothing for a given file. Either way the rule
                 would otherwise float under the last core item with nothing
                 beneath it.

                 An entry here must NOT close the menu when it opens a
                 dialog: closing unmounts this subtree, taking the dialog
                 with it. Entries open their dialog, report it through
                 `onDialogOpenChange` so the outside-click and Escape
                 listeners stand down, and call `onRequestClose` only once
                 the dialog is dismissed. */
              <div
                /* Presentational: the menuitems inside must read as direct
                   children of role="menu", and the rule itself is decoration. */
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
        )}

        {error && (
          <div className="absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded-2xl bg-danger px-3 py-1.5 text-xs text-white">
            {error}
          </div>
        )}
      </div>

      {renameOpen &&
        createPortal(
          <RenameDialog
            open={renameOpen}
            currentName={file.filename}
            onRename={handleRename}
            onCancel={() => setRenameOpen(false)}
          />,
          document.body
        )}

      {moveOpen &&
        createPortal(
          <MoveDialog
            open={moveOpen}
            drive={file.drive}
            currentPath={file.folder_path}
            onMove={handleMove}
            onCancel={() => setMoveOpen(false)}
          />,
          document.body
        )}

      {deleteOpen &&
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
          document.body
        )}
    </>
  );
}
