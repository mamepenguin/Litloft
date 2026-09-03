"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";
import { selectStem } from "@/lib/filename";

interface RenameDialogProps {
  open: boolean;
  currentName: string;
  onRename: (newName: string) => void;
  onCancel: () => void;
}

export function RenameDialog({
  open,
  currentName,
  onRename,
  onCancel,
}: RenameDialogProps) {
  const t = useTranslations("dialog");
  const tc = useTranslations("common");
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setTimeout(() => {
        const el = inputRef.current;
        if (el) selectStem(el);
      }, 0);
    }
  }, [open, currentName]);

  // `editingOnly: false` is load-bearing: the dialog focuses its own
  // field, and the provider counts a focused input as "editing", where
  // the flag's default ("only when nothing is being edited") means the
  // shortcut never fires. Escape looked bound and did nothing.
  useShortcuts(
    "rename-dialog",
    "Dialog",
    [{ key: "escape", label: "Cancel", editingOnly: false, handler: onCancel, hidden: true }],
    open,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== currentName) {
      onRename(trimmed);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-bg-card p-6 shadow-lg animate-fade-in-scale">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Pencil size={18} />
            {t("renameTitle")}
          </h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-text-muted hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-6 w-full rounded-2xl border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-focus-ring"
            placeholder={t("renamePlaceholder")}
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name.trim() === currentName}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:bg-sand disabled:text-warm-silver disabled:cursor-not-allowed"
            >
              {tc("change")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
