"use client";

import { Grid3X3, List } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ViewMode } from "@/types";
import { useViewModeState } from "@/components/viewMode";

interface ViewToggleProps {
  /**
   * When provided, ViewToggle is controlled: it reflects this mode and does
   * not read/write the global localStorage key itself. The controller (e.g.
   * `useFolderViewMode`) owns persistence. When omitted, ViewToggle is
   * uncontrolled and persists to the global default key.
   */
  mode?: ViewMode;
  onChange: (mode: ViewMode) => void;
}

/**
 * Grid/list view toggle.
 *
 * Phase 3 redesign (Topic 1 補正, hako w4zVT8-dyYwshLNiJ5REY): the
 * tree-pane visibility lives in a separate `<TreeToggle>` button, no
 * longer mixed in here.
 */
export function ViewToggle({ mode: controlledMode, onChange }: ViewToggleProps) {
  const t = useTranslations("view");
  const { mode, select } = useViewModeState(controlledMode, onChange);

  // A control that only says which of two equal views you are in does not
  // get the screen's accent fill: DESIGN.md §2.2 allows one per screen and
  // it belongs to what the screen is *for*. Dropped here rather than at each
  // call site, because this toggle rides on more than one screen.
  // **The list of those screens is asserted, not maintained here** —
  // `ViewToggle.test.tsx` walks the tree for the call sites, because the
  // sentence that used to hold them said four when there were six, and that
  // same sentence was the list of backgrounds the contrast below was
  // measured against. The backgrounds it sits on still vary — a pill of
  // `bg-bg-elevated`, one of `bg-bg-card`, or the page itself — which is why
  // the selection device below is measured against every candidate rather
  // than against one screen's.
  //
  // Selection is carried by a **border**, the same device §Tabs uses, and not
  // by a surface. No surface token can carry it: `--bg-card` is `#ffffff` in
  // the light theme and so is `--bg-primary`, which makes a card-coloured
  // selection literally invisible wherever this sits on the page (the
  // PageHeader actions on Missing, and the collection toolbar). Measured
  // against every candidate, the best surface reached 1.28:1 and the accent
  // border reaches 4.5-5.5:1 in both themes, clearing the 3:1 that WCAG
  // 1.4.11 asks of a state indicator. A border is also not a *fill*, so §2.2's
  // budget is still spent on the screen's own action.
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
