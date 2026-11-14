"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { mergeOrder } from "./orderMerge";

export interface CollectionSectionRow {
  /** `collection:<id>` or `smart:<id>`, which is also what storage holds. */
  key: string;
  kind: "collection" | "smart";
  id: string;
  name: string;
}

const SECTION = "collections-all";

const keyFor = (drive: string) => `sidebar:order:${SECTION}:${drive}`;

function readSaved(drive: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(drive));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
  } catch {
    // malformed / unavailable — fall back to name order
  }
  return [];
}

/** Name order across both kinds, which is the default when nothing is saved. */
export function collectionNameOrder(
  rows: readonly CollectionSectionRow[],
  locale: string,
): CollectionSectionRow[] {
  const collator = new Intl.Collator(locale, { numeric: true });
  return [...rows].sort((a, b) => {
    const byName = collator.compare(a.name, b.name);
    if (byName !== 0) return byName;
    if (a.kind !== b.kind) return a.kind === "collection" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function useMergedCollectionOrder(
  drive: string | null,
  rows: readonly CollectionSectionRow[],
  locale: string,
): {
  order: string[];
  setOrder: (next: readonly string[]) => void;
} {
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    setSaved(drive ? readSaved(drive) : []);
  }, [drive]);

  const byName = useMemo(() => collectionNameOrder(rows, locale), [rows, locale]);
  const nameOrder = useMemo(() => byName.map((row) => row.key), [byName]);

  const order = useMemo(() => mergeOrder(saved, nameOrder), [saved, nameOrder]);

  // Entries of rows that are not drawn right now (a deleted row, or a list
  // that has not loaded) are kept after the drawn ones: a drag made while a
  // list is missing must not erase positions it cannot see.
  const setOrder = useCallback(
    (next: readonly string[]) => {
      if (!drive) return;
      const drawn = new Set(nameOrder);
      const value = [...next, ...saved.filter((key) => !drawn.has(key))];
      setSaved(value);
      try {
        window.localStorage.setItem(keyFor(drive), JSON.stringify(value));
      } catch {
        // persistence failure is non-fatal; in-memory order still applies
      }
    },
    [drive, nameOrder, saved],
  );

  return { order, setOrder };
}
