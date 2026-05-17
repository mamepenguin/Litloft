import type React from "react";
import { type RefObject, useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { CollectionSummary } from "@/types";
import { addCollectionItems, getCollections } from "@/lib/api";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";

interface SidebarCollectionsSectionProps {
  currentDrive: string | null;
  driveBase: string;
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
  handleCreateCollection: () => void;
  handleRenameCollection: () => void;
  handleDeleteCollection: (id: string) => void;
  handleCollectionClick: (c: CollectionSummary) => void;
  dragHandle?: React.ReactNode;
}

export function SidebarCollectionsSection({
  currentDrive,
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
  handleCreateCollection,
  handleRenameCollection,
  handleDeleteCollection,
  handleCollectionClick,
  dragHandle,
}: SidebarCollectionsSectionProps) {
  const t = useTranslations("sidebar");
  const { collapsed, toggle, expand } = useSidebarSectionCollapsed("collections");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragCounterRef = useRef<Map<string, number>>(new Map());

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

  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <>
      <div className="mb-1 mt-4 flex items-center justify-between pl-1 pr-3">
        {dragHandle}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("sectionExpand") : t("sectionCollapse")}
          className="flex flex-1 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
        >
          <Chevron size={12} />
          <span>{t("collections")}</span>
        </button>
        <button
          onClick={() => {
            expand();
            setCreatingCollection(true);
            setNewCollectionName("");
          }}
          className="text-text-muted hover:text-text-primary"
          aria-label={t("createCollection")}
        >
          <Plus size={14} />
        </button>
      </div>

      {!collapsed && creatingCollection && (
        <div className="px-3">
          <input
            ref={createInputRef}
            type="text"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateCollection();
              if (e.key === "Escape") {
                setCreatingCollection(false);
                setNewCollectionName("");
              }
            }}
            onBlur={handleCreateCollection}
            placeholder={t("collectionNamePlaceholder")}
            className="w-full rounded-lg bg-bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
      )}

      {!collapsed && collectionList.map((c) => (
        <div key={c.id} className="relative">
          {renamingId === c.id ? (
            <div className="px-3">
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameCollection();
                  if (e.key === "Escape") {
                    setRenamingId(null);
                    setRenameValue("");
                  }
                }}
                onBlur={handleRenameCollection}
                className="w-full rounded-lg bg-bg-card px-2 py-1.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>
          ) : (
            <button
              onClick={() => handleCollectionClick(c)}
              onContextMenu={(e) => {
                e.preventDefault();
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

          {contextMenu?.id === c.id && (
            <div
              className="fixed z-50 min-w-[140px] rounded-lg border border-bg-border bg-bg-primary py-1 shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={() => {
                  setRenamingId(c.id);
                  setRenameValue(c.name);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              >
                <Pencil size={14} />
                {t("renameCollection")}
              </button>
              <button
                onClick={() => handleDeleteCollection(c.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-accent/10"
              >
                <Trash2 size={14} />
                {t("deleteCollection")}
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
