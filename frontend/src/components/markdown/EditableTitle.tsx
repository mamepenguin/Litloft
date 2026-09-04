"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";

/**
 * Click-to-edit chrome title. Mirrors the legacy standalone-mode
 * `TitleField` (knowledge addon Editor.tsx) but stays in core so the
 * chrome bar — which is the only Markdown editor surface going forward
 * — owns the rename affordance directly.
 *
 * Behaviour: click switches to a text input with the current value
 * selected; Enter / blur commits via `onRename`; Esc cancels. Input
 * passes the user's value verbatim to the host (matching the file
 * browser rename dialog) — no automatic `.md` suffix, no extension
 * normalisation. Errors surface as a small inline icon and keep the
 * input open so the user can correct.
 */
export function EditableTitle({
  title,
  onRename,
}: {
  title: string;
  onRename: (newFilename: string) => Promise<void>;
}): ReactElement {
  const t = useTranslations("inspector.rename");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setValue(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === title) {
      setEditing(false);
      setValue(title);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRename(trimmed);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={t("hint")}
        aria-label={t("hint")}
        className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm font-medium text-text-primary hover:bg-bg-elevated"
      >
        {title}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!saving) commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setEditing(false);
            setValue(title);
            setError(null);
          }
        }}
        disabled={saving}
        aria-label={t("label")}
        className="w-full min-w-0 rounded border border-bg-border bg-bg-primary px-2 py-0.5 text-sm font-medium text-text-primary focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
      />
      {error && (
        <span className="text-danger" title={error}>
          <AlertCircle size={14} />
        </span>
      )}
    </form>
  );
}
