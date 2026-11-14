"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Library, Plus, X } from "lucide-react";

import { useTranslations } from "next-intl";
import { addCollectionItems, createCollection, getCollections } from "@/lib/api";
import { useNameSubmission } from "@/hooks/useNameSubmission";
import { useImeKeyGuard } from "@/lib/ime";
import { focusEnd, isNameInUse } from "@/lib/nameInUse";
import type { CollectionSummary } from "@/types";
import { Button } from "@/components/Button";

interface CollectionPickerProps {
  open: boolean;
  drive: string;
  fileIds: string[];
  onClose: () => void;
}

export function CollectionPicker({ open, drive, fileIds, onClose }: CollectionPickerProps) {
  const t = useTranslations("collection");
  const tc = useTranslations("common");
  const ime = useImeKeyGuard();
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const createName = useNameSubmission();
  const { inUse: nameInUse, busy: nameBusy } = createName;
  const clearName = createName.clear;
  const beginName = createName.begin;
  const settleName = createName.settle;
  const rejectName = createName.reject;
  const resetName = createName.reset;
  const isNameBusy = createName.isBusy;
  const isNameRejected = createName.isRejected;
  const createInputRef = useRef<HTMLInputElement>(null);
  const lineId = useId();

  useEffect(() => {
    if (open) {
      getCollections(drive).then(setCollections).catch(() => setCollections([]));
      setCreating(false);
      setNewName("");
      resetName();
    }
  }, [open, drive, resetName]);

  useEffect(() => {
    if (nameInUse) focusEnd(createInputRef.current);
  }, [nameInUse]);

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
    if (adding) return;
    const name = newName.trim();
    if (!name) return;
    if (isNameBusy() || isNameRejected(name)) return;
    beginName();
    try {
      const c = await createCollection(drive, name);
      await addCollectionItems(drive, c.id, fileIds);
      onClose();
    } catch (e) {
      if (isNameInUse(e)) {
        rejectName(name);
        return;
      }
      // error
    } finally {
      settleName();
    }
  }

  function closeCreate() {
    setCreating(false);
    setNewName("");
    resetName();
  }

  function requestClose() {
    if (nameBusy) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={requestClose}>
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-bg-border bg-bg-primary p-4 shadow-lg animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{t("addToCollection")}</h3>
          <button onClick={requestClose} className="text-text-muted hover:text-text-primary">
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
          <div>
            <div className="flex items-center gap-2">
              <input
                ref={createInputRef}
                type="text"
                autoFocus
                value={newName}
                readOnly={nameBusy}
                aria-invalid={nameInUse ? true : undefined}
                aria-describedby={nameInUse ? lineId : undefined}
                onChange={(e) => {
                  setNewName(e.target.value);
                  clearName();
                }}
                onCompositionEnd={ime.onCompositionEnd}
                onBlur={() => {
                  if (nameBusy) return;
                  if (nameInUse) focusEnd(createInputRef.current);
                }}
                onKeyDown={(e) => {
                  if (ime.isImeKeystroke(e)) return;
                  if (e.key === "Enter") handleCreateAndAdd();
                  if (e.key === "Escape" && !nameBusy) closeCreate();
                }}
                placeholder={t("newCollectionPlaceholder")}
                className={`min-w-0 flex-1 rounded-2xl bg-bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 ${
                  nameInUse ? "ring-2 ring-danger focus:ring-danger" : "focus:ring-focus-ring"
                }`}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateAndAdd}
                disabled={adding || !newName.trim()}
              >
                {tc("create")}
              </Button>
            </div>
            {nameInUse && (
              <span id={lineId} className="mt-1 block text-xs text-danger">
                {tc("nameInUse")}
              </span>
            )}
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
