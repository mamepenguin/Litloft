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
 * - Default depends on viewport width: `>= 1120px` opens, else closes —
 *   and on there being room to sit beside the canvas, when the caller
 *   has measured it. The two are ANDed; see the store.
 * - When the localStorage value is present and valid, it wins over the
 *   viewport default (the user's explicit choice persists across viewport
 *   resizes and unmount/remount cycles).
 */
export function useInspectorOpen(
  drive: string,
  /** Whether it can sit beside the canvas; see the store's `get`. */
  fitsBeside?: boolean | null,
): UseInspectorOpenResult {
  const open = useSyncExternalStore(
    inspectorOpenStore.subscribe,
    () => inspectorOpenStore.get(drive, fitsBeside),
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
