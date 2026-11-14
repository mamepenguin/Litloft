"use client";

import type React from "react";
import { type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Library, ListFilter, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { CollectionSummary } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContextMenu, type MenuItem } from "@/components/ContextMenu";
import { SmartFolderSaveDialog } from "@/components/SmartFolderSaveDialog";
import { useSmartFolders } from "@/hooks/useSmartFolders";
import { addCollectionItems, getCollections } from "@/lib/api";
import { useImeKeyGuard } from "@/lib/ime";
import { focusEnd } from "@/lib/nameInUse";
import { smartFolderHref } from "@/lib/driveViews";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";
import {
  useMergedCollectionOrder,
  type CollectionSectionRow,
} from "./useMergedCollectionOrder";
import { useSmartCollectionActions } from "./useSmartCollectionActions";
import { useReorderableDnD } from "./useReorderableDnD";
import { ItemDragHandle } from "./ItemDragHandle";
import { SidebarSectionHeading } from "./SidebarSectionHeading";

interface SidebarCollectionsSectionProps {
  currentDrive: string | null;
  driveBase: string;
  close: () => void;
  collectionList: CollectionSummary[];
  setCollectionList: (v: CollectionSummary[]) => void;
  creatingCollection: boolean;
  setCreatingCollection: (v: boolean) => void;
  newCollectionName: string;
  setNewCollectionName: (v: string) => void;
  renamingId: string | null;
  setRenamingId: (v: string | null) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  contextMenu: { id: string; x: number; y: number } | null;
  setContextMenu: (v: { id: string; x: number; y: number } | null) => void;
  createInputRef: RefObject<HTMLInputElement | null>;
  renameInputRef: RefObject<HTMLInputElement | null>;
  createInUse?: string | null;
  createBusy?: boolean;
  renameInUse?: string | null;
  renameBusy?: boolean;
  cancelCreate?: () => void;
  cancelRename?: () => void;
  startCollectionRename?: (id: string, name: string) => void;
  handleCreateCollection: () => void;
  handleRenameCollection: () => void;
  handleDeleteCollection: (id: string) => void;
  handleCollectionClick: (c: CollectionSummary) => void;
  dragHandle?: React.ReactNode;
}

