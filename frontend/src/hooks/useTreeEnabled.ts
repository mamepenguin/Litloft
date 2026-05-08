"use client";

import { useCallback, useSyncExternalStore } from "react";

import { treeEnabledStore } from "@/lib/treeEnabledStore";

interface UseTreeEnabledResult {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
}

/**
 * Drive-scoped tree visibility toggle.
 *
 * Phase 3 redesign (Topic 1 補正, hako w4zVT8-dyYwshLNiJ5REY): the tree
 * pane's visibility is independent of the grid/list view mode. Persisted
 * per-drive in localStorage and shared across all hook instances in the
 * same tab via a module store.
 */
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
