"use client";

import { useEffect, useRef, type RefObject } from "react";

import {
  advanceSheetPull,
  beginSheetPull,
  releaseSheetPull,
  type SheetPullState,
} from "@/lib/sheetPullGesture";

/**
 * How long the sheet takes to return to its snap when the gesture did not
 * earn a collapse.
 *
 * 200ms `ease-out`, which is `DESIGN.md` §7's figure for a corrective
 * move — a box travelling back to where it belongs, the same reason the
 * listing's FLIP has it. Reduced motion needs nothing here: the rule at
 * the top of `globals.css` caps every `transition-duration` with
 * `!important`, which an inline style does not outrank.
 */
const SETTLE_MS = 200;
const SETTLE_EASING = "ease-out";

/**
 * How far back in time the release velocity is read.
 *
 * Long enough to survive one dropped frame, short enough that a finger
 * that stopped moving before lifting reads as stopped — which is the
 * gesture that must *not* be mistaken for a flick.
 *
 * **Measured against the moment the finger left, not against the last
 * move.** A finger that stops emits no further `touchmove`, so a window
 * applied only while moving never advances past the pause and the release
 * reads the speed the finger had before it: pull 40px, hold a second,
 * lift, and the sheet collapsed on a velocity from 984ms earlier.
 */
const VELOCITY_WINDOW_MS = 120;

/**
 * Pull the mobile Bottom Sheet down by its content, to collapse it.
 *
 * The half of the gesture that touches the DOM. `sheetPullGesture` owns
 * the decision — who a gesture belongs to, and what releasing it does —
 * and this owns the three things that module cannot do: read the
 * scroller, draw the sheet under the finger, and stop the browser from
 * scrolling as well.
 *
 * **Touch events, not pointer events.** The requirement is that a gesture
 * moves the scroller or the sheet and never both, and the only way to
 * stop a browser from scrolling for a touch it has not yet committed is
 * `preventDefault()` on a non-passive `touchmove`. A `pointermove` cannot
 * do it — `touch-action` is pointer events' only lever, and it is a
 * static property, so it would have to be set before knowing which
 * gesture this is. A mouse never scrolls by dragging, so nothing is lost
 * by the gesture being touch-only; the knob (vaul's own drag, which this
 * does not touch) still works with a mouse.
 *
 * **Nothing here re-renders.** The sheet is drawn by writing a transform
 * on `surfaceRef`, at touch rate. A React state per frame would re-render
 * the whole inspector — its tabs, a transcript, a comment list — between
 * the finger moving and the sheet following it.
 *
 * @param scroller The sheet's single scroller (`e082ed30` made it one),
 *   which is both the element the gesture is read from and the one whose
 *   offset decides who owns it. **The element itself, not a ref**: the
 *   drawer is not mounted at `peek`, so the node appears and disappears
 *   with the sheet's state, and a ref object would leave this effect
 *   attached to whatever was there when it last ran — on the first
 *   expansion, nothing.
 * @param surfaceRef The box that carries the sheet's visible surface.
 *   **Not `Drawer.Content`**: vaul writes that element's transform on
 *   every frame of its own drag and on every snap, so a transform written
 *   there is overwritten or fights it. A ref is enough here because it is
 *   only read from inside a handler, which cannot run before the node
 *   exists.
 * @param onCollapse Called once, when a gesture earned the collapse.
 */
