"use client";

import { useCallback, useEffect, useState } from "react";

import type { FileKind } from "@/types";

const PREFIX = "tree:typeFilter:";
// The whole vocabulary, not the four buckets the tree used to know.
// A value that is no longer valid falls back to "no filter" below, so a
// persisted choice from an older build degrades quietly.
const VALID: FileKind[] = [
  "video", "image", "audio", "document", "archive", "other", "markdown", "pdf",
];

function storageKey(drive: string): string {
  return `${PREFIX}${drive}`;
}

function loadFilter(drive: string): FileKind | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(storageKey(drive));
  if (raw === null) return null;
  return (VALID as string[]).includes(raw) ? (raw as FileKind) : null;
}

function saveFilter(drive: string, filter: FileKind | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (filter === null) localStorage.removeItem(storageKey(drive));
    else localStorage.setItem(storageKey(drive), filter);
  } catch {
    // ignore quota
  }
}

export interface TreeKindFilterApi {
  filter: FileKind | null;
  setFilter: (filter: FileKind | null) => void;
}

export function useTreeKindFilter(drive: string): TreeKindFilterApi {
  const [filter, setFilterState] = useState<FileKind | null>(() => loadFilter(drive));

  useEffect(() => {
    setFilterState(loadFilter(drive));
  }, [drive]);

  const setFilter = useCallback(
    (next: FileKind | null) => {
      saveFilter(drive, next);
      setFilterState(next);
    },
    [drive],
  );

  return { filter, setFilter };
}
