"use client";

import { useCallback, useSyncExternalStore } from "react";

import { inspectorOpenStore } from "@/lib/inspectorOpenStore";

interface UseInspectorOpenResult {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
}

/**
 * Drive-scoped Inspector pane open/closed state for the Markdown
 * DocumentLayout.
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md` §D3.
 *
 * - Persisted per-drive in `localStorage["inspector-open:{drive}"]`.
 * - Default depends on viewport width: `>= 1120px` opens, else closes.
 * - When the localStorage value is present and valid, it wins over the
 *   viewport default (the user's explicit choice persists across viewport
 *   resizes and unmount/remount cycles).
 */
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
