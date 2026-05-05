"use client";

import { useEffect, useRef, useState } from "react";
import { Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";

interface SmartFolderSaveDialogProps {
  open: boolean;
  /** "save" | "rename" — controls dialog title only. */
  mode?: "save" | "rename";
  initialName?: string;
  description?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function SmartFolderSaveDialog({
  open,
  mode = "save",
  initialName = "",
  description,
  onSubmit,
  onCancel,
}: SmartFolderSaveDialogProps) {
  const t = useTranslations("smartFolder");
  const tc = useTranslations("common");
  const [name, setName] = useState(initialName);
  const [composing, setComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      // Defer focus to next tick so the input is mounted.
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [open, initialName]);

  useShortcuts(
    "smart-folder-save-dialog",
    "Dialog",
    [{ key: "escape", label: "Cancel", handler: onCancel, hidden: true }],
    open,
  );

  if (!open) return null;

  const trimmed = name.trim();
  const canSubmit =
    trimmed.length > 0 && (mode === "save" || trimmed !== initialName);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Skip Enter while IME composition is active (e.g. Japanese
    // conversion), otherwise the conversion-confirming Enter would
    // submit the form.
    if (composing) return;
    if (!canSubmit) return;
    onSubmit(trimmed);
  }

  const title = mode === "rename" ? t("renameTitle") : t("saveTitle");
  const submitLabel = mode === "rename" ? tc("change") : t("saveAction");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-bg-card p-6 shadow-2xl animate-fade-in-scale">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Star size={18} />
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-1 text-text-muted hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>
        {description && (
          <p className="mb-3 text-sm text-text-muted">{description}</p>
        )}
        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            {t("nameLabel")}
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            placeholder={t("namePlaceholder")}
            className="mb-6 w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
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
              disabled={!canSubmit}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
