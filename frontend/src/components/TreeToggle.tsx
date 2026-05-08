"use client";

import { PanelLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { useTreeEnabled } from "@/hooks/useTreeEnabled";

interface TreeToggleProps {
  drive: string;
  /**
   * When false, the toggle is hidden (e.g. flat virtual views like
   * favorites/recent/search where there is no folder tree to surface).
   * Default true.
   */
  visible?: boolean;
}

/**
 * Independent toggle for the folder tree pane.
 *
 * Phase 3 redesign (Topic 1 補正, hako w4zVT8-dyYwshLNiJ5REY): tree
 * visibility is orthogonal to the grid/list view mode and lives in its
 * own button so the user can mix any combination of (grid|list) ×
 * (tree on|off).
 */
export function TreeToggle({ drive, visible = true }: TreeToggleProps) {
  const t = useTranslations("view");
  const { enabled, setEnabled } = useTreeEnabled(drive);
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? t("treeOff") : t("treeOn")}
      title={enabled ? t("treeOff") : t("treeOn")}
      className={`rounded-md p-2 transition-colors ${
        enabled
          ? "bg-accent text-white"
          : "text-text-muted hover:text-text-primary"
      }`}
    >
      <PanelLeft size={18} />
    </button>
  );
}
