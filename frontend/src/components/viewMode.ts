"use client";

import { useCallback, useEffect, useState } from "react";

import type { ViewMode } from "@/types";

const STORAGE_KEY = "video-share-view-mode";
const VALID_MODES: ViewMode[] = ["grid", "list"];

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && (VALID_MODES as string[]).includes(value);
}

/**
 * Reading happens only when uncontrolled: a controlled switcher's owner has
 * already read from its own per-folder key, and a second read here would
 * overwrite that with the global default.
 */
export function useViewModeState(
  controlledMode: ViewMode | undefined,
  onChange: (mode: ViewMode) => void,
) {
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

  const select = useCallback(
    (newMode: ViewMode) => {
      if (!isControlled) {
        setUncontrolledMode(newMode);
        localStorage.setItem(STORAGE_KEY, newMode);
      }
      onChange(newMode);
    },
    [isControlled, onChange],
  );

  return { mode, select };
}
