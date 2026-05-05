"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, FileText, Loader2, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShortcuts } from "@/hooks/useShortcuts";

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

  useShortcuts(
    "batch-rename-dialog",
    "Dialog",
    [{ key: "escape", label: "Cancel", handler: onCancel, hidden: true }],
    open,
  );

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

  const modes: { key: RenameMode; label: string }[] = [
    { key: "template", label: t("modeTemplate") },
    { key: "regex", label: t("modeRegex") },
    { key: "prefix_suffix", label: t("modePrefixSuffix") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      <div className="relative mx-0 flex w-full max-w-2xl flex-col rounded-t-2xl bg-bg-card shadow-[0_-8px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.06] animate-fade-in-scale sm:mx-4 sm:rounded-2xl sm:shadow-[0_8px_40px_rgba(0,0,0,0.5)] max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.04] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
              <Pencil size={16} className="text-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {t("title")}
              </h2>
              <p className="text-xs text-text-muted">
                {files.length} {files.length === 1 ? "file" : "files"}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Mode selector - segmented control */}
          <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.04]">
            {modes.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  mode === m.key
                    ? "bg-accent text-white shadow-sm"
                    : "text-text-muted hover:bg-white/[0.04] hover:text-text-primary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="mt-5 rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/[0.04]">
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

          {/* Preview */}
          <PreviewList preview={preview} t={t} changedCount={changedCount} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-4">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : (
            <p className="text-xs text-text-muted">
              {changedCount > 0
                ? `${changedCount} / ${preview.length}`
                : "\u00A0"}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
            >
              {tc("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={changedCount === 0 || submitting || !!regexError}
              className="flex items-center gap-2 rounded-2xl bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-accent-hover active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {t("execute")}
            </button>
          </div>
        </div>
      </div>
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
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          {t("template")}
        </label>
        <input
          type="text"
          value={template}
          onChange={(e) => onTemplateChange(e.target.value)}
          className="w-full rounded-lg border border-white/[0.06] bg-bg-primary px-3 py-2.5 font-mono text-sm text-text-primary outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
        />
        <p className="mt-1.5 text-xs text-text-muted/70">{t("templateHelp")}</p>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-text-primary">
            {t("startNumber")}
          </label>
          <input
            type="number"
            value={startNumber}
            onChange={(e) => onStartNumberChange(Number(e.target.value))}
            min={0}
            className="w-full rounded-lg border border-white/[0.06] bg-bg-primary px-3 py-2.5 text-sm tabular-nums text-text-primary outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-text-primary">
            {t("zeroPad")}
          </label>
          <input
            type="number"
            value={zeroPad}
            onChange={(e) => onZeroPadChange(Number(e.target.value))}
            min={1}
            max={10}
            className="w-full rounded-lg border border-white/[0.06] bg-bg-primary px-3 py-2.5 text-sm tabular-nums text-text-primary outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
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
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          {t("searchPattern")}
        </label>
        <input
          type="text"
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value)}
          className={`w-full rounded-lg border bg-bg-primary px-3 py-2.5 font-mono text-sm text-text-primary outline-none transition-colors focus:ring-1 ${
            regexError
              ? "border-danger/60 focus:border-danger/80 focus:ring-danger/25"
              : "border-white/[0.06] focus:border-accent/50 focus:ring-accent/25"
          }`}
        />
        {regexError && (
          <p className="mt-1.5 text-xs text-danger">{regexError}</p>
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          {t("replaceWith")}
        </label>
        <input
          type="text"
          value={replacement}
          onChange={(e) => onReplacementChange(e.target.value)}
          className="w-full rounded-lg border border-white/[0.06] bg-bg-primary px-3 py-2.5 font-mono text-sm text-text-primary outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
        />
        <p className="mt-1.5 text-xs text-text-muted/70">{t("regexHelp")}</p>
      </div>
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
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          {t("modePrefixSuffix")}
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => onActionChange(a.key)}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                action === a.key
                  ? "bg-accent/15 text-accent ring-1 ring-accent/25"
                  : "bg-bg-primary text-text-muted ring-1 ring-white/[0.04] hover:bg-white/[0.04] hover:text-text-primary"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          {t("value")}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full rounded-lg border border-white/[0.06] bg-bg-primary px-3 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
        />
      </div>
    </div>
  );
}

function PreviewList({
  preview,
  changedCount,
  t,
}: {
  preview: ReadonlyArray<{ oldName: string; newName: string; changed: boolean }>;
  changedCount: number;
  t: ReturnType<typeof useTranslations>;
}) {
  if (preview.length === 0) return null;

  const hasChanges = preview.some((r) => r.changed);

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <FileText size={14} className="text-text-muted" />
        <h3 className="text-sm font-medium text-text-primary">
          {t("preview")}
        </h3>
        {hasChanges && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold tabular-nums text-accent">
            {changedCount}
          </span>
        )}
      </div>

      {!hasChanges ? (
        <p className="rounded-xl bg-white/[0.02] py-6 text-center text-sm text-text-muted ring-1 ring-white/[0.04]">
          {t("noChanges")}
        </p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-xl ring-1 ring-white/[0.04]">
          {preview.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2 text-xs ${
                i % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent"
              } ${!item.changed ? "opacity-40" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate text-text-muted">
                {item.oldName}
              </span>
              <ArrowRight size={12} className="shrink-0 text-accent/50" />
              <span
                className={`min-w-0 flex-1 truncate ${
                  item.changed
                    ? "font-medium text-accent"
                    : "text-text-muted"
                }`}
              >
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
