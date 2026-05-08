"use client";

import { useCallback, useEffect, useState } from "react";

import type { TreeTypeFilter } from "@/types";

const PREFIX = "tree:typeFilter:";
const VALID: TreeTypeFilter[] = ["markdown", "video", "image", "pdf"];

function storageKey(drive: string): string {
  return `${PREFIX}${drive}`;
}

function loadFilter(drive: string): TreeTypeFilter | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(storageKey(drive));
  if (raw === null) return null;
  return (VALID as string[]).includes(raw) ? (raw as TreeTypeFilter) : null;
}

function saveFilter(drive: string, filter: TreeTypeFilter | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (filter === null) localStorage.removeItem(storageKey(drive));
    else localStorage.setItem(storageKey(drive), filter);
  } catch {
    // ignore quota
  }
}

export interface TreeTypeFilterApi {
  filter: TreeTypeFilter | null;
  setFilter: (filter: TreeTypeFilter | null) => void;
}

export function useTreeTypeFilter(drive: string): TreeTypeFilterApi {
  const [filter, setFilterState] = useState<TreeTypeFilter | null>(() => loadFilter(drive));

  useEffect(() => {
    setFilterState(loadFilter(drive));
  }, [drive]);

  const setFilter = useCallback(
    (next: TreeTypeFilter | null) => {
      saveFilter(drive, next);
      setFilterState(next);
    },
    [drive],
  );

  return { filter, setFilter };
}
