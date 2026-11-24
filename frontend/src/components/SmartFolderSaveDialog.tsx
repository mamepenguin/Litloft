"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useNameSubmission } from "@/hooks/useNameSubmission";
import { useImeKeyGuard } from "@/lib/ime";
import { focusEnd, isNameInUse } from "@/lib/nameInUse";
import { Button } from "@/components/Button";

interface SmartFolderSaveDialogProps {
  open: boolean;
  mode?: "save" | "rename";
  initialName?: string;
  description?: string;
  onSubmit: (name: string) => Promise<void> | void;
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
  const ime = useImeKeyGuard();
  const inputRef = useRef<HTMLInputElement>(null);
  const lineId = useId();
  const submission = useNameSubmission();
  const { inUse: nameInUse, busy: nameBusy } = submission;
  const clearNameInUse = submission.clear;
  const beginName = submission.begin;
  const settleName = submission.settle;
  const rejectName = submission.reject;
  const resetName = submission.reset;
  const isNameBusy = submission.isBusy;
  const isNameRejected = submission.isRejected;

  useEffect(() => {
    if (open) {
      setName(initialName);
      resetName();
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [open, initialName, resetName]);

  useEffect(() => {
    if (nameInUse) focusEnd(inputRef.current);
  }, [nameInUse]);

  const cancel = useCallback(() => {
    if (isNameBusy()) return;
    onCancel();
  }, [onCancel, isNameBusy]);

  // `editingOnly: false` is load-bearing: the dialog focuses its own
  // field, and the provider counts a focused input as "editing", where
  // the flag's default ("only when nothing is being edited") means the
  // shortcut never fires.
  useShortcuts(
    "smart-folder-save-dialog",
    "Dialog",
    [{ key: "escape", label: "Cancel", editingOnly: false, handler: cancel, hidden: true }],
    open,
  );

  if (!open) return null;

  const trimmed = name.trim();
  const canSubmit =
    trimmed.length > 0 && (mode === "save" || trimmed !== initialName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isNameBusy() || isNameRejected(trimmed)) return;
    beginName();
    try {
      await onSubmit(trimmed);
    } catch (error) {
      if (isNameInUse(error)) rejectName(trimmed);
    } finally {
      settleName();
    }
  }

  const title = mode === "rename" ? t("renameTitle") : t("saveTitle");
  const submitLabel = mode === "rename" ? tc("change") : t("saveAction");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={cancel}
      />
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-bg-card p-6 shadow-lg animate-fade-in-scale">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Star size={18} />
            {title}
          </h2>
          <button
            type="button"
            onClick={cancel}
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
          <div className="mb-6">
            <input
              ref={inputRef}
              type="text"
              value={name}
              readOnly={nameBusy}
              aria-invalid={nameInUse ? true : undefined}
              aria-describedby={nameInUse ? lineId : undefined}
              onChange={(e) => {
                setName(e.target.value);
                clearNameInUse();
              }}
              onBlur={() => {
                if (nameBusy) return;
                if (nameInUse) focusEnd(inputRef.current);
              }}
              onCompositionEnd={ime.onCompositionEnd}
              onKeyDown={(e) => {
                // Cancelling the keydown is what stops the form's implicit submission.
                if (e.key === "Enter" && ime.isImeKeystroke(e)) e.preventDefault();
              }}
              placeholder={t("namePlaceholder")}
              className={`w-full rounded-2xl border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none ${
                nameInUse
                  ? "border-danger focus:border-danger"
                  : "border-bg-border focus:border-focus-ring"
              }`}
            />
            {nameInUse && (
              <span id={lineId} className="mt-1 block text-xs text-danger">
                {tc("nameInUse")}
              </span>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={cancel}
              className="rounded-2xl bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              {tc("cancel")}
            </button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={!canSubmit}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
