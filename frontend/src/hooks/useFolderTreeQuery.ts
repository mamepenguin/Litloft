"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getFolderTree } from "@/lib/api";
import type { FolderTreeNode, TreeTypeFilter } from "@/types";

interface FetchState {
  status: "idle" | "loading" | "loaded" | "error";
  nodes: FolderTreeNode[];
  error: string | null;
}

const IDLE: FetchState = { status: "idle", nodes: [], error: null };

interface UseFolderTreeQueryOpts {
  drive: string;
  typeFilter: TreeTypeFilter | null;
  /** Paths whose children should be loaded. Drive root is "". Ignored when ``flatLoad`` is true. */
  pathsToLoad: ReadonlySet<string>;
  /**
   * When true, fetch the entire drive tree once via ``?flat=true`` and
   * expose every returned node under ``childrenByPath.get("")``. The
   * tree pane groups them by parent path itself. Used by the spec
   * 2026-05-09 tree filter to evaluate matches deeper than the root.
   */
  flatLoad?: boolean;
}

interface UseFolderTreeQueryResult {
  /**
   * Map of folder path -> child nodes. Drive root children are stored
   * under the empty string key. In ``flatLoad`` mode the full tree is
   * stored under "" and the tree pane groups it itself.
   */
  childrenByPath: Map<string, FolderTreeNode[]>;
  loading: Set<string>;
  errors: Map<string, string>;
}

/**
 * Lazy-loads folder-tree children for each folder path requested in
 * `pathsToLoad`. Cached per (drive, typeFilter, mode, path); when any of
 * those change the cache is dropped because counts and visibility differ.
 */
export function useFolderTreeQuery(opts: UseFolderTreeQueryOpts): UseFolderTreeQueryResult {
  const { drive, typeFilter, pathsToLoad, flatLoad = false } = opts;
  const [byPath, setByPath] = useState<Map<string, FetchState>>(new Map());
  const inflight = useRef<Map<string, AbortController>>(new Map());
  const cacheKey = `${drive}::${typeFilter ?? ""}::${flatLoad ? "flat" : "lazy"}`;
  const cacheKeyRef = useRef(cacheKey);

  // Drop cache + cancel inflight when drive, typeFilter, or mode changes.
  useEffect(() => {
    if (cacheKeyRef.current === cacheKey) return;
    cacheKeyRef.current = cacheKey;
    for (const controller of inflight.current.values()) controller.abort();
    inflight.current.clear();
    setByPath(new Map());
  }, [cacheKey]);

  const fetchPath = useCallback(
    (path: string) => {
      if (inflight.current.has(path)) return;
      const controller = new AbortController();
      inflight.current.set(path, controller);
      setByPath((prev) => {
        const next = new Map(prev);
        next.set(path, { status: "loading", nodes: [], error: null });
        return next;
      });
      const params = flatLoad
        ? { type_filter: typeFilter, flat: true }
        : { root: path, type_filter: typeFilter, depth: 1 };
      getFolderTree(drive, params, { signal: controller.signal })
        .then((nodes) => {
          if (controller.signal.aborted) return;
          setByPath((prev) => {
            const next = new Map(prev);
            next.set(path, { status: "loaded", nodes, error: null });
            return next;
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          const message = err instanceof Error ? err.message : String(err);
          setByPath((prev) => {
            const next = new Map(prev);
            next.set(path, { status: "error", nodes: [], error: message });
            return next;
          });
        })
        .finally(() => {
          inflight.current.delete(path);
        });
    },
    [drive, typeFilter, flatLoad],
  );

  // Trigger fetch for any requested path that we haven't loaded yet. In
  // flatLoad mode we only ever load the synthetic "" key (the whole tree).
  useEffect(() => {
    if (flatLoad) {
      const state = byPath.get("") ?? IDLE;
      if (state.status === "idle") fetchPath("");
      return;
    }
    for (const path of pathsToLoad) {
      const state = byPath.get(path) ?? IDLE;
      if (state.status === "idle") fetchPath(path);
    }
  }, [pathsToLoad, byPath, fetchPath, flatLoad]);

  // Cleanup inflight requests on unmount.
  useEffect(() => {
    return () => {
      for (const controller of inflight.current.values()) controller.abort();
      inflight.current.clear();
    };
  }, []);

  // Derive immutable views once per byPath update. Stable identity lets
  // downstream memoization (e.g. FolderTreePane.flatList) skip work
  // when nothing actually changed.
  return useMemo(() => {
    const childrenByPath = new Map<string, FolderTreeNode[]>();
    const loading = new Set<string>();
    const errors = new Map<string, string>();
    for (const [path, state] of byPath.entries()) {
      if (state.status === "loaded") childrenByPath.set(path, state.nodes);
      else if (state.status === "loading") loading.add(path);
      else if (state.status === "error" && state.error) errors.set(path, state.error);
    }
    return { childrenByPath, loading, errors };
  }, [byPath]);
}
