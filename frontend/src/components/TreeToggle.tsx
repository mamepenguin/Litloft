"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";

import { useTreeVisible } from "@/hooks/useTreeVisible";
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
  // The effective state, not the stored one. Below `md` a stored "on" is
  // suppressed so the reader is not left on a full-viewport tree with the
  // folder they came for behind it; a button reporting "on" over a tree
  // that is not there would be the screen lying about itself.
  const { visible: treeVisible, toggle } = useTreeVisible(drive);

  // Suppress on routes where the tree is unavailable (DriveLayout
  // doesn't mount TwoPaneLayout there, so clicking the toggle would
  // do nothing visible).
  if (!visible) return null;
  if (routeHidesTree({ pathname, view: searchParams.get("view") })) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={treeVisible}
      aria-label={treeVisible ? t("treeOff") : t("treeOn")}
      title={treeVisible ? t("treeOff") : t("treeOn")}
      // Pressed reads the same way the sidebar's active link does
      // (`Sidebar.tsx`), so the two controls that decide which surface
      // names your location look alike when they are on. No accent: the
      // screen's one fill belongs to its one action, and
      // `accent-budget.test.tsx` holds that.
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-bg-elevated hover:text-text-primary ${
        treeVisible ? "bg-bg-elevated text-text-primary" : "text-text-muted"
      }`}
    >
      {treeVisible ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
    </button>
  );
}
