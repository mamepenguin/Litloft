"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  SHEET_DISMISS_EASING,
  sheetDismissDurationMs,
  translateYOf,
} from "@/lib/sheetDismiss";

/** Past the transition's own length, for a `transitionend` that never comes. */
const FINISH_GRACE_MS = 100;

export interface SheetDismiss {
  /** @param velocity px/ms, positive downward. */
  dismiss: (from?: { velocity?: number }) => void;
  isDismissing: () => boolean;
}

/**
 * The sheet is unmounted at `peek`, so collapsing it the moment a gesture
 * decides would make it vanish where it stands. The state changes only
 * once the surface has left the screen.
 *
 * Reduced motion needs nothing here: the rule at the top of `globals.css`
 * caps every `transition-duration` with `!important`.
 */
export function useSheetDismissMotion({
  surfaceRef,
  expanded,
  onDismissed,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  expanded: boolean;
  onDismissed: () => void;
}): SheetDismiss {
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;
  const dismissingRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);

  // Stays set while collapsed: vaul resets its snap point 500ms after a
  // close, and from `full` that would reopen the sheet.
  useEffect(() => {
    if (expanded) dismissingRef.current = false;
    // Collapsed by some other route while leaving: the surface is gone, and
    // a finish still pending would close the next opening.
    else cancelRef.current?.();
  }, [expanded]);

  useEffect(() => () => cancelRef.current?.(), []);

  const dismiss = useCallback<SheetDismiss["dismiss"]>(
    ({ velocity = 0 } = {}) => {
      if (dismissingRef.current) return;
      dismissingRef.current = true;

      const surface = surfaceRef.current;
      if (!surface) {
        onDismissedRef.current();
        return;
      }

      // vaul may still be springing the drawer back to a snap point, and
      // the distance below is only right if the drawer stays where it is.
      const drawer = surface.parentElement;
      if (drawer) {
        const now = getComputedStyle(drawer).transform;
        drawer.style.transition = "none";
        drawer.style.transform = now === "none" ? "" : now;
      }
      const pull = translateYOf(getComputedStyle(surface).transform);
      const distance = Math.max(
        0,
        window.innerHeight - surface.getBoundingClientRect().top,
      );
      const ms = sheetDismissDurationMs(distance, velocity);

      // A second gesture cannot catch a sheet that is already on its way
      // out.
      surface.style.pointerEvents = "none";
      surface.style.transition = `transform ${ms}ms ${SHEET_DISMISS_EASING}`;
      surface.style.transform = `translate3d(0, ${pull + distance}px, 0)`;

      const onEnd = (event: TransitionEvent) => {
        if (event.target === surface && event.propertyName === "transform") {
          finish();
        }
      };
      const cancel = () => {
        window.clearTimeout(timer);
        surface.removeEventListener("transitionend", onEnd);
        cancelRef.current = null;
      };
      const finish = () => {
        cancel();
        onDismissedRef.current();
      };
      surface.addEventListener("transitionend", onEnd);
      const timer = window.setTimeout(finish, ms + FINISH_GRACE_MS);
      cancelRef.current = cancel;
    },
    [surfaceRef],
  );

  const isDismissing = useCallback(() => dismissingRef.current, []);

  return { dismiss, isDismissing };
}