export function useSheetPullToCollapse({
  scroller,
  surfaceRef,
  onCollapse,
}: {
  scroller: HTMLElement | null;
  surfaceRef: RefObject<HTMLElement | null>;
  onCollapse: () => void;
}): void {
  // Read through a ref so a new callback identity does not detach and
  // reattach the listeners — which, mid-gesture, would drop the gesture.
  const onCollapseRef = useRef(onCollapse);
  onCollapseRef.current = onCollapse;

  useEffect(() => {
    if (!scroller) return;

    let state: SheetPullState | null = null;
    let touchId: number | null = null;
    let startY = 0;
    let samples: { at: number; y: number }[] = [];

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

    const clearTransform = () => {
      const el = surface();
      if (!el) return;
      el.style.transition = "";
      el.style.transform = "";
    };

    const forget = () => {
      state = null;
      touchId = null;
      samples = [];
    };

    /**
     * The finger's downward speed at `at`, px/ms.
     *
     * The window is applied *here*, against the moment being asked about,
     * which is what makes a pause before the lift read as a pause: the
     * samples from before it fall outside and there is nothing left to
     * divide. Fewer than two inside the window is a finger that was not
     * moving, and 0 is the answer — never a pair from further back.
     */
    const velocityAt = (at: number) => {
      const recent = samples.filter(
        (sample) => at - sample.at <= VELOCITY_WINDOW_MS,
      );
      if (recent.length < 2) return 0;
      const first = recent[0];
      const last = recent[recent.length - 1];
      const elapsed = last.at - first.at;
      return elapsed > 0 ? (last.y - first.y) / elapsed : 0;
    };

    const onTouchStart = (event: TouchEvent) => {
      // A second finger is not a second gesture: it makes this one
      // ambiguous, so the sheet gives it up and springs back.
      if (event.touches.length !== 1) {
        if (state?.owner === "sheet") settle();
        forget();
        return;
      }
      const touch = event.touches[0];
      touchId = touch.identifier;
      startY = touch.clientY;
      samples = [{ at: event.timeStamp, y: touch.clientY }];
      state = beginSheetPull({
        scrollTop: scroller.scrollTop,
        maxScroll: scroller.scrollHeight - scroller.clientHeight,
      });
      // A settle still playing would otherwise animate the sheet toward
      // zero while the finger is asking for something else.
      clearTransform();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!state || touchId === null) return;
      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === touchId,
      );
      if (!touch) return;

      state = advanceSheetPull(state, {
        dy: touch.clientY - startY,
        // Clamped, because a bounce reads as a negative offset. iOS
        // Safari stretches an inner scroller past its own top, and a
        // negative reading feeds `advanceSheetPull` a `consumed` term as
        // large as the finger's own movement — so nothing accumulates
        // toward the handoff and condition 3 never fires there. A
        // stretching band reads as a pinned top instead. Chromium does
        // not draw the band, so this is the arithmetic being made safe
        // for a platform the browser suite cannot show, not a measured
        // fix.
        scrollTop: Math.max(0, scroller.scrollTop),
      });

      samples.push({ at: event.timeStamp, y: touch.clientY });
      // Trimmed here so the list stays bounded; the reading that matters
      // is taken against the release, in `velocityAt`.
      samples = samples.filter(
        (sample) => event.timeStamp - sample.at <= VELOCITY_WINDOW_MS,
      );

      if (state.owner !== "sheet") return;
      // Tell the browser not to treat this gesture as a scroll as well.
      //
      // **What it buys is a rubber band this repository cannot measure.**
      // Chromium does nothing either way here —
      // `e2e-components/sheet-gesture.spec.ts` is green with this line
      // deleted (measured) — and what it answers is iOS Safari, which
      // bounces an inner scroller past its own top: the band and the
      // sheet would be two answers to one finger.
      //
      // It fires on every direction the sheet owns, not only downward: a
      // gesture the sheet owns is one the scroller had no use for, but
      // `beginSheetPull` decides that from where the scroller stands and
      // not from where the finger goes, so an upward move inside an
      // already-owned gesture is refused too.
      //
      // `cancelable` is false once the browser has committed the gesture
      // to a scroll, which is the handoff case (condition 3).
      if (event.cancelable) event.preventDefault();
      draw(state.pull);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!state) return;
      const outcome = releaseSheetPull(state, velocityAt(event.timeStamp));
      forget();
      if (outcome === "dismiss") {
        // Reset before handing the state change over: the drawer is
        // unmounted at `peek`, and a surface left translated would come
        // back that way if it is ever reused.
        clearTransform();
        onCollapseRef.current();
        return;
      }
      settle();
    };

    const onTouchCancel = () => {
      const owned = state?.owner === "sheet";
      forget();
      if (owned) settle();
    };

    // `passive: false` on the move listener, explicitly: a passive
    // listener cannot call `preventDefault()` at all. It is not a
    // correction to a default — Chromium's passive-by-default for
    // `touchmove` applies to `window`, `document` and `document.body`,
    // and a listener added to an arbitrary element with no options is
    // already non-passive (measured: `cancelable` true,
    // `preventDefault()` effective, no console warning). It is written
    // because that is a per-engine default and this line is the one thing
    // the gesture cannot work without.
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
