"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { mergeOrder } from "./orderMerge";

/**
 * Stored under a single **global** key — which section sits where is a
 * workstyle preference, not drive-dependent.
 */

const STORAGE_KEY = "sidebar:order:sections";

function readSaved(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
  } catch {
    // malformed / unavailable — fall back to default order
  }
  return [];
}

export function useSidebarSectionOrder(availableIds: readonly string[]): {
  order: string[];
  setOrder: (next: readonly string[]) => void;
  reset: () => void;
} {
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    setSaved(readSaved());
  }, []);

  const order = useMemo(
    () => mergeOrder(saved, availableIds),
    [saved, availableIds],
  );

  const setOrder = useCallback((next: readonly string[]) => {
    const value = [...next];
    setSaved(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // persistence failure is non-fatal; in-memory order still applies
    }
  }, []);

  const reset = useCallback(() => {
    setSaved([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
    }
  }, []);

  return { order, setOrder, reset };
}
