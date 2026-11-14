"use client";

import { useCallback, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { MenuItem } from "@/components/ContextMenu";
import type { SmartFolder } from "@/types/smartFolder";

export interface SmartCollectionMenuTarget {
  id: string;
  x: number;
  y: number;
}

interface UseSmartCollectionActionsParams {
  smartFolders: readonly SmartFolder[];
  update: (id: string, payload: { name: string }) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
}

/** The context menu and the rename/delete dialogs of the Smart Collection rows. */
export function useSmartCollectionActions({
  smartFolders,
  update,
  remove,
}: UseSmartCollectionActionsParams) {
  const t = useTranslations("smartFolder");
  const [menu, setMenu] = useState<SmartCollectionMenuTarget | null>(null);
  const [renaming, setRenaming] = useState<SmartFolder | null>(null);
  const [deleting, setDeleting] = useState<SmartFolder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const menuItems = useMemo<MenuItem[]>(() => {
    const target = smartFolders.find((sf) => sf.id === menu?.id);
    if (!target) return [];
    return [
      { icon: Pencil, label: t("rename"), onClick: () => setRenaming(target) },
      {
        icon: Trash2,
        label: t("delete"),
        danger: true,
        onClick: () => setDeleting(target),
      },
    ];
  }, [smartFolders, menu, t]);

  const handleRename = useCallback(
    async (newName: string) => {
      if (!renaming) return;
      try {
        await update(renaming.id, { name: newName });
        setRenaming(null);
      } catch {
        setError(t("renameFailed"));
      }
    },
    [renaming, update, t],
  );

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await remove(deleting.id);
      setDeleting(null);
    } catch {
      setError(t("deleteFailed"));
    }
  }, [deleting, remove, t]);

  return {
    t,
    menu,
    setMenu,
    menuItems,
    renaming,
    setRenaming,
    deleting,
    setDeleting,
    error,
    handleRename,
    handleDelete,
  };
}
