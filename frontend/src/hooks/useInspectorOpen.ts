"use client";

import { useCallback, useSyncExternalStore } from "react";

import { inspectorOpenStore } from "@/lib/inspectorOpenStore";

interface UseInspectorOpenResult {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
}

export function useInspectorOpen(drive: string): UseInspectorOpenResult {
  const open = useSyncExternalStore(
    inspectorOpenStore.subscribe,
    () => inspectorOpenStore.get(drive),
    () => false,
  );
  const setOpen = useCallback(
    (next: boolean) => {
      inspectorOpenStore.set(drive, next);
    },
    [drive],
  );
  const toggle = useCallback(() => {
    inspectorOpenStore.set(drive, !inspectorOpenStore.get(drive));
  }, [drive]);
  return { open, setOpen, toggle };
}
