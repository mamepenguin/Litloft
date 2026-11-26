"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Rich content under the message, for a confirmation that needs more than a line. */
  body?: ReactNode;
  /** The confirm control's tone; the default is the screen's accent fill. */
  confirmTone?: "danger";
  confirmLabel?: string;
  note?: string;
  /** While busy, every way out is closed: confirm, cancel, the X, the backdrop and Escape. */
  busy?: boolean;
  progress?: string;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  body,
  confirmTone,
  confirmLabel = "OK",
  note,
  busy = false,
  progress,
  error,
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
    [
      {
        key: "escape",
        label: "Cancel",
        handler: () => {
          if (!busy) onCancel();
        },
        hidden: true,
      },
    ],
    open,
  );

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl bg-bg-card p-6 shadow-lg animate-fade-in-scale"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            onClick={() => {
              if (!busy) onCancel();
            }}
            disabled={busy}
            className="rounded-xl p-1 text-text-muted enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:text-warm-silver"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-2 text-sm text-text-muted">{message}</p>
        {body && <div className="mb-4">{body}</div>}
        {progress && (
          <p
            className="mb-2 flex items-center gap-2 break-words text-sm text-text-muted"
            role="status"
          >
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent"
              aria-hidden
            />
            {progress}
          </p>
        )}
        {error && <p className="mb-2 break-words text-sm text-danger">{error}</p>}
        {note && (
          <p className="mb-4 text-xs text-text-muted/70">{note}</p>
        )}
        {!note && !body && <div className="mb-4" />}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            ref={confirmRef}
            variant={confirmTone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
