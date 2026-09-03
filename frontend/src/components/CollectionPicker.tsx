"use client";

import { useEffect, useState } from "react";
import { Library, Plus, X } from "lucide-react";

import { useTranslations } from "next-intl";
import { addCollectionItems, createCollection, getCollections } from "@/lib/api";
import type { CollectionSummary } from "@/types";

interface CollectionPickerProps {
  open: boolean;
  drive: string;
  fileIds: string[];
  onClose: () => void;
}

export function CollectionPicker({ open, drive, fileIds, onClose }: CollectionPickerProps) {
  const t = useTranslations("collection");
  const tc = useTranslations("common");
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (open) {
      getCollections(drive).then(setCollections).catch(() => setCollections([]));
      setCreating(false);
      setNewName("");
    }
  }, [open, drive]);

  if (!open) return null;

  async function handleAdd(collectionId: string) {
    if (adding) return;
    setAdding(true);
    try {
      await addCollectionItems(drive, collectionId, fileIds);
      onClose();
    } catch {
      // error
    }
    setAdding(false);
  }

  async function handleCreateAndAdd() {
    if (!newName.trim() || adding) return;
    setAdding(true);
    try {
      const c = await createCollection(drive, newName.trim());
      await addCollectionItems(drive, c.id, fileIds);
      onClose();
    } catch {
      // error
    }
    setAdding(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-bg-border bg-bg-primary p-4 shadow-lg animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{t("addToCollection")}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 max-h-[300px] overflow-y-auto">
          {collections.length === 0 && !creating && (
            <p className="py-4 text-center text-sm text-text-muted">
              {t("noCollections")}
            </p>
          )}
          {collections.map((c) => (
            <button
              key={c.id}
              onClick={() => handleAdd(c.id)}
              disabled={adding}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-50"
            >
              <Library size={16} />
              <span className="flex-1 truncate text-left">{c.name}</span>
              <span className="text-xs opacity-60">{c.item_count}</span>
            </button>
          ))}
        </div>

        {creating ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateAndAdd();
                if (e.key === "Escape") { setCreating(false); setNewName(""); }
              }}
              placeholder={t("newCollectionPlaceholder")}
              className="min-w-0 flex-1 rounded-2xl bg-bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring"
            />
            <button
              onClick={handleCreateAndAdd}
              disabled={adding || !newName.trim()}
              className="rounded-2xl bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover disabled:bg-sand disabled:text-warm-silver disabled:cursor-not-allowed"
            >
              {tc("create")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-bg-border px-3 py-2 text-sm text-text-muted transition-colors hover:border-warm-silver/60 hover:bg-bg-elevated hover:text-text-primary"
          >
            <Plus size={16} />
            {t("newCollection")}
          </button>
        )}
      </div>
    </div>
  );
}
