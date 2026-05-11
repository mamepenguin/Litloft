"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";

import { useTreeEnabled } from "@/hooks/useTreeEnabled";
import { routeHidesTree } from "@/lib/driveViews";

interface TreeToggleProps {
  drive: string;
  /**
   * Caller-side override. When false the toggle is hidden regardless
   * of route. Default true. The toggle also auto-hides on routes that
   * suppress the tree (cross-folder views, search / smart folder) —
   * see `lib/driveViews.ts`.
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { enabled, setEnabled } = useTreeEnabled(drive);

  // Suppress on routes where the tree is unavailable (DriveLayout
  // doesn't mount TwoPaneLayout there, so clicking the toggle would
  // do nothing visible).
  if (!visible) return null;
  if (routeHidesTree({ pathname, view: searchParams.get("view") })) return null;

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? t("treeOff") : t("treeOn")}
      title={enabled ? t("treeOff") : t("treeOn")}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
    >
      {enabled ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
    </button>
  );
}
