"use client";

import { useCallback, useSyncExternalStore } from "react";

import { treeEnabledStore } from "@/lib/treeEnabledStore";

interface UseTreeEnabledResult {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
}

export function useTreeEnabled(drive: string): UseTreeEnabledResult {
  const enabled = useSyncExternalStore(
    treeEnabledStore.subscribe,
    () => treeEnabledStore.get(drive),
    () => false,
  );
  const setEnabled = useCallback(
    (next: boolean) => {
      treeEnabledStore.set(drive, next);
    },
    [drive],
  );
  return { enabled, setEnabled };
}
