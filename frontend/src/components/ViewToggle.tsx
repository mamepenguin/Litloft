"use client";

import { Grid3X3, List } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ViewMode } from "@/types";

const STORAGE_KEY = "video-share-view-mode";
const VALID_MODES: ViewMode[] = ["grid", "list"];

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && (VALID_MODES as string[]).includes(value);
}

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
  const isControlled = controlledMode !== undefined;
  const [uncontrolledMode, setUncontrolledMode] = useState<ViewMode>("grid");
  const mode = isControlled ? controlledMode : uncontrolledMode;

  useEffect(() => {
    if (isControlled) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!isViewMode(saved)) return;
    setUncontrolledMode(saved);
    onChange(saved);
  }, [isControlled, onChange]);

  function toggle(newMode: ViewMode) {
    if (!isControlled) {
      setUncontrolledMode(newMode);
      localStorage.setItem(STORAGE_KEY, newMode);
    }
    onChange(newMode);
  }

  // The selected button used to be `bg-accent text-white` — a third accent
  // fill on the folder toolbar, on a control that only says which of two
  // equal views you are in. DESIGN.md §2.2 allows one fill per screen and it
  // belongs to what the screen is for, not to a view switch. This toggle also
  // rides on six screens, so it is dropped here rather than at one call site:
  // the folder toolbar, the drive home, a collection, Trash, Missing and the
  // inside of an archive. (Four, in an earlier draft of this sentence. Two of
  // the six sit inside a `bg-bg-elevated` pill and the rest on the page, and
  // that list was also the list of backgrounds the contrast below was measured
  // against — an enumeration written by hand is the same hazard in prose that
  // `>=` is in an assertion.)
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
        onClick={() => toggle("grid")}
        className={buttonClass(mode === "grid")}
        aria-label={t("grid")}
      >
        <Grid3X3 size={18} />
      </button>
      <button
        onClick={() => toggle("list")}
        className={buttonClass(mode === "list")}
        aria-label={t("list")}
      >
        <List size={18} />
      </button>
    </div>
  );
}
