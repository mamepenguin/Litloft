"use client";

import { useCallback, useSyncExternalStore } from "react";

import { treeIncludeFilesStore } from "@/lib/treeIncludeFilesStore";

interface UseTreeIncludeFilesResult {
  includeFiles: boolean;
  setIncludeFiles: (next: boolean) => void;
}

/**
 * Drive-scoped "show files in the tree too" toggle (F-7). Off by default;
 * see `treeIncludeFilesStore` for why.
 */
export function useTreeIncludeFiles(drive: string): UseTreeIncludeFilesResult {
  const includeFiles = useSyncExternalStore(
    treeIncludeFilesStore.subscribe,
    () => treeIncludeFilesStore.get(drive),
    () => false,
  );
  const setIncludeFiles = useCallback(
    (next: boolean) => {
      treeIncludeFilesStore.set(drive, next);
    },
    [drive],
  );
  return { includeFiles, setIncludeFiles };
}
