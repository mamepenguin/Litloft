"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Library, ListFilter, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useShortcuts } from "@/hooks/useShortcuts";
import type { TargetRow } from "./TargetMenu";
import { RetryButton } from "./RetryButton";

interface ManageTargetsDialogProps {
  open: boolean;
  /** The rows of every list that loaded, in the menu's order. */
  rows: readonly TargetRow[];
  saved: string[] | null;
  /** A list is still loading, so no toggle may write a partial set. */
  pending: boolean;
  failed: boolean;
  onShownChange: (ids: string[]) => void;
  onRetry: () => void;
  onClose: () => void;
}

export function ManageTargetsDialog({
  open,
  rows,
  saved,
  pending,
  failed,
  onShownChange,
  onRetry,
  onClose,
}: ManageTargetsDialogProps) {
  const t = useTranslations("appShell");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    searchRef.current?.focus();
  }, [open]);

  useShortcuts(
    "manage-targets-dialog",
    t("manage"),
    [{ key: "escape", label: tc("close"), editingOnly: false, handler: onClose, hidden: true }],
    open,
  );

  const checked = useMemo(() => {
    const usableIds = rows.filter((row) => row.usable).map((row) => row.targetId);
    const usableSet = new Set(usableIds);
    const base = saved === null ? usableIds : saved.filter((id) => usableSet.has(id));
    return new Set(base);
  }, [rows, saved]);

  if (!open) return null;

  const needle = query.trim().toLocaleLowerCase();
  const visible = needle
    ? rows.filter((row) => row.name.toLocaleLowerCase().includes(needle))
    : rows;

  function toggle(row: TargetRow) {
    if (!row.usable || pending) return;
    const next = new Set(checked);
    if (next.has(row.targetId)) next.delete(row.targetId);
    else next.add(row.targetId);
    onShownChange([...next]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-targets-title"
        className="relative mx-4 flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-bg-card p-6 shadow-lg animate-fade-in-scale"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="manage-targets-title" className="text-lg font-semibold text-text-primary">
            {t("manageTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1 text-text-muted hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative mb-3">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchTargets")}
            aria-label={t("searchTargets")}
            className="w-full rounded-2xl border border-bg-border bg-bg-elevated py-2 pl-9 pr-3 text-sm text-text-primary outline-none focus:border-focus-ring"
          />
        </div>

        {failed ? (
          <RetryButton onRetry={onRetry} />
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((row) => {
              const Icon = row.kind === "collection" ? Library : ListFilter;
              return (
                <li key={row.targetId}>
                  <label className="flex items-start gap-2 rounded-xl px-2 py-2 text-sm text-text-primary hover:bg-bg-elevated">
                    <input
                      type="checkbox"
                      checked={row.usable && checked.has(row.targetId)}
                      disabled={pending || !row.usable}
                      onChange={() => toggle(row)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent disabled:cursor-not-allowed"
                    />
                    <Icon
                      size={14}
                      aria-hidden="true"
                      className="mt-0.5 flex-shrink-0 self-start text-text-muted"
                    />
                    <span className={row.usable ? undefined : "text-warm-silver"}>
                      {row.name}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("done")}
          </button>
        </div>
      </div>
    </div>
  );
}
