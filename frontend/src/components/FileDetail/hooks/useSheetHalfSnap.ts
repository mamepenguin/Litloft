"use client";

import { useEffect, useState, type RefObject } from "react";

import { SHEET_SNAP_HALF_FALLBACK, halfSnapUnderPlayer } from "@/lib/sheetSnap";
import { useViewportHeight } from "@/hooks/useViewportHeight";

/**
 * `half` is the snap that lands the sheet's top edge on the player's bottom
 * edge, so the video stays whole and everything under it goes to the sheet.
 *
 * **Nothing here touches the player.** Re-parenting a player reloads any
 * `<iframe>` in it and remounting a `<video>` restarts it at zero, which
 * writes a watch position nobody played.
 *
 * **The snap is solved once and held for the whole of a scroll**, which
 * relies on the stylesheet taking the host's top padding off on this surface.
 *
 * No file dependency: `FileDetailContent` mounts once per file, so this
 * whole subtree is built again for the next one.
 */
export function useSheetHalfSnap(
  playerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): number {
  const viewportHeight = useViewportHeight();
  const [halfSnap, setHalfSnap] = useState(SHEET_SNAP_HALF_FALLBACK);

  useEffect(() => {
    const node = enabled ? playerRef.current : null;
    if (!node) {
      setHalfSnap(SHEET_SNAP_HALF_FALLBACK);
      return;
    }

    const measure = () => {
      const derived = halfSnapUnderPlayer({
        viewportHeight,
        playerBottom: node.getBoundingClientRect().bottom,
      });
      setHalfSnap(derived ?? SHEET_SNAP_HALF_FALLBACK);
    };

    // Before the observer, not instead of it: a pane that never resizes
    // again would leave the sheet on the fallback for the life of the page.
    measure();

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);

    return () => {
      // Not decoration. An observer left behind keeps a closure over the
      // window it was built for and goes on writing the snap from it.
      observer?.disconnect();
    };
  }, [playerRef, enabled, viewportHeight]);

  return halfSnap;
}
