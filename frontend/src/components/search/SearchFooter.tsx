"use client";

import type { ReactElement } from "react";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

interface SearchFooterProps {
  semanticPending: boolean;
  legendOpen: boolean;
  onToggleLegend: () => void;
  onOpenShortcuts: () => void;
}

// Outside the scroll area on purpose: the search resolves in two stages,
// and a row inside the list would slide the results down the page every
// time the second one lands.
export function SearchFooter({
  semanticPending,
  legendOpen,
  onToggleLegend,
  onOpenShortcuts,
}: SearchFooterProps): ReactElement {
  const t = useTranslations("search");
  const tsc = useTranslations("shortcuts");

  return (
    <div className="flex items-center justify-between border-t border-bg-border px-4 py-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11"
        >
          <kbd className="rounded border border-bg-border px-1.5 py-0.5 font-sans text-[11px]">?</kbd>
          {tsc("title")}
        </button>
        <button
          type="button"
          onClick={onToggleLegend}
          aria-expanded={legendOpen}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11"
        >
          <Info size={13} className="shrink-0" />
          {t("badgeLegend")}
        </button>
      </div>
      {semanticPending ? (
        <span className="text-xs text-text-muted">{t("semanticPending")}</span>
      ) : (
        <span />
      )}
    </div>
  );
}
