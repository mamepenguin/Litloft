"use client";

import { Columns, Eye, Pencil, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { MarkdownViewMode } from "@/lib/markdownChromeContext";

interface Option {
  id: MarkdownViewMode;
  icon: LucideIcon;
  labelKey: string;
}

const ALL_OPTIONS: Option[] = [
  { id: "edit", icon: Pencil, labelKey: "edit" },
  { id: "split", icon: Columns, labelKey: "split" },
  { id: "preview", icon: Eye, labelKey: "preview" },
];

/**
 * Segmented edit / split / preview toggle. Lives in core so both the
 * standalone Knowledge route (addon) and the unified chrome render the
 * same control.
 *
 * `hideSplit` drops the middle option on viewports too narrow for a
 * side-by-side editor (Spec §D5 / hako sFXCwZDluTPZZkbYuozwJ).
 */
export function MarkdownViewModeToggle({
  mode,
  onChange,
  hideSplit = false,
}: {
  mode: MarkdownViewMode;
  onChange: (m: MarkdownViewMode) => void;
  hideSplit?: boolean;
}) {
  const t = useTranslations("knowledge.editor.view");
  const options = hideSplit
    ? ALL_OPTIONS.filter((o) => o.id !== "split")
    : ALL_OPTIONS;
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-bg-border bg-bg-card p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        const isActive = mode === o.id;
        const label = t(o.labelKey);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-label={label}
            title={label}
            aria-pressed={isActive}
            data-testid={`view-mode-${o.id}`}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              isActive
                ? "bg-bg-elevated text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
