"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { mergeOrder } from "./orderMerge";

/**
 * Persisted order of the items inside one sidebar section, scoped per drive.
 *
 * Unlike section order (global), item identity is entirely drive-dependent — a
 * pin in drive A does not exist in drive B — so the key is drive-scoped, same
 * granularity as `tree:expanded:{drive}` / `folderPrefs:{drive}` (hako
 * rOloIC47lE4P3MyCtf1Vv / 2Q6UrppcejT4n0oYMEPbI).
 *
 * `currentIds` must be the server-provided order (the default position for any
 * item not yet in the saved order).
 */

const keyFor = (section: string, drive: string) =>
  `sidebar:order:${section}:${drive}`;

function readSaved(section: string, drive: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(section, drive));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
  } catch {
    // malformed / unavailable — fall back to server order
  }
  return [];
}

export function useSidebarItemOrder(
  section: string,
  drive: string | null,
  currentIds: readonly string[],
): {
  order: string[];
  setOrder: (next: readonly string[]) => void;
} {
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    if (!drive) {
      setSaved([]);
      return;
    }
    setSaved(readSaved(section, drive));
  }, [section, drive]);

  const order = useMemo(
    () => mergeOrder(saved, currentIds),
    [saved, currentIds],
  );

  const setOrder = useCallback(
    (next: readonly string[]) => {
      if (!drive) return;
      const value = [...next];
      setSaved(value);
      try {
        window.localStorage.setItem(
          keyFor(section, drive),
          JSON.stringify(value),
        );
      } catch {
        // persistence failure is non-fatal; in-memory order still applies
      }
    },
    [section, drive],
  );

  return { order, setOrder };
}
