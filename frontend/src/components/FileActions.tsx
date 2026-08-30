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
}

export function FileActions({ file, onUpdate, onDelete, onEdit }: FileActionsProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const tt = useTranslations("trash");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu hangs to the left of the trigger, which only works while the
  // trigger sits near its column's right edge. It does not in a wrapped
  // action row or a narrow pane, where the menu would spill over whatever is
  // to the left. Measured on open rather than guessed from a breakpoint,
  // because what matters is the enclosing column, not the viewport.
  const [alignLeft, setAlignLeft] = useState(false);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setAlignLeft(false);
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

  const anyDialogOpen = renameOpen || moveOpen || deleteOpen;

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
            className={`absolute top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-bg-border bg-bg-card shadow-lg ${
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
