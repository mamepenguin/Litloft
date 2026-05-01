"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, RefreshCw, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileType } from "@/types";
import { useSmartFolders } from "@/hooks/useSmartFolders";
import { ConfirmDialog } from "./ConfirmDialog";
import { SmartFolderSaveDialog } from "./SmartFolderSaveDialog";

interface SmartFolderSaveButtonProps {
  drive: string;
  query: string;
  typeFilter?: FileType | null;
  smartFolderId: string | null;
}

/**
 * Renders next to the search results heading. Two visual modes:
 *
 *  - "save": no smart_folder_id in URL → "★ Save" button. Clicking opens
 *    the name dialog. After save, replaces the URL with smart_folder_id.
 *  - "saved": smart_folder_id matches an existing SF → "★ Saved: {name}"
 *    chip with a dropdown for "Update / Rename / Delete".
 *
 * Drive-scoped: always operates on the current drive.
 */
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menuOpen]);

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

  // Don't show the button at all if the search query is empty (defensive).
  if (!query.trim()) return null;

  const inSavedMode = !!current;

  return (
    <>
      {inSavedMode ? (
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
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
            <div
              role="menu"
              className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-2xl border border-bg-border bg-bg-card shadow-xl animate-fade-in-scale"
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
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-danger px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </>
  );
}