export function SidebarCollectionsSection({
  currentDrive,
  close,
  collectionList,
  setCollectionList,
  creatingCollection,
  setCreatingCollection,
  newCollectionName,
  setNewCollectionName,
  renamingId,
  setRenamingId,
  renameValue,
  setRenameValue,
  contextMenu,
  setContextMenu,
  createInputRef,
  renameInputRef,
  createInUse = null,
  createBusy = false,
  renameInUse = null,
  renameBusy = false,
  cancelCreate,
  cancelRename,
  startCollectionRename,
  handleCreateCollection,
  handleRenameCollection,
  handleDeleteCollection,
  handleCollectionClick,
  dragHandle,
}: SidebarCollectionsSectionProps) {
  const t = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const cancelCreateEdit =
    cancelCreate ??
    (() => {
      setCreatingCollection(false);
      setNewCollectionName("");
    });
  const cancelRenameEdit =
    cancelRename ??
    (() => {
      setRenamingId(null);
      setRenameValue("");
    });
  const beginRename = useMemo(
    () =>
      startCollectionRename ??
      ((id: string, name: string) => {
        setRenamingId(id);
        setRenameValue(name);
      }),
    [startCollectionRename, setRenamingId, setRenameValue],
  );
  const ime = useImeKeyGuard();
  const createInUseId = useId();
  const renameInUseId = useId();
  const router = useRouter();
  const locale = useLocale();
  const { collapsed, toggle, expand } = useSidebarSectionCollapsed("collections");
  const { smartFolders, update, remove } = useSmartFolders(currentDrive);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  useEffect(() => {
    if (createInUse) focusEnd(createInputRef.current);
  }, [createInUse, createInputRef]);
  useEffect(() => {
    if (renameInUse) focusEnd(renameInputRef.current);
  }, [renameInUse, renameInputRef]);
  const dragCounterRef = useRef<Map<string, number>>(new Map());
  const smart = useSmartCollectionActions({ smartFolders, update, remove });

  const rows = useMemo<CollectionSectionRow[]>(
    () => [
      ...collectionList.map((c) => ({
        key: `collection:${c.id}`,
        kind: "collection" as const,
        id: c.id,
        name: c.name,
      })),
      ...smartFolders.map((sf) => ({
        key: `smart:${sf.id}`,
        kind: "smart" as const,
        id: sf.id,
        name: sf.name,
      })),
    ],
    [collectionList, smartFolders],
  );

  const { order, setOrder } = useMergedCollectionOrder(currentDrive, rows, locale);
  // Reorder DnD uses its own per-section MIME
  // (application/x-litloft-reorder-sidebar-item-collections), entirely
  // separate from the existing application/x-file-ids drop that adds files
  // to a collection. The reorder primitive early-returns when its MIME is
  // absent, so a file-ids drag passes through the row wrapper untouched and
  // reaches the collection row's file-ids handlers below.
  const itemDnd = useReorderableDnD({
    kind: "sidebar-item-collections",
    ids: order,
    onReorder: setOrder,
  });

  // Rebuilt whenever the target changes, because every entry closes over
  // the collection it acts on. `ContextMenu` runs the handler in a
  // `requestAnimationFrame` after closing, so `renamingId` is set on a
  // tree that no longer holds the menu.
  const collectionMenuItems = useMemo<MenuItem[]>(() => {
    const target = collectionList.find((c) => c.id === contextMenu?.id);
    if (!target) return [];
    return [
      {
        icon: Pencil,
        label: t("renameCollection"),
        onClick: () => beginRename(target.id, target.name),
      },
      {
        icon: Trash2,
        label: t("deleteCollection"),
        danger: true,
        onClick: () => handleDeleteCollection(target.id),
      },
    ];
  }, [
    collectionList,
    contextMenu,
    handleDeleteCollection,
    beginRename,
    t,
  ]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-file-ids")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, collectionId: string) => {
    if (!e.dataTransfer.types.includes("application/x-file-ids")) return;
    e.preventDefault();
    const counter = (dragCounterRef.current.get(collectionId) ?? 0) + 1;
    dragCounterRef.current.set(collectionId, counter);
    setDropTargetId(collectionId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, collectionId: string) => {
    e.preventDefault();
    const counter = (dragCounterRef.current.get(collectionId) ?? 0) - 1;
    dragCounterRef.current.set(collectionId, Math.max(0, counter));
    if (counter <= 0) {
      dragCounterRef.current.delete(collectionId);
      setDropTargetId((prev) => (prev === collectionId ? null : prev));
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, collectionId: string) => {
      e.preventDefault();
      dragCounterRef.current.clear();
      setDropTargetId(null);

      if (!currentDrive) return;

      const raw = e.dataTransfer.getData("application/x-file-ids");
      if (!raw) return;

      try {
        const fileIds: string[] = JSON.parse(raw);
        if (fileIds.length === 0) return;
        await addCollectionItems(currentDrive, collectionId, fileIds);
        const updated = await getCollections(currentDrive);
        setCollectionList(updated);
      } catch {
        // silently ignore errors (e.g. duplicate items)
      }
    },
    [currentDrive, setCollectionList],
  );

  const handleSmartClick = useCallback(
    (sf: SmartFolder) => {
      if (!currentDrive) return;
      router.push(smartFolderHref({ ...sf, drive: currentDrive }));
      close();
    },
    [currentDrive, router, close],
  );

  const indicatorFor = (id: string) =>
    itemDnd.dropTarget?.id === id ? (
      <div
        className="pointer-events-none absolute inset-x-2 h-0.5 bg-accent z-10"
        style={{ [itemDnd.dropTarget.position === "before" ? "top" : "bottom"]: 0 }}
      />
    ) : null;

  const rowFor = (c: CollectionSummary) => {
    const key = `collection:${c.id}`;
    const isRenaming = renamingId === c.id;
    return (
      <div key={key} className="group relative" {...itemDnd.getRowProps(key)}>
        {indicatorFor(key)}
        {!isRenaming && <ItemDragHandle {...itemDnd.getHandleProps(key)} />}
        {isRenaming ? (
          <div className="px-3">
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              readOnly={renameBusy}
              aria-invalid={renameInUse ? true : undefined}
              aria-describedby={renameInUse ? renameInUseId : undefined}
              onChange={(e) => setRenameValue(e.target.value)}
              onCompositionEnd={ime.onCompositionEnd}
              onKeyDown={(e) => {
                if (ime.isImeKeystroke(e)) return;
                if (e.key === "Enter") handleRenameCollection();
                if (e.key === "Escape" && !renameBusy) cancelRenameEdit();
              }}
              onBlur={() => {
                if (renameBusy) return;
                if (renameInUse) {
                  focusEnd(renameInputRef.current);
                  return;
                }
                handleRenameCollection();
              }}
              className={`w-full rounded-lg bg-bg-card px-2 py-1.5 text-sm text-text-primary outline-none focus:ring-2 ${
                renameInUse ? "ring-2 ring-danger focus:ring-danger" : "focus:ring-focus-ring"
              }`}
            />
            {renameInUse && (
              <span id={renameInUseId} className="mt-1 block text-xs text-danger">
                {tCommon("nameInUse")}
              </span>
            )}
          </div>
        ) : (
          <button
            onClick={() => handleCollectionClick(c)}
            onContextMenu={(e) => {
              e.preventDefault();
              smart.setMenu(null);
              setContextMenu({ id: c.id, x: e.clientX, y: e.clientY });
            }}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, c.id)}
            onDragLeave={(e) => handleDragLeave(e, c.id)}
            onDrop={(e) => handleDrop(e, c.id)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              dropTargetId === c.id
                ? "bg-accent/20 text-accent ring-1 ring-accent/50"
                : "text-text-muted hover:bg-bg-elevated hover:text-text-primary cursor-pointer"
            }`}
          >
            <Library size={16} />
            <span className="flex-1 truncate text-left">{c.name}</span>
            <span className="text-xs opacity-60">{c.item_count}</span>
          </button>
        )}
      </div>
    );
  };

  const rowForSmart = (sf: SmartFolder) => {
    const key = `smart:${sf.id}`;
    return (
      <div key={key} className="group relative" {...itemDnd.getRowProps(key)}>
        {indicatorFor(key)}
        {smart.renaming?.id !== sf.id && <ItemDragHandle {...itemDnd.getHandleProps(key)} />}
        <button
          type="button"
          onClick={() => handleSmartClick(sf)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu(null);
            smart.setMenu({ id: sf.id, x: e.clientX, y: e.clientY });
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <ListFilter size={16} />
          <span className="flex-1 truncate text-left">{sf.name}</span>
        </button>
      </div>
    );
  };

  return (
    <>
      <SidebarSectionHeading
        label={t("collections")}
        collapsed={collapsed}
        onToggle={toggle}
        dragHandle={dragHandle}
        actions={
          <button
            onClick={() => {
              expand();
              setCreatingCollection(true);
              if (createInUse) {
                focusEnd(createInputRef.current);
                return;
              }
              setNewCollectionName("");
            }}
            className="text-text-muted hover:text-text-primary"
            aria-label={t("createCollection")}
          >
            <Plus size={14} />
          </button>
        }
      />

      {!collapsed && creatingCollection && (
        <div className="px-3">
          <input
            ref={createInputRef}
            type="text"
            value={newCollectionName}
            readOnly={createBusy}
            aria-invalid={createInUse ? true : undefined}
            aria-describedby={createInUse ? createInUseId : undefined}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onCompositionEnd={ime.onCompositionEnd}
            onKeyDown={(e) => {
              if (ime.isImeKeystroke(e)) return;
              if (e.key === "Enter") handleCreateCollection();
              if (e.key === "Escape" && !createBusy) cancelCreateEdit();
            }}
            onBlur={() => {
              if (createBusy) return;
              if (createInUse) {
                focusEnd(createInputRef.current);
                return;
              }
              handleCreateCollection();
            }}
            placeholder={t("collectionNamePlaceholder")}
            className={`w-full rounded-lg bg-bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 ${
              createInUse ? "ring-2 ring-danger focus:ring-danger" : "focus:ring-focus-ring"
            }`}
          />
          {createInUse && (
            <span id={createInUseId} className="mt-1 block text-xs text-danger">
              {tCommon("nameInUse")}
            </span>
          )}
        </div>
      )}

      {!collapsed &&
        order.map((key) => {
          const kind = key.startsWith("smart:") ? "smart" : "collection";
          const id = key.slice(key.indexOf(":") + 1);
          if (kind === "smart") {
            const sf = smartFolders.find((s) => s.id === id);
            return sf ? rowForSmart(sf) : null;
          }
          const c = collectionList.find((col) => col.id === id);
          return c ? rowFor(c) : null;
        })}

      {contextMenu && (
        <ContextMenu
          open
          position={{ x: contextMenu.x, y: contextMenu.y }}
          items={collectionMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {smart.menu && (
        <ContextMenu
          open
          position={{ x: smart.menu.x, y: smart.menu.y }}
          items={smart.menuItems}
          onClose={() => smart.setMenu(null)}
        />
      )}

      {smart.renaming && (
        <SmartFolderSaveDialog
          open
          mode="rename"
          initialName={smart.renaming.name}
          onSubmit={smart.handleRename}
          onCancel={() => smart.setRenaming(null)}
        />
      )}

      {smart.deleting && (
        <ConfirmDialog
          open
          title={smart.t("deleteConfirmTitle")}
          message={smart.t("deleteConfirmMessage", { name: smart.deleting.name })}
          confirmLabel={smart.t("delete")}
          onConfirm={smart.handleDelete}
          onCancel={() => smart.setDeleting(null)}
        />
      )}

      {smart.error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl bg-danger px-4 py-2 text-sm text-white shadow-lg">
          {smart.error}
        </div>
      )}
    </>
  );
}
