"use client";

import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Pencil, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContextMenu, type MenuItem } from "@/components/ContextMenu";
import { SmartFolderSaveDialog } from "@/components/SmartFolderSaveDialog";
import { useSmartFolders } from "@/hooks/useSmartFolders";
import type { SmartFolder } from "@/types/smartFolder";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";
import { useSidebarItemOrder } from "./useSidebarItemOrder";
import { useReorderableDnD } from "./useReorderableDnD";
import { ItemDragHandle } from "./ItemDragHandle";

interface SidebarSmartFoldersSectionProps {
  drive: string;
  close: () => void;
  dragHandle?: React.ReactNode;
}

interface ContextMenuState {
  id: string;
  x: number;
  y: number;
}

export function SidebarSmartFoldersSection({
  drive,
  close,
  dragHandle,
}: SidebarSmartFoldersSectionProps) {
  const t = useTranslations("smartFolder");
  const tSidebar = useTranslations("sidebar");
  const router = useRouter();
  const { collapsed, toggle } = useSidebarSectionCollapsed("smart-folders");

  const { smartFolders, update, remove } = useSmartFolders(drive);

  // Stable id list (sf.id). Memoised so the reorder hooks keep a steady
  // reference and do not churn `order` identity on every render.
  const currentIds = useMemo(() => smartFolders.map((sf) => sf.id), [smartFolders]);
  const { order, setOrder } = useSidebarItemOrder("smart-folders", drive, currentIds);
  const itemDnd = useReorderableDnD({
    kind: "sidebar-item-smart-folders",
    ids: order,
    onReorder: setOrder,
  });

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<SmartFolder | null>(null);
  const [deleting, setDeleting] = useState<SmartFolder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(
    (sf: SmartFolder) => {
      const params = new URLSearchParams();
      params.set("q", sf.query);
      if (sf.file_type) params.set("type", sf.file_type);
      params.set("smart_folder_id", sf.id);
      router.push(`/drive/${encodeURIComponent(drive)}/search?${params.toString()}`);
      close();
    },
    [drive, router, close],
  );

  const openContextMenu = useCallback(
    (e: React.MouseEvent, sf: SmartFolder) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ id: sf.id, x: e.clientX, y: e.clientY });
    },
    [],
  );

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

  // Hide the entire section when there are no entries for the current drive.
  if (smartFolders.length === 0) return null;

  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const menuTarget = contextMenu
    ? smartFolders.find((sf) => sf.id === contextMenu.id) ?? null
    : null;

  const items: MenuItem[] = menuTarget
    ? [
        {
          icon: Pencil,
          label: t("rename"),
          onClick: () => setRenaming(menuTarget),
        },
        {
          icon: Trash2,
          label: t("delete"),
          onClick: () => setDeleting(menuTarget),
          danger: true,
        },
      ]
    : [];

  return (
    <>
      <div className="group relative">
        {dragHandle}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={
            collapsed ? tSidebar("sectionExpand") : tSidebar("sectionCollapse")
          }
          className="mb-1 mt-4 flex w-full items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
        >
          <Chevron size={12} />
          <span>{t("sectionTitle")}</span>
        </button>
      </div>
      {!collapsed &&
        order.map((id) => {
          const sf = smartFolders.find((s) => s.id === id);
          if (!sf) return null;
          return (
            <div
              key={sf.id}
              className="group relative"
              {...itemDnd.getRowProps(sf.id)}
            >
              {itemDnd.dropTarget?.id === sf.id && (
                <div
                  className="pointer-events-none absolute inset-x-2 h-0.5 bg-accent z-10"
                  style={{
                    [itemDnd.dropTarget.position === "before" ? "top" : "bottom"]: 0,
                  }}
                />
              )}
              <ItemDragHandle {...itemDnd.getHandleProps(sf.id)} />
              <button
                type="button"
                onClick={() => handleClick(sf)}
                onContextMenu={(e) => openContextMenu(e, sf)}
                className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                <Search size={16} />
                <span className="flex-1 truncate text-left">{sf.name}</span>
              </button>
            </div>
          );
        })}

      {contextMenu && (
        <ContextMenu
          open={true}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          items={items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {renaming && (
        <SmartFolderSaveDialog
          open={true}
          mode="rename"
          initialName={renaming.name}
          onSubmit={handleRename}
          onCancel={() => setRenaming(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open={true}
          title={t("deleteConfirmTitle")}
          message={t("deleteConfirmMessage", { name: deleting.name })}
          confirmLabel={t("delete")}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl bg-danger px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </>
  );
}
