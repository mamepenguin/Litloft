"use client";

import { useTranslations } from "next-intl";

import type { TreeTypeFilter } from "@/types";

interface TypeFilterChipsProps {
  filter: TreeTypeFilter | null;
  onChange: (filter: TreeTypeFilter | null) => void;
}

const OPTIONS: Array<{ value: TreeTypeFilter | null; key: string }> = [
  { value: null, key: "filterAll" },
  { value: "markdown", key: "filterMarkdown" },
  { value: "video", key: "filterVideo" },
  { value: "image", key: "filterImage" },
  { value: "pdf", key: "filterPdf" },
];

export function TypeFilterChips({ filter, onChange }: TypeFilterChipsProps) {
  const t = useTranslations("tree");
  return (
    <div className="flex flex-wrap gap-1 px-2 py-2" role="radiogroup" aria-label={t("filterAll")}>
      {OPTIONS.map((opt) => {
        const active = opt.value === filter;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-2xl px-2.5 py-1 text-xs transition-colors ${
              active
                ? "bg-accent text-white"
                : "bg-bg-elevated text-text-muted hover:text-text-primary"
            }`}
          >
            {t(opt.key)}
          </button>
        );
      })}
    </div>
  );
}
