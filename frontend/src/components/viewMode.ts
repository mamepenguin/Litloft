"use client";

import { useCallback, useEffect, useState } from "react";

import type { ViewMode } from "@/types";

const STORAGE_KEY = "video-share-view-mode";
const VALID_MODES: ViewMode[] = ["grid", "list"];

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && (VALID_MODES as string[]).includes(value);
}

/**
 * The controlled/uncontrolled split every view switcher shares.
 *
 * Two controls now offer the same choice — `ViewToggle` on five screens and
 * `ViewMenu` on the folder toolbar — and each of them has to answer the same
 * question: is a controller passing the mode down, or is this switcher the
 * one that remembers it? Left in both components, the storage key and the
 * fallback would be written twice, and a switcher that persisted under a
 * second key would look identical while forgetting what the other one saved.
 *
 * `select` is the only writer. Reading happens once, on mount, and only when
 * uncontrolled: a controlled switcher's owner (`useFolderViewMode`) has
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
