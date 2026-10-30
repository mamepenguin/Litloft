"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";

/**
 * Passes the user's value verbatim to the host (matching the file browser
 * rename dialog) — no automatic `.md` suffix, no extension normalisation.
 *
 * With `fixedSuffix` the field holds the name without it, the suffix is
 * shown beside the field, and the name sent always ends in it.
 */
export function EditableTitle({
  title: fullTitle,
  onRename: renameFull,
  fixedSuffix,
}: {
  title: string;
  onRename: (newFilename: string) => Promise<void>;
  fixedSuffix?: string;
}): ReactElement {
  const suffix = fixedSuffix ?? "";
  const title = suffix ? fullTitle.slice(0, -suffix.length) : fullTitle;
  const onRename = (name: string) => renameFull(name + suffix);
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

  const suffixNode = suffix ? (
    <span className="shrink-0 text-sm font-medium text-text-primary">
      {suffix}
    </span>
  ) : null;

  if (!editing) {
    const button = (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={t("hint")}
        aria-label={t("hint")}
        // `flex-auto`, not `flex-1`: a basis of zero contributes nothing to
        // the row's base size, so nothing beside this ever has to give and
        // the filename is left whatever the rest did not take. With a fixed
        // suffix the wrapper takes that role and the name must not grow, or
        // the suffix is pushed to the far end of the row.
        className={`min-w-0 ${suffix ? "flex-initial" : "flex-auto"} truncate rounded px-1 py-0.5 text-left text-sm font-medium text-text-primary hover:bg-bg-elevated`}
      >
        {title}
      </button>
    );
    if (!suffixNode) return button;
    return (
      <span className="flex min-w-0 flex-auto items-center">
        {button}
        {suffixNode}
      </span>
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
      {suffixNode}
      {error && (
        <span className="text-danger" title={error}>
          <AlertCircle size={14} />
        </span>
      )}
    </form>
  );
}
