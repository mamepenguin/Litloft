"use client";

import { useCallback, useEffect, useState } from "react";

const PREFIX = "tree:expanded:";

function storageKey(drive: string): string {
  return `${PREFIX}${drive}`;
}

function loadExpanded(drive: string): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(drive));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function saveExpanded(drive: string, paths: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(drive), JSON.stringify([...paths]));
  } catch {
    // ignore quota
  }
}

export interface TreeExpansionApi {
  expanded: Set<string>;
  isExpanded: (path: string) => boolean;
  toggle: (path: string) => void;
  expand: (path: string) => void;
  collapse: (path: string) => void;
  /**
   * Collapse several paths as one state update and one write. Spring-
   * loaded drag calls this on every drag end to undo the branches it
   * opened, so the common case — a drag that opened nothing — must not
   * cost a render or a localStorage write.
   */
  collapseMany: (paths: Iterable<string>) => void;
}

export function useTreeExpansion(drive: string): TreeExpansionApi {
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded(drive));

  useEffect(() => {
    setExpanded(loadExpanded(drive));
  }, [drive]);

  const isExpanded = useCallback((path: string) => expanded.has(path), [expanded]);

  const update = useCallback(
    (mutator: (next: Set<string>) => void) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        mutator(next);
        saveExpanded(drive, next);
        return next;
      });
    },
    [drive],
  );

  const toggle = useCallback(
    (path: string) => {
      update((next) => {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      });
    },
    [update],
  );

  const expand = useCallback(
    (path: string) => {
      update((next) => {
        next.add(path);
      });
    },
    [update],
  );

  const collapse = useCallback(
    (path: string) => {
      update((next) => {
        next.delete(path);
      });
    },
    [update],
  );

  const collapseMany = useCallback(
    (paths: Iterable<string>) => {
      const list = [...paths];
      if (list.length === 0) return;
      update((next) => {
        for (const path of list) next.delete(path);
      });
    },
    [update],
  );

  return { expanded, isExpanded, toggle, expand, collapse, collapseMany };
}
