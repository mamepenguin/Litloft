"use client";

import { Grid3X3, List } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ViewMode } from "@/types";
import { MenuRadioGroup, ToolbarMenu } from "./ToolbarMenu";

const VIEW_OPTIONS: Array<{ value: ViewMode; labelKey: string }> = [
  { value: "grid", labelKey: "grid" },
  { value: "list", labelKey: "list" },
];

const VIEW_ICONS: Record<ViewMode, typeof Grid3X3> = {
  grid: Grid3X3,
  list: List,
};

interface ViewProps {
  mode: ViewMode;
  onSelect: (mode: ViewMode) => void;
}

/**
 * The "which layout" rows, without a control around them.
 *
 * The folder toolbar draws these twice — inside `ViewMenu` on the bar, and
 * inside `…` at the widths where the bar has no room for it. Both take the
 * mode from the toolbar rather than each holding their own, or the phone and
 * the desktop would disagree about which layout is on.
 */
export function ViewGroup({ mode, onSelect }: ViewProps) {
  const t = useTranslations("view");
  return (
    <MenuRadioGroup
      heading={t("label")}
      options={VIEW_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
      isSelected={(value) => value === mode}
      onSelect={onSelect}
    />
  );
}

/**
 * Grid or list, as one labelled control.
 *
 * It was two adjacent icon buttons, and the selected one carried a border
 * because it could not carry a fill (`ViewToggle` records that measurement).
 * A menu says which layout is on in a word instead of in a border, which is
 * what lets the folder toolbar reach 案 2's target of one wordless control.
 * The five screens that are not this toolbar keep `ViewToggle`.
 */
export function ViewMenu({
  mode,
  onSelect,
  className,
  "data-bar": bar,
}: ViewProps & { className?: string; "data-bar"?: "wide" }) {
  const t = useTranslations("view");
  return (
    <ToolbarMenu
      label={t("label")}
      value={t(mode)}
      icon={VIEW_ICONS[mode]}
      className={className}
      data-bar={bar}
    >
      {(close) => (
        <ViewGroup
          mode={mode}
          onSelect={(next) => {
            onSelect(next);
            close();
          }}
        />
      )}
    </ToolbarMenu>
  );
}
