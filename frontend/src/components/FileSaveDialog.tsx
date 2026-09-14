"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { selectStem } from "@/lib/filename";
import { useImeKeyGuard } from "@/lib/ime";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import { FolderPicker } from "./FolderPicker";
import { Button } from "@/components/Button";

export interface FileSaveDialogProps {
  open: boolean;
  title: string;
  drive: string;
  defaultFolder?: string;
  defaultFilename: string;
  confirmLabel?: string;
  /** Receives cleaned values; throw an Error to show an inline error message. */
  onConfirm: (values: { folder: string; filename: string }) => Promise<void>;
  onCancel: () => void;
}

export function FileSaveDialog({
  open,
  title,
  drive,
  defaultFolder = "",
  defaultFilename,
  confirmLabel,
  onConfirm,
  onCancel,
}: FileSaveDialogProps) {
  const tc = useTranslations("common");
  const t = useTranslations("fileSaveDialog");
  const ime = useImeKeyGuard();

  const [folder, setFolder] = useState(defaultFolder);
  const [filename, setFilename] = useState(defaultFilename);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filenameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setFolder(defaultFolder);
    setFilename(defaultFilename);
    setSubmitting(false);
    setError(null);
  }, [open, defaultFolder, defaultFilename]);

  useEffect(() => {
    if (!open) return;
    const el = filenameRef.current;
    if (!el) return;
    selectStem(el);
  }, [open]);

  // `editingOnly: false` is load-bearing: the dialog
  // focuses its filename field on open, and the provider counts a
  // focused input as "editing", where the flag's default means the
  // shortcut does not fire.
  useShortcuts(
    "file-save-dialog",
    "Dialog",
    [
      {
        key: "escape",
        label: "Cancel",
        editingOnly: false,
        hidden: true,
        handler: onCancel,
      },
    ],
    open,
    OVERLAY_PRIORITY,
  );

  const hasTraversal =
    filename
      .trim()
      .split(/[\\/]/)
      .some((s) => s === ".." || s === ".") ||
    folder.split(/[\\/]/).some((s) => s === "..");
  const disabled = submitting || !filename.trim() || hasTraversal;

  const handleSubmit = useCallback(async () => {
    if (disabled) return;
    const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
    const cleanFilename = filename.trim();
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ folder: cleanFolder, filename: cleanFilename });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }, [disabled, folder, filename, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      <div className="relative mx-4 w-full max-w-md animate-fade-in-scale">
        <div className="space-y-4 rounded-xl border border-bg-border bg-bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-text-muted transition-colors hover:text-text-primary"
              aria-label={tc("close")}
            >
              <X size={16} />
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-text-muted">
              {t("folder")}
            </label>
            <FolderPicker drive={drive} value={folder} onChange={setFolder} />
          </div>

          <div>
            <label
              htmlFor="file-save-dialog-filename"
              className="mb-1.5 block text-xs text-text-muted"
            >
              {t("filename")}
            </label>
            <input
              id="file-save-dialog-filename"
              ref={filenameRef}
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onCompositionEnd={ime.onCompositionEnd}
              onKeyDown={(e) => {
                if (ime.isImeKeystroke(e)) return;
                if (e.key === "Enter" && !disabled) void handleSubmit();
              }}
              className="w-full rounded-2xl border border-bg-border bg-bg-primary px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-focus-ring focus:outline-none"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-2xl px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
            >
              {tc("cancel")}
            </button>
            <Button
              variant="primary"
              size="lg"
              type="button"
              onClick={() => void handleSubmit()}
              disabled={disabled}
            >
              {submitting ? t("submitting") : (confirmLabel ?? tc("save"))}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
