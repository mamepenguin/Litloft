"use client";

import { useEffect, useRef, useState } from "react";
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className={`flex items-center gap-1.5 rounded-md p-2 text-sm transition-colors ${
          isActive
            ? "bg-accent/20 text-accent"
            : "text-text-muted hover:text-text-primary"
        }`}
        aria-label={t("label")}
      >
        <ArrowDownUp size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-xl border border-bg-border bg-bg-primary py-1 shadow-xl animate-fade-in-scale origin-top-right">
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
                    ? "text-accent"
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
      )}
    </div>
  );
}
