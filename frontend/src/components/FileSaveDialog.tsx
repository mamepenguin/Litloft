"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { FolderPicker } from "./FolderPicker";

export interface FileSaveDialogProps {
  open: boolean;
  /** Dialog heading */
  title: string;
  drive: string;
  defaultFolder?: string;
  defaultFilename: string;
  /** Label for the confirm button when not submitting. Defaults to common.save. */
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

  // Focus filename and select stem (without extension).
  useEffect(() => {
    if (!open) return;
    const el = filenameRef.current;
    if (!el) return;
    el.focus();
    const dotIdx = el.value.lastIndexOf(".");
    if (dotIdx > 0) el.setSelectionRange(0, dotIdx);
    else el.select();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

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
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl bg-bg-card p-5 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={14} />
          </button>
        </div>

        {/* Folder */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t("folder")}</span>
          <FolderPicker drive={drive} value={folder} onChange={setFolder} />
        </div>

        {/* Filename */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t("filename")}</span>
          <input
            ref={filenameRef}
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !disabled) void handleSubmit();
            }}
            className="w-full rounded-lg border border-bg-border bg-bg-primary px-3 py-2 text-sm font-mono text-text-primary focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-bg-elevated disabled:opacity-50"
          >
            {tc("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={disabled}
            className="rounded-lg bg-accent-cta px-3 py-1.5 text-sm font-medium text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t("submitting") : (confirmLabel ?? tc("save"))}
          </button>
        </div>
      </div>
    </div>
  );
}
