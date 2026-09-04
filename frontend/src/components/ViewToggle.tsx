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
  // fill on the folder toolbar, on a control that says which of two equal
  // views you are in. DESIGN.md §2.2 allows one per screen, and it belongs to
  // the action the screen is for, not to a view switch. This toggle also
  // appears on Trash, Missing and inside an archive, so the fill is dropped
  // here rather than at one call site.
  const buttonClass = (active: boolean) =>
    `rounded-lg p-2 transition-colors ${
      active
        ? "bg-bg-card text-text-primary"
        : "text-text-muted hover:text-text-primary"
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
