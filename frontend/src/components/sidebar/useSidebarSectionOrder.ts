"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { mergeOrder } from "./orderMerge";

/**
 * Persisted order of the reorderable sidebar sections.
 *
 * Stored under a single **global** key — which section sits where is a
 * workstyle preference, not drive-dependent (hako eWZedtDkm8PuWgoaatdzh, same
 * rationale as `sidebar:section:*:collapsed`). Only Collections / Pins /
 * Smart Folders / Tags participate; Library and Drives stay fixed and are
 * never passed in.
 *
 * The persisted value is just an ID list; {@link mergeOrder} reconciles it
 * with `availableIds` so a new (e.g. addon) section appears at its default
 * position and a removed one vanishes.
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
      // ignore
    }
  }, []);

  return { order, setOrder, reset };
}
