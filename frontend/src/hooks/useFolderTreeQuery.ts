"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getFolderTree } from "@/lib/api";
import type { FolderTreeNode, FileKind } from "@/types";

interface FetchState {
  status: "idle" | "loading" | "loaded" | "error";
  nodes: FolderTreeNode[];
  error: string | null;
}

const IDLE: FetchState = { status: "idle", nodes: [], error: null };

interface UseFolderTreeQueryOpts {
  drive: string;
  typeFilter: FileKind | null;
  pathsToLoad: ReadonlySet<string>;
  flatLoad?: boolean;
  includeFiles?: boolean;
  refreshKey?: number;
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

export function useFolderTreeQuery(opts: UseFolderTreeQueryOpts): UseFolderTreeQueryResult {
  const {
    drive,
    typeFilter,
    pathsToLoad,
    flatLoad = false,
    includeFiles = false,
    refreshKey = 0,
  } = opts;
  const [byPath, setByPath] = useState<Map<string, FetchState>>(new Map());
  const inflight = useRef<Map<string, AbortController>>(new Map());
  const cacheKey = `${drive}::${typeFilter ?? ""}::${flatLoad ? "flat" : "lazy"}::${
    includeFiles ? "files" : "folders"
  }::${refreshKey}`;
  const cacheKeyRef = useRef(cacheKey);

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
        ? { type_filter: typeFilter, flat: true, include_files: includeFiles }
        : {
            root: path,
            type_filter: typeFilter,
            depth: 1,
            include_files: includeFiles,
          };
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
    [drive, typeFilter, flatLoad, includeFiles],
  );

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
