"use client";

import { Columns, Eye, Pencil, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { MarkdownViewMode } from "@/lib/markdownChromeContext";
import { SegmentedControl } from "./SegmentedControl";

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

export function MarkdownViewModeToggle({
  mode,
  onChange,
  hideSplit = false,
  single = false,
}: {
  mode: MarkdownViewMode;
  onChange: (m: MarkdownViewMode) => void;
  hideSplit?: boolean;
  /** Narrow: one button, showing the mode it switches to. */
  single?: boolean;
}) {
  const t = useTranslations("knowledge.editor.view");
  const tFile = useTranslations("file");
  const options = (hideSplit ? ALL_OPTIONS.filter((o) => o.id !== "split") : ALL_OPTIONS).map((o) => ({
    value: o.id,
    label: t(o.labelKey),
    icon: o.icon,
  }));
  if (single) {
    const target = ALL_OPTIONS.find(
      (o) => o.id === (mode === "preview" ? "edit" : "preview"),
    )!;
    const Icon = target.icon;
    return (
      <button
        type="button"
        onClick={() => onChange(target.id)}
        aria-label={t(target.labelKey)}
        title={t(target.labelKey)}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <Icon size={16} />
      </button>
    );
  }
  return (
    <SegmentedControl
      label={tFile("markdownViewMode")}
      options={options}
      value={mode}
      onChange={onChange}
      iconOnly
      testIdPrefix="view-mode-"
    />
  );
}
