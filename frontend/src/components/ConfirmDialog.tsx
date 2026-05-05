"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  note?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  note,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const tc = useTranslations("common");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  useShortcuts(
    "confirm-dialog",
    "Dialog",
    [{ key: "escape", label: "Cancel", handler: onCancel, hidden: true }],
    open,
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-bg-card p-6 shadow-2xl animate-fade-in-scale">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onCancel}
            className="rounded-xl p-1 text-text-muted hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-2 text-sm text-text-muted">{message}</p>
        {note && (
          <p className="mb-4 text-xs text-text-muted/70">{note}</p>
        )}
        {!note && <div className="mb-4" />}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-2xl bg-sand px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-sand-hover"
          >
            {tc("cancel")}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.97]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
