"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useTreeBeside } from "@/hooks/useTreeBeside";
import { useTreeEnabled } from "@/hooks/useTreeEnabled";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";
import { treeVisitStore } from "@/lib/treeVisitStore";
import { treeYieldStore } from "@/lib/treeYieldStore";

interface UseTreeVisibleResult {
  visible: boolean;
  beside: boolean;
  /** The pane stepped aside for the inspector on this file page. */
  yielded: boolean;
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
  const besideViewport = useTreeBeside();
  const narrowOpen = useSyncExternalStore(
    treeNarrowOpenStore.subscribe,
    () => treeNarrowOpenStore.get(drive),
    () => false,
  );
  const yieldState = useSyncExternalStore(
    treeYieldStore.subscribe,
    () => treeYieldStore.get(drive),
    () => treeYieldStore.get(drive),
  );
  const visit = useSyncExternalStore(
    treeVisitStore.subscribe,
    () => treeVisitStore.get(drive),
    () => treeVisitStore.get(drive),
  );
  const yielded = yieldState.yielded;
  const visitVisible =
    visit.active && !visit.hidden && !yielded && besideViewport;

  // A request made below `md` dies the moment it stops applying, so a tablet
  // rotated to landscape and back does not find the full-viewport tree
  // waiting on a screen where nobody asked for it.
  useEffect(() => {
    if (besideViewport) treeNarrowOpenStore.set(drive, false);
  }, [besideViewport, drive]);

  const visible =
    visitVisible || (!yielded && (besideViewport ? enabled : narrowOpen));

  const toggle = useCallback(() => {
    // Outside a file page the button edits the setting, as it always has.
    // On one the pane has a third state — collapsed for the inspector, with
    // nothing stored — and pressing the button reports it rather than
    // writing a setting the reader did not ask of the next file page.
    if (yieldState.filePage && besideViewport) {
      if (yieldState.yielded) {
        treeYieldStore.reopen(drive);
      } else if (visit.active) {
        treeVisitStore.toggle(drive);
      } else if (yieldState.reopened) {
        setEnabled(false);
        treeYieldStore.settle(drive);
      } else if (enabled) {
        setEnabled(false);
      } else {
        setEnabled(true);
        treeYieldStore.reopen(drive);
      }
      treeNarrowOpenStore.set(drive, false);
      return;
    }
    if (besideViewport) {
      setEnabled(!enabled);
      treeNarrowOpenStore.set(drive, false);
      return;
    }
    // Narrow: the request is about this screen, so it does not disturb the
    // stored setting the wider layout will read.
    treeNarrowOpenStore.set(drive, !narrowOpen);
  }, [besideViewport, enabled, narrowOpen, setEnabled, drive, yieldState, visit]);

  return { visible, beside: visible && besideViewport, yielded, toggle };
}
