"use client";

import { useEffect, useRef, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";
import { Button } from "@/components/Button";

interface NameInputDialogProps {
  open: boolean;
  /** Dialog title shown at the top. */
  title: string;
  /** Optional input placeholder. */
  placeholder?: string;
  /** Optional submit-button label (defaults to common.create). */
  submitLabel?: string;
  /** Optional initial value (typically empty). */
  initialValue?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NameInputDialog({
  open,
  title,
  placeholder,
  submitLabel,
  initialValue = "",
  onSubmit,
  onCancel,
}: NameInputDialogProps) {
  const tc = useTranslations("common");
  const [name, setName] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialValue);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, initialValue]);

  // `editingOnly: false` is load-bearing: the dialog focuses its own
  // field, and the provider counts a focused input as "editing", where
  // the flag's default ("only when nothing is being edited") means the
  // shortcut never fires. Escape looked bound and did nothing.
  useShortcuts(
    "name-input-dialog",
    "Dialog",
    [{ key: "escape", label: "Cancel", editingOnly: false, handler: onCancel, hidden: true }],
    open,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
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
            <FolderPlus size={18} />
            {title}
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
            placeholder={placeholder}
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              {tc("cancel")}
            </button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={!name.trim()}
            >
              {submitLabel ?? tc("create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
