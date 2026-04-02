"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { batchRename } from "@/lib/api";
import {
  computeNewFilenames,
  isValidRegex,
  type PrefixSuffixAction,
  type RenamePreviewFile,
} from "@/lib/renamePreview";

type RenameMode = "template" | "regex" | "prefix_suffix";

interface BatchRenameDialogProps {
  open: boolean;
  files: ReadonlyArray<RenamePreviewFile>;
  onComplete: () => void;
  onCancel: () => void;
}

export function BatchRenameDialog({
  open,
  files,
  onComplete,
  onCancel,
}: BatchRenameDialogProps) {
  const t = useTranslations("batchRename");
  const tc = useTranslations("common");

  const [mode, setMode] = useState<RenameMode>("template");
  const [template, setTemplate] = useState("{original}_{n}");
  const [startNumber, setStartNumber] = useState(1);
  const [zeroPad, setZeroPad] = useState(3);
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");
  const [action, setAction] = useState<PrefixSuffixAction>("add_prefix");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  const regexError = useMemo(() => {
    if (mode !== "regex" || !pattern) return "";
    return isValidRegex(pattern) ? "" : t("invalidRegex");
  }, [mode, pattern, t]);

  const preview = useMemo(() => {
    if (mode === "regex" && regexError) return [];
    return computeNewFilenames(files, mode, {
      template,
      startNumber,
      zeroPad,
      pattern,
      replacement,
      action,
      value,
    });
  }, [files, mode, template, startNumber, zeroPad, pattern, replacement, action, value, regexError]);

  const changedCount = useMemo(
    () => preview.filter((r) => r.changed).length,
    [preview]
  );

  const handleSubmit = useCallback(async () => {
    if (changedCount === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const body = buildRequestBody(
        files.map((f) => f.id),
        mode,
        { template, startNumber, zeroPad, pattern, replacement, action, value }
      );
      await batchRename(body);
      onComplete();
    } catch {
      setError(t("failed"));
    } finally {
      setSubmitting(false);
    }
  }, [changedCount, files, mode, template, startNumber, zeroPad, pattern, replacement, action, value, onComplete, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative mx-4 flex w-full max-w-2xl flex-col rounded-xl bg-bg-card p-6 shadow-2xl animate-fade-in-scale max-h-[85vh]">
        <DialogHeader title={t("title")} onClose={onCancel} closeLabel={tc("close")} />

        <ModeSelector mode={mode} onModeChange={setMode} t={t} />

        <div className="mt-4">
          {mode === "template" && (
            <TemplateFields
              template={template}
              startNumber={startNumber}
              zeroPad={zeroPad}
              onTemplateChange={setTemplate}
              onStartNumberChange={setStartNumber}
              onZeroPadChange={setZeroPad}
              t={t}
            />
          )}
          {mode === "regex" && (
            <RegexFields
              pattern={pattern}
              replacement={replacement}
              regexError={regexError}
              onPatternChange={setPattern}
              onReplacementChange={setReplacement}
              t={t}
            />
          )}
          {mode === "prefix_suffix" && (
            <PrefixSuffixFields
              action={action}
              value={value}
              onActionChange={setAction}
              onValueChange={setValue}
              t={t}
            />
          )}
        </div>

        <PreviewList preview={preview} t={t} />

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            {tc("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={changedCount === 0 || submitting || !!regexError}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
          >
            {t("execute")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogHeader({
  title,
  onClose,
  closeLabel,
}: {
  title: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Pencil size={18} />
        {title}
      </h2>
      <button
        onClick={onClose}
        className="rounded-lg p-1 text-text-muted hover:text-text-primary"
        aria-label={closeLabel}
      >
        <X size={18} />
      </button>
    </div>
  );
}

function ModeSelector({
  mode,
  onModeChange,
  t,
}: {
  mode: RenameMode;
  onModeChange: (m: RenameMode) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const modes: { key: RenameMode; label: string }[] = [
    { key: "template", label: t("modeTemplate") },
    { key: "regex", label: t("modeRegex") },
    { key: "prefix_suffix", label: t("modePrefixSuffix") },
  ];

  return (
    <div className="mt-4 flex gap-1 rounded-lg bg-bg-elevated p-1">
      {modes.map((m) => (
        <button
          key={m.key}
          onClick={() => onModeChange(m.key)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
            mode === m.key
              ? "bg-accent text-white"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function TemplateFields({
  template,
  startNumber,
  zeroPad,
  onTemplateChange,
  onStartNumberChange,
  onZeroPadChange,
  t,
}: {
  template: string;
  startNumber: number;
  zeroPad: number;
  onTemplateChange: (v: string) => void;
  onStartNumberChange: (v: number) => void;
  onZeroPadChange: (v: number) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm text-text-muted">
          {t("template")}
        </label>
        <input
          type="text"
          value={template}
          onChange={(e) => onTemplateChange(e.target.value)}
          className="w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-text-muted">{t("templateHelp")}</p>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm text-text-muted">
            {t("startNumber")}
          </label>
          <input
            type="number"
            value={startNumber}
            onChange={(e) => onStartNumberChange(Number(e.target.value))}
            min={0}
            className="w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm text-text-muted">
            {t("zeroPad")}
          </label>
          <input
            type="number"
            value={zeroPad}
            onChange={(e) => onZeroPadChange(Number(e.target.value))}
            min={1}
            max={10}
            className="w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>
      </div>
    </div>
  );
}

function RegexFields({
  pattern,
  replacement,
  regexError,
  onPatternChange,
  onReplacementChange,
  t,
}: {
  pattern: string;
  replacement: string;
  regexError: string;
  onPatternChange: (v: string) => void;
  onReplacementChange: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-text-muted">
          {t("searchPattern")}
        </span>
        <input
          type="text"
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value)}
          className={`w-full rounded-lg border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent ${
            regexError ? "border-red-400" : "border-bg-border"
          }`}
        />
        {regexError && (
          <p className="mt-1 text-xs text-red-400">{regexError}</p>
        )}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-text-muted">
          {t("replaceWith")}
        </span>
        <input
          type="text"
          value={replacement}
          onChange={(e) => onReplacementChange(e.target.value)}
          className="w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-text-muted">{t("regexHelp")}</p>
      </label>
    </div>
  );
}

function PrefixSuffixFields({
  action,
  value,
  onActionChange,
  onValueChange,
  t,
}: {
  action: PrefixSuffixAction;
  value: string;
  onActionChange: (v: PrefixSuffixAction) => void;
  onValueChange: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const actions: { key: PrefixSuffixAction; label: string }[] = [
    { key: "add_prefix", label: t("actionAddPrefix") },
    { key: "add_suffix", label: t("actionAddSuffix") },
    { key: "remove_prefix", label: t("actionRemovePrefix") },
    { key: "remove_suffix", label: t("actionRemoveSuffix") },
  ];

  return (
    <div className="space-y-3">
      <div>
        <select
          value={action}
          onChange={(e) => onActionChange(e.target.value as PrefixSuffixAction)}
          className="w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        >
          {actions.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm text-text-muted">
          {t("value")}
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}

function PreviewList({
  preview,
  t,
}: {
  preview: ReadonlyArray<{ oldName: string; newName: string; changed: boolean }>;
  t: ReturnType<typeof useTranslations>;
}) {
  if (preview.length === 0) return null;

  const hasChanges = preview.some((r) => r.changed);

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-medium text-text-muted">
        {t("preview")}
      </h3>
      {!hasChanges ? (
        <p className="text-sm text-text-muted">{t("noChanges")}</p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-bg-border bg-bg-elevated p-2 space-y-1">
          {preview.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs leading-relaxed"
            >
              <span className={item.changed ? "text-text-primary" : "text-text-muted"}>
                {item.oldName}
              </span>
              <ArrowRight size={12} className="shrink-0 text-text-muted" />
              <span className={item.changed ? "text-accent font-medium" : "text-text-muted"}>
                {item.newName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildRequestBody(
  ids: ReadonlyArray<string>,
  mode: RenameMode,
  params: {
    template: string;
    startNumber: number;
    zeroPad: number;
    pattern: string;
    replacement: string;
    action: PrefixSuffixAction;
    value: string;
  }
) {
  const base = { ids: [...ids], mode };

  if (mode === "template") {
    return {
      ...base,
      template: params.template,
      start_number: params.startNumber,
      zero_pad: params.zeroPad,
    };
  }
  if (mode === "regex") {
    return {
      ...base,
      pattern: params.pattern,
      replacement: params.replacement,
    };
  }
  return {
    ...base,
    action: params.action,
    value: params.value,
  };
}
