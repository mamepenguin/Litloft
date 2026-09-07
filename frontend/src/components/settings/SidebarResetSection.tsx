"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PreferenceRow } from "./PreferenceRow";

/**
 * Resets the user-customised sidebar ordering (section order, item order, and
 * tag sort mode) back to defaults. Only the `sidebar:order:*` and
 * `sidebar:sort:*` localStorage keys are removed; `sidebar:section:*:collapsed`
 * (a separate collapse-state feature) is intentionally preserved.
 *
 * Global personal preferences are consolidated under /settings
 * (hako CNX6n2jJDWKUBYM1ldBFV); spec §5.3 calls for a minimal v1 entry.
 */

const RESET_PREFIXES = ["sidebar:order:", "sidebar:sort:"] as const;

function clearSidebarOrderKeys(): void {
  if (typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    // Enumerate via the canonical Storage API (length + key(i)) rather than
    // Object.keys(localStorage): the latter is not a reliable way to iterate
    // a Storage object. Collect first, then remove (removing by index while
    // iterating would shift subsequent indices).
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (key && RESET_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) ls.removeItem(key);
  } catch {
    // localStorage unavailable — nothing to reset, fail silently.
  }
}

export function SidebarResetSection() {
  const t = useTranslations("settings.sidebarReset");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const handleConfirm = () => {
    clearSidebarOrderKeys();
    setConfirming(false);
    setDone(true);
  };

  return (
    // The sentence that used to sit above the button is gone. Its only
    // content was "your custom ordering goes back to the default", the
    // confirmation dialog says exactly that before anything happens, and
    // the consequence is one undoable-by-hand reorder. A row has no place
    // for prose, and prose nobody needs to read is worse in a row than in
    // a card.
    <PreferenceRow id="settings-sidebar-reset" label={t("title")}>
      <button
        type="button"
        onClick={() => {
          setDone(false);
          setConfirming(true);
        }}
        className="flex items-center gap-2 rounded-2xl border border-bg-border bg-bg-card px-4 py-2 text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
      >
        <RotateCcw size={16} aria-hidden="true" />
        <span>{t("button")}</span>
      </button>
      {done && (
        <span role="status" className="text-sm text-text-muted">
          {t("done")}
        </span>
      )}

      <ConfirmDialog
        open={confirming}
        title={t("confirmTitle")}
        message={t("confirmBody")}
        confirmLabel={t("button")}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </PreferenceRow>
  );
}
