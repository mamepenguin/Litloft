"use client";

import { Grid3X3, List } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ViewMode } from "@/types";
import { useViewModeState } from "@/components/viewMode";

interface ViewToggleProps {
  mode?: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode: controlledMode, onChange }: ViewToggleProps) {
  const t = useTranslations("view");
  const { mode, select } = useViewModeState(controlledMode, onChange);

  // Selection is carried by a **border**, not by a surface: `--bg-card` is
  // `#ffffff` in the light theme and so is `--bg-primary`, which makes a
  // card-coloured selection literally invisible wherever this sits on the page.
  const buttonClass = (active: boolean) =>
    `rounded-lg border p-2 transition-colors ${
      active
        ? "border-accent text-text-primary"
        : "border-transparent text-text-muted hover:text-text-primary"
    }`;

  return (
    <div className="flex gap-1">
      <button
        onClick={() => select("grid")}
        className={buttonClass(mode === "grid")}
        aria-label={t("grid")}
      >
        <Grid3X3 size={18} />
      </button>
      <button
        onClick={() => select("list")}
        className={buttonClass(mode === "list")}
        aria-label={t("list")}
      >
        <List size={18} />
      </button>
    </div>
  );
}
