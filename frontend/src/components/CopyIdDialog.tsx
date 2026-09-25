"use client";

import { useEffect, useRef } from "react";
import { Hash, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";

interface CopyIdDialogProps {
  open: boolean;
  fileId: string;
  onClose: () => void;
}

export function CopyIdDialog({ open, fileId, onClose }: CopyIdDialogProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [open]);

  // The field holds focus, which the provider counts as editing.
  useShortcuts(
    "copy-id-dialog",
    "Dialog",
    [{ key: "escape", label: "Close", editingOnly: false, handler: onClose, hidden: true }],
    open,
  );

  if (!open) return null;

  const selectAll = (e: React.SyntheticEvent<HTMLInputElement>) =>
    e.currentTarget.setSelectionRange(0, e.currentTarget.value.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-id-dialog-title"
        className="relative mx-4 w-full max-w-md rounded-2xl bg-bg-card p-6 shadow-lg animate-fade-in-scale"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="copy-id-dialog-title"
            className="flex items-center gap-2 text-lg font-semibold text-text-primary"
          >
            <Hash size={18} />
            {t("copyIdTitle")}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-sm text-text-muted">{t("copyIdManual")}</p>
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={fileId}
          aria-label={t("copyIdTitle")}
          onFocus={selectAll}
          onClick={selectAll}
          className="mb-6 w-full rounded-2xl border border-bg-border bg-bg-elevated px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-focus-ring"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            {tc("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
