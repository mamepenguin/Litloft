"use client";

import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";

interface MetadataEditorProps {
  title: string;
  description: string;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * The title / description form the `[...]` menu's *Edit* opens.
 *
 * Replaces the meta block in place rather than opening a dialog: the
 * two fields are the meta block, so editing them somewhere else would
 * mean showing the same two values twice.
 */
export function MetadataEditor({
  title,
  description,
  saving,
  onTitleChange,
  onDescriptionChange,
  onSave,
  onCancel,
}: MetadataEditorProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="w-full rounded-2xl bg-bg-card px-3 py-2 text-lg font-bold text-text-primary outline-none focus:ring-2 focus:ring-focus-ring"
      />
      <textarea
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder={t("addDescription")}
        rows={3}
        className="w-full rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-focus-ring"
      />
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1 rounded-2xl bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:bg-sand disabled:text-warm-silver disabled:cursor-not-allowed"
        >
          <Check size={14} />
          {tc("save")}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 rounded-lg bg-bg-card px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
        >
          <X size={14} />
          {tc("cancel")}
        </button>
      </div>
    </div>
  );
}
