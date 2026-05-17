"use client";

import { useCallback, useEffect, useState } from "react";

import type { Tag } from "@/types";

/**
 * Tags has no manual reorder (a drive can hold dozens of tags — dragging them
 * is impractical and new-tag insertion is ill-defined). Instead the user
 * toggles a sort mode, persisted per drive (hako c3CcYY_a8nRwD5lG-zeOi).
 *
 * Default is "count" (descending), which matches the existing API-provided
 * ordering, so enabling this hook does not change current behaviour.
 */

export type TagSortMode = "name" | "count";

const DEFAULT_MODE: TagSortMode = "count";

const keyFor = (drive: string) => `sidebar:sort:tags:${drive}`;

function readMode(drive: string): TagSortMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(keyFor(drive));
    if (raw === "name" || raw === "count") return raw;
  } catch {
    // unavailable — default
  }
  return DEFAULT_MODE;
}

/** Immutably sort tags by the given mode. */
export function sortTags(tags: readonly Tag[], mode: TagSortMode): Tag[] {
  const copy = [...tags];
  if (mode === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return copy;
}

export function useTagSortMode(drive: string | null): {
  mode: TagSortMode;
  setMode: (mode: TagSortMode) => void;
} {
  const [mode, setModeState] = useState<TagSortMode>(DEFAULT_MODE);

  useEffect(() => {
    if (!drive) {
      setModeState(DEFAULT_MODE);
      return;
    }
    setModeState(readMode(drive));
  }, [drive]);

  const setMode = useCallback(
    (next: TagSortMode) => {
      setModeState(next);
      if (!drive) return;
      try {
        if (next === DEFAULT_MODE) {
          window.localStorage.removeItem(keyFor(drive));
        } else {
          window.localStorage.setItem(keyFor(drive), next);
        }
      } catch {
        // persistence failure is non-fatal
      }
    },
    [drive],
  );

  return { mode, setMode };
}
