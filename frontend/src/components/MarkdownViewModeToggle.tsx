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
}: {
  mode: MarkdownViewMode;
  onChange: (m: MarkdownViewMode) => void;
  hideSplit?: boolean;
}) {
  const t = useTranslations("knowledge.editor.view");
  const tFile = useTranslations("file");
  const options = (hideSplit ? ALL_OPTIONS.filter((o) => o.id !== "split") : ALL_OPTIONS).map((o) => ({
    value: o.id,
    label: t(o.labelKey),
    icon: o.icon,
  }));
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
