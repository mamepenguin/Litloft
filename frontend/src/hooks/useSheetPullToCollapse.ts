"use client";

import { useEffect, useRef, type RefObject } from "react";

import {
  SHEET_VELOCITY_WINDOW_MS,
  releaseVelocity,
  type VelocitySample,
} from "@/lib/sheetDismiss";
import {
  advanceSheetPull,
  beginSheetPull,
  releaseSheetPull,
  sheetDismissDistancePx,
  type SheetPullState,
} from "@/lib/sheetPullGesture";

const SETTLE_MS = 200;
const SETTLE_EASING = "ease-out";

/**
 * **Touch events, not pointer events.** The only way to stop a browser
 * from scrolling for a touch it has not yet committed is
 * `preventDefault()` on a non-passive `touchmove`. `touch-action` is
 * pointer events' only lever, and it is a static property, so it would
 * have to be set before knowing which gesture this is.
 *
 * **The surface's style is written only while the sheet owns the
 * gesture.** iOS Safari abandons the scroll of a touch during which an
 * ancestor of the scroller changed its transform, and the content stays
 * frozen for every touch that follows.
 *
 * **Nothing here re-renders.** The sheet is drawn by writing a transform
 * on `surfaceRef`, at touch rate. A React state per frame would re-render
 * the whole inspector between the finger moving and the sheet following it.
 *
 * @param scroller **The element itself, not a ref**: the drawer is not
 *   mounted at `peek`, so the node appears and disappears with the sheet's
 *   state, and a ref object would leave this effect attached to whatever
 *   was there when it last ran.
 * @param surfaceRef **Not `Drawer.Content`**: vaul writes that element's
 *   transform on every frame of its own drag and on every snap, so a
 *   transform written there is overwritten or fights it.
 */
export function useSheetPullToCollapse({
  scroller,
  surfaceRef,
  onDismiss,
  isDismissing,
}: {
  scroller: HTMLElement | null;
  surfaceRef: RefObject<HTMLElement | null>;
  onDismiss: (release: { velocity: number }) => void;
  /** A finger still down when the sheet starts leaving would pull it back. */
  isDismissing: () => boolean;
}): void {
  // Read through a ref so a new callback identity does not detach and
  // reattach the listeners — which, mid-gesture, would drop the gesture.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const isDismissingRef = useRef(isDismissing);
  isDismissingRef.current = isDismissing;

  useEffect(() => {
    if (!scroller) return;

    let state: SheetPullState | null = null;
    let touchId: number | null = null;
    let startY = 0;
    let dismissPx = 0;
    let samples: VelocitySample[] = [];

    const surface = () => surfaceRef.current;

    const draw = (pull: number) => {
      const el = surface();
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = `translate3d(0, ${pull}px, 0)`;
    };

    const settle = () => {
      const el = surface();
      if (!el) return;
      el.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
      el.style.transform = "translate3d(0, 0, 0)";
    };

    const forget = () => {
      state = null;
      touchId = null;
      samples = [];
    };

    const onTouchStart = (event: TouchEvent) => {
      // A second finger is not a second gesture: it makes this one
      // ambiguous, so the sheet gives it up and springs back.
      if (event.touches.length !== 1) {
        if (state?.owner === "sheet" && !isDismissingRef.current()) settle();
        forget();
        return;
      }
      const touch = event.touches[0];
      touchId = touch.identifier;
      startY = touch.clientY;
      samples = [{ at: event.timeStamp, y: touch.clientY }];
      // Measured at rest, so a pull does not move its own threshold.
      const top = surface()?.getBoundingClientRect().top ?? window.innerHeight;
      dismissPx = sheetDismissDistancePx(window.innerHeight - top);
      state = beginSheetPull({
        scrollTop: scroller.scrollTop,
        maxScroll: scroller.scrollHeight - scroller.clientHeight,
      });
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!state || touchId === null) return;
      if (isDismissingRef.current()) {
        forget();
        return;
      }
      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === touchId,
      );
      if (!touch) return;

      state = advanceSheetPull(state, {
        dy: touch.clientY - startY,
        // Clamped, because a bounce reads as a negative offset: a
        // negative reading feeds `advanceSheetPull` a `consumed` term as
        // large as the finger's own movement, so nothing accumulates
        // toward the handoff.
        scrollTop: Math.max(0, scroller.scrollTop),
      });

      samples.push({ at: event.timeStamp, y: touch.clientY });
      samples = samples.filter(
        (sample) => event.timeStamp - sample.at <= SHEET_VELOCITY_WINDOW_MS,
      );

      if (state.owner !== "sheet") return;
      // iOS Safari bounces an inner scroller past its own top, and the band
      // and the sheet would be two answers to one finger.
      //
      // `cancelable` is false once the browser has committed the gesture
      // to a scroll, which is the handoff case.
      if (event.cancelable) event.preventDefault();
      draw(state.pull);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!state) return;
      if (isDismissingRef.current()) {
        forget();
        return;
      }
      const released = state;
      const velocity = releaseVelocity(samples, event.timeStamp);
      forget();
      if (released.owner !== "sheet") return;
      if (releaseSheetPull(released, velocity, dismissPx) === "dismiss") {
        onDismissRef.current({ velocity });
        return;
      }
      settle();
    };

    const onTouchCancel = () => {
      const owned = state?.owner === "sheet" && !isDismissingRef.current();
      forget();
      if (owned) settle();
    };

    // `passive: false` on the move listener, explicitly: a passive
    // listener cannot call `preventDefault()` at all, and whether an
    // element listener with no options is passive is a per-engine default.
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [scroller, surfaceRef]);
}
