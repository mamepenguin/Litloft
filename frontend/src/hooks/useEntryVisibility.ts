"use client";

import { useEffect, useState } from "react";

import { EMPTY_HIDDEN_KEYS } from "@/lib/entryVisibility";

export interface EntryVisibility {
  /** `null` only while the list for the drive on screen is still loading. */
  hidden: ReadonlySet<string> | null;
}

interface LoadedVisibility {
  drive: string;
  hidden: ReadonlySet<string>;
}

async function loadHiddenKeys(drive: string): Promise<ReadonlySet<string>> {
  try {
    const res = await fetch(
      `/api/drives/${encodeURIComponent(drive)}/entry-visibility`,
      {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      },
    );
    if (!res.ok) return EMPTY_HIDDEN_KEYS;
    const body = (await res.json()) as { hidden?: unknown };
    if (!Array.isArray(body.hidden)) return EMPTY_HIDDEN_KEYS;
    return new Set(
      body.hidden.filter((key): key is string => typeof key === "string"),
    );
  } catch {
    return EMPTY_HIDDEN_KEYS;
  }
}

/**
 * The entries the drive hides, as configured by the operator in `drives.json`.
 *
 * A failed or timed-out request settles to the empty set, so every entry shows
 * and no error is reported. The answer is kept with the drive it was loaded
 * for, so a drive switch never draws the previous drive's list.
 */
export function useEntryVisibility(drive: string | null): EntryVisibility {
  const [loaded, setLoaded] = useState<LoadedVisibility | null>(null);

  useEffect(() => {
    if (!drive) return;
    let cancelled = false;
    void loadHiddenKeys(drive).then((hidden) => {
      if (!cancelled) setLoaded({ drive, hidden });
    });
    return () => {
      cancelled = true;
    };
  }, [drive]);

  if (!drive) return { hidden: EMPTY_HIDDEN_KEYS };
  return { hidden: loaded && loaded.drive === drive ? loaded.hidden : null };
}
