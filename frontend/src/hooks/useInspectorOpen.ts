"use client";

import { useCallback, useSyncExternalStore } from "react";

import { inspectorOpenStore } from "@/lib/inspectorOpenStore";

interface UseInspectorOpenResult {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
}

export function useInspectorOpen(
  drive: string,
  isPlayerFile = false,
): UseInspectorOpenResult {
  const open = useSyncExternalStore(
    inspectorOpenStore.subscribe,
    () => inspectorOpenStore.get(drive, isPlayerFile),
    () => false,
  );
  const setOpen = useCallback(
    (next: boolean) => {
      inspectorOpenStore.set(drive, next);
    },
    [drive],
  );
  const toggle = useCallback(() => {
    inspectorOpenStore.set(drive, !inspectorOpenStore.get(drive, isPlayerFile));
  }, [drive, isPlayerFile]);
  return { open, setOpen, toggle };
}
