"use client";

import { useCallback, useSyncExternalStore } from "react";

import { treeIncludeFilesStore } from "@/lib/treeIncludeFilesStore";

interface UseTreeIncludeFilesResult {
  includeFiles: boolean;
  setIncludeFiles: (next: boolean) => void;
}

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
