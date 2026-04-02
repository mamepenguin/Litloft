"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
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

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative mx-4 w-full max-w-md rounded-xl bg-bg-card p-6 shadow-2xl animate-fade-in-scale">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-text-muted hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-6 text-sm text-text-muted">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            {tc("cancel")}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80 active:scale-[0.97]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
