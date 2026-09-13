"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, RefreshCw, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileKind } from "@/types";
import {
  ANCHORED_ORIGIN,
  ANCHORED_VERTICAL,
  useAnchoredDirection,
} from "@/hooks/useAnchoredDirection";
import { useSmartFolders } from "@/hooks/useSmartFolders";
import { ConfirmDialog } from "./ConfirmDialog";
import { DismissScrim } from "./DismissScrim";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import { SmartFolderSaveDialog } from "./SmartFolderSaveDialog";

interface SmartFolderSaveButtonProps {
  drive: string;
  query: string;
  /**
   * Smart folders accept only four kinds
   * (`_SMART_FOLDER_FILE_TYPES`: video / image / audio / document), so
   * saving one narrowed to any other kind fails with the existing
   * "could not save" error.
   */
  typeFilter?: FileKind | null;
  smartFolderId: string | null;
}

export function SmartFolderSaveButton({
  drive,
  query,
  typeFilter,
  smartFolderId,
}: SmartFolderSaveButtonProps) {
  const t = useTranslations("smartFolder");
  const router = useRouter();

  const { smartFolders, create, update, remove } = useSmartFolders(drive);

  const current = useMemo(
    () =>
      smartFolderId
        ? smartFolders.find((sf) => sf.id === smartFolderId) ?? null
        : null,
    [smartFolders, smartFolderId],
  );

  const [saveOpen, setSaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuWrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { openUp, side } = useAnchoredDirection({
    triggerRef: menuWrapperRef,
    panelRef: menuRef,
    open: menuOpen,
    gapPx: ANCHORED_VERTICAL[1].px,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  // On the shortcut stack, not on `document`: a listener does not know
  // what is stacked above it.
  //
  // `editingOnly: false` because nothing traps focus inside this menu, so
  // Tab walks out of the last row into whatever follows in the document.
  // The provider counts a focused field as "editing", and the default
  // fires only when nothing is — which would leave Escape inert exactly
  // there, with the menu still up.
  useShortcuts(
    "smart-folder-menu",
    "Dialog",
    [
      {
        key: "escape",
        label: "Close",
        editingOnly: false,
        hidden: true,
        handler: () => {
          setMenuOpen(false);
          menuTriggerRef.current?.focus();
        },
      },
    ],
    menuOpen,
    OVERLAY_PRIORITY,
  );

  const buildSearchUrl = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams();
      params.set("q", query);
      if (typeFilter) params.set("type", typeFilter);
      if (id) params.set("smart_folder_id", id);
      return `/drive/${encodeURIComponent(drive)}/search?${params.toString()}`;
    },
    [drive, query, typeFilter],
  );

  const handleSaveSubmit = useCallback(
    async (name: string) => {
      try {
        const created = await create({
          name,
          query,
          file_type: typeFilter ?? null,
        });
        setSaveOpen(false);
        router.replace(buildSearchUrl(created.id));
      } catch {
        setError(t("saveFailed"));
      }
    },
    [create, query, typeFilter, router, buildSearchUrl, t],
  );

  const handleRenameSubmit = useCallback(
    async (name: string) => {
      if (!current) return;
      try {
        await update(current.id, { name });
        setRenameOpen(false);
      } catch {
        setError(t("renameFailed"));
      }
    },
    [current, update, t],
  );

  const handleUpdateConfirm = useCallback(async () => {
    if (!current) return;
    try {
      await update(current.id, {
        query,
        file_type: typeFilter ?? null,
      });
      setUpdateConfirmOpen(false);
    } catch {
      setError(t("updateFailed"));
    }
  }, [current, update, query, typeFilter, t]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!current) return;
    try {
      await remove(current.id);
      setDeleteConfirmOpen(false);
      router.replace(buildSearchUrl(null));
    } catch {
      setError(t("deleteFailed"));
    }
  }, [current, remove, router, buildSearchUrl, t]);

  if (!query.trim()) return null;

  const inSavedMode = !!current;

  return (
    <>
      {inSavedMode ? (
        <div ref={menuWrapperRef} className="relative flex-shrink-0">
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-2xl bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text-primary ring-1 ring-bg-border transition-colors hover:bg-bg-card"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Star size={14} className="text-accent" />
            <span className="max-w-[160px] truncate">
              {t("saved", { name: current.name })}
            </span>
            <ChevronDown size={14} className="text-text-muted" />
          </button>
          {menuOpen && (
            <DismissScrim
              onDismiss={() => setMenuOpen(false)}
              className="fixed inset-0 z-30"
            >
              <div
                ref={menuRef}
                role="menu"
                className={`absolute z-40 w-44 overflow-hidden rounded-2xl border border-bg-border bg-bg-card shadow-lg animate-fade-in-scale ${
                  ANCHORED_VERTICAL[1][openUp ? "up" : "down"]
                } ${side === "left" ? "left-0" : "right-0"} ${
                  ANCHORED_ORIGIN[`${openUp ? "up" : "down"}-${side}`]
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setUpdateConfirmOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
                >
                  <RefreshCw size={14} />
                  {t("update")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenameOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
                >
                  <Pencil size={14} />
                  {t("rename")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteConfirmOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-accent/10"
                >
                  <Trash2 size={14} />
                  {t("delete")}
                </button>
              </div>
            </DismissScrim>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-2xl bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text-primary ring-1 ring-bg-border transition-colors hover:bg-bg-card"
        >
          <Star size={14} className="text-accent" />
          <span className="whitespace-nowrap">{t("save")}</span>
        </button>
      )}

      <SmartFolderSaveDialog
        open={saveOpen}
        mode="save"
        description={t("saveDescription")}
        onSubmit={handleSaveSubmit}
        onCancel={() => setSaveOpen(false)}
      />
      <SmartFolderSaveDialog
        open={renameOpen}
        mode="rename"
        initialName={current?.name ?? ""}
        onSubmit={handleRenameSubmit}
        onCancel={() => setRenameOpen(false)}
      />
      <ConfirmDialog
        open={updateConfirmOpen}
        title={t("updateConfirmTitle")}
        message={t("updateConfirmMessage", { name: current?.name ?? "" })}
        confirmLabel={t("update")}
        onConfirm={handleUpdateConfirm}
        onCancel={() => setUpdateConfirmOpen(false)}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t("deleteConfirmTitle")}
        message={t("deleteConfirmMessage", { name: current?.name ?? "" })}
        confirmLabel={t("delete")}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl bg-danger px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </>
  );
}
