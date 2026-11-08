"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useShortcuts } from "@/hooks/useShortcuts";
import type { LoadState } from "./useLoad";
import type { SmartFolder } from "@/types/smartFolder";
import { RetryButton } from "./RetryButton";

interface ManageTargetsDialogProps {
  open: boolean;
  folders: LoadState<SmartFolder[]>;
  saved: string[] | null;
  isUsable: (folder: SmartFolder) => boolean;
  onShownChange: (ids: string[]) => void;
  onRetryFolders: () => void;
  onClose: () => void;
}

export function ManageTargetsDialog({
  open,
  folders,
  saved,
  isUsable,
  onShownChange,
  onRetryFolders,
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

  const list = folders.status === "loaded" ? folders.data : [];
  const checked = useMemo(() => {
    const usableIds = list.filter(isUsable).map((folder) => folder.id);
    const usableSet = new Set(usableIds);
    const base = saved === null ? usableIds : saved.filter((id) => usableSet.has(id));
    return new Set(base);
  }, [list, saved, isUsable]);

  if (!open) return null;

  const needle = query.trim().toLocaleLowerCase();
  const visible = needle
    ? list.filter((folder) => folder.name.toLocaleLowerCase().includes(needle))
    : list;

  function toggle(folder: SmartFolder) {
    if (!isUsable(folder)) return;
    const next = new Set(checked);
    if (next.has(folder.id)) next.delete(folder.id);
    else next.add(folder.id);
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
            {t("manage")}
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

        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchTargets")}
          aria-label={t("searchTargets")}
          className="mb-3 w-full rounded-2xl border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-focus-ring"
        />

        {folders.status === "failed" ? (
          <RetryButton onRetry={onRetryFolders} />
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((folder) => {
              const usable = isUsable(folder);
              return (
                <li key={folder.id}>
                  <label className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-text-primary hover:bg-bg-elevated">
                    <input
                      type="checkbox"
                      checked={usable && checked.has(folder.id)}
                      disabled={!usable}
                      onChange={() => toggle(folder)}
                      className="h-4 w-4 accent-accent disabled:cursor-not-allowed"
                    />
                    <span className={usable ? undefined : "text-warm-silver"}>
                      {folder.name}
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
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {t("done")}
          </button>
        </div>
      </div>
    </div>
  );
}
