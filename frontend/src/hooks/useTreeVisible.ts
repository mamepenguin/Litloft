"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useTreeBeside } from "@/hooks/useTreeBeside";
import { useTreeEnabled } from "@/hooks/useTreeEnabled";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";

interface UseTreeVisibleResult {
  visible: boolean;
  beside: boolean;
  toggle: () => void;
}

/**
 * Below `md` the tree takes the whole viewport and the content is hidden,
 * so a stored "on" carried onto a phone would land the reader on a screen
 * with nothing they came for. The width therefore suppresses the *effect*
 * of the setting without touching the setting itself.
 *
 * Down there the tree is still reachable, because asking for it on the
 * screen in front of you is a different act from a setting carried over
 * from a wider one. That request is not persisted.
 */
export function useTreeVisible(drive: string): UseTreeVisibleResult {
  const { enabled, setEnabled } = useTreeEnabled(drive);
  const beside = useTreeBeside();
  const narrowOpen = useSyncExternalStore(
    treeNarrowOpenStore.subscribe,
    () => treeNarrowOpenStore.get(drive),
    () => false,
  );

  // A request made below `md` dies the moment it stops applying, so a tablet
  // rotated to landscape and back does not find the full-viewport tree
  // waiting on a screen where nobody asked for it.
  useEffect(() => {
    if (beside) treeNarrowOpenStore.set(drive, false);
  }, [beside, drive]);

  const visible = beside ? enabled : narrowOpen;

  const toggle = useCallback(() => {
    if (beside) {
      setEnabled(!enabled);
      treeNarrowOpenStore.set(drive, false);
      return;
    }
    // Narrow: the request is about this screen, so it does not disturb the
    // stored setting the wider layout will read.
    treeNarrowOpenStore.set(drive, !narrowOpen);
  }, [beside, enabled, narrowOpen, setEnabled, drive]);

  return { visible, beside: visible && beside, toggle };
}
