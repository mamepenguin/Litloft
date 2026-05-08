"use client";

import { Columns2, Grid3X3, List } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ViewMode } from "@/types";

const STORAGE_KEY = "video-share-view-mode";
const VALID_MODES: ViewMode[] = ["grid", "list", "two-pane"];

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
  /** When false, the two-pane button is hidden (e.g. flat virtual views). */
  enableTwoPane?: boolean;
}

export function ViewToggle({ mode: controlledMode, onChange, enableTwoPane = true }: ViewToggleProps) {
  const t = useTranslations("view");
  const isControlled = controlledMode !== undefined;
  const [uncontrolledMode, setUncontrolledMode] = useState<ViewMode>("grid");
  const mode = isControlled ? controlledMode : uncontrolledMode;

  useEffect(() => {
    if (isControlled) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!isViewMode(saved)) return;
    if (saved === "two-pane" && !enableTwoPane) return;
    setUncontrolledMode(saved);
    onChange(saved);
  }, [isControlled, enableTwoPane, onChange]);

  function toggle(newMode: ViewMode) {
    if (newMode === "two-pane" && !enableTwoPane) return;
    if (!isControlled) {
      setUncontrolledMode(newMode);
      localStorage.setItem(STORAGE_KEY, newMode);
    }
    onChange(newMode);
  }

  const buttonClass = (active: boolean) =>
    `rounded-md p-2 transition-colors ${
      active ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
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
      {enableTwoPane && (
        <button
          onClick={() => toggle("two-pane")}
          className={buttonClass(mode === "two-pane")}
          aria-label={t("twoPane")}
        >
          <Columns2 size={18} />
        </button>
      )}
    </div>
  );
}
