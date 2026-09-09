"use client";

import { useState } from "react";
import { ArrowDownUp, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SortField, SortOrder } from "@/types";
import { isDefaultSort, sortOptionsFor, type SortOption } from "@/components/sortOptions";
import { DismissScrim } from "@/components/DismissScrim";

interface SortButtonProps {
  sort: SortField;
  order: SortOrder;
  onChange: (sort: SortField, order: SortOrder) => void;
  /**
   * When true, expose the search-only "relevance" option at the top
   * of the menu. Kept opt-in because relevance is meaningless outside
   * a search query.
   */
  allowRelevance?: boolean;
}

export function SortButton({ sort, order, onChange, allowRelevance }: SortButtonProps) {
  const t = useTranslations("sort");
  const [open, setOpen] = useState(false);

  const sortOptions: SortOption[] = sortOptionsFor(allowRelevance);
  const isActive = !isDefaultSort(sort, order, allowRelevance);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className={`flex items-center gap-1.5 rounded-lg p-2 text-sm transition-colors ${
          isActive
            ? "bg-bg-card text-text-primary"
            : "text-text-muted hover:text-text-primary"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("label")}
      >
        <ArrowDownUp size={16} />
      </button>

      {open && (
        <>
          <DismissScrim onDismiss={() => setOpen(false)} />
          <div role="menu" aria-label={t("label")} className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-none sm:min-w-[180px] sm:overflow-visible sm:origin-top-right">
          {sortOptions.map((opt) => {
            const selected = opt.sort === sort && opt.order === order;
            return (
              <button
                key={`${opt.sort}-${opt.order}`}
                // The same contract `MenuRadioGroup` gives the identical
                // rows on the toolbar: a tick drawn as an unlabelled
                // `<svg>` says which one is on only to people who can see
                // it, and a `role="menu"` publishes nothing but
                // menuitem / group / separator children.
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(opt.sort, opt.order);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "bg-bg-elevated text-text-primary font-medium"
                    : "text-text-primary hover:bg-bg-elevated"
                }`}
              >
                <span className="w-4 flex-shrink-0">
                  {selected && <Check size={14} />}
                </span>
                {t(opt.labelKey)}
              </button>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
}
