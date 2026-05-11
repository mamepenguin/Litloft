"use client";

import { useState } from "react";
import { ArrowDownUp, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SortField, SortOrder } from "@/types";

interface SortOption {
  labelKey: string;
  sort: SortField;
  order: SortOrder;
}

const RELEVANCE_OPTION: SortOption = {
  labelKey: "relevance",
  sort: "relevance",
  order: "desc",
};

const baseSortOptions: SortOption[] = [
  { labelKey: "newestFirst", sort: "created_at", order: "desc" },
  { labelKey: "oldestFirst", sort: "created_at", order: "asc" },
  { labelKey: "titleAZ", sort: "title", order: "asc" },
  { labelKey: "titleZA", sort: "title", order: "desc" },
  { labelKey: "sizeLargest", sort: "file_size", order: "desc" },
  { labelKey: "sizeSmallest", sort: "file_size", order: "asc" },
  { labelKey: "likesmost", sort: "likes", order: "desc" },
  { labelKey: "likesleast", sort: "likes", order: "asc" },
];

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

  const sortOptions: SortOption[] = allowRelevance
    ? [RELEVANCE_OPTION, ...baseSortOptions]
    : baseSortOptions;

  // Relevance is the search-mode default, so only treat it as
  // "active highlighting" when the toolbar is in non-search mode.
  const defaultIsRelevance = allowRelevance;
  const isDefaultActive = defaultIsRelevance
    ? sort === "relevance" && order === "desc"
    : sort === "created_at" && order === "desc";
  const isActive = !isDefaultActive;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className={`flex items-center gap-1.5 rounded-lg p-2 text-sm transition-colors ${
          isActive
            ? "bg-bg-card text-text-primary"
            : "text-text-muted hover:text-text-primary"
        }`}
        aria-label={t("label")}
      >
        <ArrowDownUp size={16} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-none sm:min-w-[180px] sm:overflow-visible sm:origin-top-right">
          {sortOptions.map((opt) => {
            const selected = opt.sort === sort && opt.order === order;
            return (
              <button
                key={`${opt.sort}-${opt.order}`}
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
