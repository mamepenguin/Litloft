"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useShortcuts } from "@/hooks/useShortcuts";
import { shellAnswersImmersive } from "@/lib/nativeBridge";
import { holdImmersive, type ImmersiveHold } from "@/lib/shellImmersive";
import { useFrameTransition } from "./useFrameTransition";

/**
 * No Apple mobile browser implements `Element.requestFullscreen`, so the
 * fallback pins the existing frame over the viewport with `position: fixed`.
 *
 * The frame is styled in place and never re-parented. Moving an iframe
 * to a new parent reloads it, losing playback position and the player
 * API binding entirely.
 */

const HISTORY_MARKER = "litloftFullscreen";
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const LANDSCAPE_QUERY = "(orientation: landscape)";

const SWIPE_DISMISS_PX = 80;

/** Generous margins on both sides so an imprecise two-finger tap does nothing at all. */
const PINCH_ENTER_RATIO = 1.25;
const PINCH_EXIT_RATIO = 0.8;

/**
 * Swipes that begin on the scrub bar are left alone: dragging it travels
 * vertically as often as not. Deliberately just the scrub bar, so a swipe
 * starting on the play button still works.
 */
const SCRUB_SELECTOR = "[data-player-scrub]";

interface TouchPoint {
  clientX: number;
  clientY: number;
}

interface TouchLikeEvent extends Event {
  touches: ArrayLike<TouchPoint>;
  changedTouches: ArrayLike<TouchPoint>;
}

type EntryReason = "manual" | "rotate";
/**
 * "opening" waits for the iOS shell to widen the page before anything is
 * pinned, so the entry is measured and carried in the viewport it ends in.
 */
type PseudoPhase = "off" | "opening" | "on" | "closing";

export interface UseFullscreenOptions {
  frameRef: RefObject<HTMLElement | null>;
  /**
   * Whether rotating to landscape should open fullscreen by itself.
   * Callers pass "is playing" — auto-opening on an idle or stopped
   * player is startling rather than helpful.
   */
  autoRotateEnabled: boolean;
  /**
   * Hold the swipe-to-dismiss while another gesture owns the video.
   * The long-press speed boost keeps a finger planted on the frame, and
   * the drift that comes with it would otherwise read as "put this
   * away" — dropping the viewer out of fullscreen mid-gesture.
   */
  suppressSwipe?: boolean;
  /**
   * Carry the frame between its slot and the viewport. Off where the
   * picture is not drawn by the page and so cannot follow the frame.
   */
  animate?: boolean;
}

export interface FullscreenState {
  isFullscreen: boolean;
  isPseudo: boolean;
  toggle: () => void;
  exit: () => void;
}

function spread(touches: ArrayLike<TouchPoint>): number {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}

function matches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
}

function requestNativeFullscreen(frame: HTMLElement): Promise<void> {
  if (typeof frame.requestFullscreen !== "function") {
    return Promise.reject(new Error("element fullscreen unsupported"));
  }
  try {
    return Promise.resolve(frame.requestFullscreen());
  } catch (error) {
    // Some engines throw synchronously instead of rejecting.
    return Promise.reject(error);
  }
}

export function useFullscreen({
  frameRef,
  autoRotateEnabled,
  suppressSwipe = false,
  animate = true,
}: UseFullscreenOptions): FullscreenState {
  const [nativeActive, setNativeActive] = useState(false);
  // "closing" keeps the frame pinned while it is carried back to its slot;
  // everything that asks "are we fullscreen?" already reads it as out.
  const [phase, setPhase] = useState<PseudoPhase>("off");
  const pseudoActive = phase === "on" || phase === "closing";
  const pseudoOpen = phase === "on";
  // Decisions read the phase synchronously: a second press can arrive
  // before the first one's render.
  const phaseRef = useRef<PseudoPhase>("off");
  const moveTo = useCallback((next: PseudoPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const transition = useFrameTransition(frameRef, animate);
  const entryReasonRef = useRef<EntryReason | null>(null);
  const historyEntryLiveRef = useRef(false);
  const immersiveRef = useRef<ImmersiveHold | null>(null);
  const releaseImmersive = useCallback(() => {
    immersiveRef.current?.release();
    immersiveRef.current = null;
  }, []);
  const settleOff = useCallback(() => {
    moveTo("off");
    releaseImmersive();
  }, [moveTo, releaseImmersive]);
  useEffect(() => releaseImmersive, [releaseImmersive]);

  // Read through a ref rather than a dependency: rebuilding the touch
  // listeners mid-gesture would drop the in-flight start point.
  const suppressSwipeRef = useRef(suppressSwipe);
  useEffect(() => {
    suppressSwipeRef.current = suppressSwipe;
  }, [suppressSwipe]);

  // Declared first so its cleanup runs before the others on unmount:
  // React tears effects down in the order they were defined, and the
  // history effect needs to know it is unmounting rather than closing.
  const mountedRef = useRef(true);
  // Set on every mount as well: StrictMode unmounts and mounts again.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sync = () =>
      setNativeActive(
        frameRef.current != null && document.fullscreenElement === frameRef.current,
      );
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [frameRef]);

  const unwindHistoryEntry = useCallback(() => {
    if (!historyEntryLiveRef.current) return;
    historyEntryLiveRef.current = false;
    if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_MARKER]) {
      window.history.back();
    }
  }, []);

  const leave = useCallback(
    (carry: boolean) => {
      entryReasonRef.current = null;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      unwindHistoryEntry();
      if (phaseRef.current === "opening") {
        settleOff();
        return;
      }
      if (phaseRef.current !== "on") return;
      moveTo("closing");
      if (!carry) transition.forget();
      transition.shrink(settleOff);
    },
    [moveTo, settleOff, transition, unwindHistoryEntry],
  );

  const exit = useCallback(() => leave(true), [leave]);

  const isFullscreen = nativeActive || pseudoOpen;

  // Mirrored so `enter` can bail out without being rebuilt — and
  // resubscribing the rotation listener — every time it changes.
  const isFullscreenRef = useRef(false);
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  const pin = useCallback(
    (reason: EntryReason) => {
      // Measured before the frame is pinned, which is the only moment
      // it still sits in its slot. Rotation is never carried: the
      // viewport itself is changing under it.
      if (reason === "manual") transition.capture();
      else transition.forget();
      moveTo("on");
      transition.grow();
    },
    [moveTo, transition],
  );

  const enter = useCallback(
    (reason: EntryReason) => {
      const frame = frameRef.current;
      if (!frame) return;
      if (phaseRef.current === "closing") {
        // Still pinned on its way out: turn it around where it is.
        entryReasonRef.current = reason;
        moveTo("on");
        transition.grow();
        return;
      }
      // Already open. Without this, rotating to landscape while
      // manually fullscreen would relabel the session as "rotate" and
      // then eject the viewer the moment they sat back up.
      if (isFullscreenRef.current) return;
      // Recorded only once the request has actually succeeded, so a
      // rejected attempt leaves no stale reason behind.
      requestNativeFullscreen(frame)
        .then(() => {
          entryReasonRef.current = reason;
        })
        .catch(() => {
          // Only stand in for the real thing on touch devices. On a
          // fine pointer this would just collide with the mini player,
          // and a desktop browser without element fullscreen is a
          // non-case.
          if (!matches(COARSE_POINTER_QUERY)) return;
          // Refused after unmount, or after another press already took
          // the pseudo path while this refusal was on its way.
          if (!mountedRef.current || phaseRef.current !== "off") return;
          entryReasonRef.current = reason;
          const hold = holdImmersive();
          immersiveRef.current = hold;
          if (!shellAnswersImmersive()) {
            pin(reason);
            return;
          }
          moveTo("opening");
          void hold.ready.then(() => {
            // A frame later, so the resize WebKit dispatches for the
            // widening has run and cannot cut the carry short.
            requestAnimationFrame(() => {
              if (immersiveRef.current !== hold || phaseRef.current !== "opening") return;
              pin(reason);
            });
          });
        });
    },
    [frameRef, moveTo, pin, transition],
  );

  const toggle = useCallback(() => {
    if (isFullscreen) {
      exit();
      return;
    }
    enter("manual");
  }, [isFullscreen, enter, exit]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    if (!matches(COARSE_POINTER_QUERY)) return;
    const mq = window.matchMedia(LANDSCAPE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        if (autoRotateEnabled) enter("rotate");
        return;
      }
      // Only undo what rotation itself opened. Someone who asked for
      // fullscreen explicitly should keep it when they sit up.
      if (entryReasonRef.current === "rotate") leave(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [autoRotateEnabled, enter, leave]);

  // Registered on the shortcut stack rather than on `window` so a dialog
  // opened over the player wins the press. Plain tier, deliberately: in the
  // overlay tier it would outrank every tier-0 Escape in the app.
  //
  // `editingOnly: false` because a comment box or a rename field can
  // hold focus while the player fills the screen.
  useShortcuts(
    "player-pseudo-fullscreen",
    "Player",
    [
      {
        key: "escape",
        label: "Exit fullscreen",
        editingOnly: false,
        hidden: true,
        handler: exit,
      },
    ],
    pseudoOpen,
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // Both directions are touch idioms. On a fine pointer the button
    // and the `f` shortcut are the routes in and out.
    if (!matches(COARSE_POINTER_QUERY)) return;

    let start: { x: number; y: number } | null = null;
    let pinchFrom: number | null = null;
    let pinchTo: number | null = null;

    const forget = () => {
      start = null;
      pinchFrom = null;
      pinchTo = null;
    };

    const onTouchStart = (event: Event) => {
      if (suppressSwipeRef.current) {
        forget();
        return;
      }
      const { touches } = event as TouchLikeEvent;

      if (touches.length === 2) {
        start = null;
        pinchFrom = spread(touches);
        pinchTo = pinchFrom;
        return;
      }
      if (touches.length !== 1) {
        forget();
        return;
      }
      pinchFrom = null;
      pinchTo = null;

      const target = event.target as Element | null;
      if (target?.closest?.(SCRUB_SELECTOR)) {
        start = null;
        return;
      }
      start = { x: touches[0].clientX, y: touches[0].clientY };
    };

    const onTouchMove = (event: Event) => {
      if (pinchFrom === null) return;
      const { touches } = event as TouchLikeEvent;
      if (touches.length !== 2) return;
      // The end of a pinch reports one finger at most, so the spread
      // has to be captured while both are still down.
      pinchTo = spread(touches);
    };

    const onTouchEnd = (event: Event) => {
      // The decisive check: a long press only becomes a boost partway
      // through the touch, so the flag is usually still false at
      // touchstart and true by the time the finger lifts.
      if (suppressSwipeRef.current || transition.isMoving()) {
        forget();
        return;
      }

      if (pinchFrom !== null) {
        const from = pinchFrom;
        const to = pinchTo;
        forget();
        if (to === null || from <= 0) return;
        const ratio = to / from;
        if (ratio >= PINCH_ENTER_RATIO) enter("manual");
        else if (ratio <= PINCH_EXIT_RATIO) exit();
        return;
      }

      if (!start) return;
      const point = (event as TouchLikeEvent).changedTouches[0];
      const from = start;
      forget();
      if (!point) return;
      const dx = point.clientX - from.x;
      const dy = point.clientY - from.y;
      // A drag that travels further sideways is a scrub or a scroll
      // attempt, not a request to change size.
      if (Math.abs(dy) <= Math.abs(dx)) return;
      if (dy >= SWIPE_DISMISS_PX) exit();
      else if (dy <= -SWIPE_DISMISS_PX) enter("manual");
    };

    const onTouchCancel = forget;

    frame.addEventListener("touchstart", onTouchStart, { passive: true });
    frame.addEventListener("touchmove", onTouchMove, { passive: true });
    frame.addEventListener("touchend", onTouchEnd, { passive: true });
    frame.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      frame.removeEventListener("touchstart", onTouchStart);
      frame.removeEventListener("touchmove", onTouchMove);
      frame.removeEventListener("touchend", onTouchEnd);
      frame.removeEventListener("touchcancel", onTouchCancel);
    };
    // Deliberately not keyed on whether we are currently fullscreen:
    // the same listeners serve both directions, and rebuilding them on
    // every transition would drop a gesture already in flight.
  }, [frameRef, enter, exit, transition]);

  // A layout effect so the page is locked and released in the same paint
  // as the caller's pin classes change, never a frame apart.
  useLayoutEffect(() => {
    if (!pseudoActive) return;
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };

    // `globals.css` unsticks the phone player's box on this: a frame pinned
    // inside a sticky box is not painted over the chrome on iOS.
    root.dataset.playerFullscreen = "true";
    // The box carries no stacking context any more, so the tier the pinned
    // frame needs is set on the frame itself.
    const frame = frameRef.current;
    if (frame) frame.dataset.pseudoFullscreen = "true";
    // position:fixed as well as overflow:hidden — iOS Safari scrolls
    // the background regardless of overflow alone.
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      delete root.dataset.playerFullscreen;
      if (frame) delete frame.dataset.pseudoFullscreen;
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [pseudoActive, frameRef]);

  useEffect(() => {
    if (!pseudoOpen) return;
    historyEntryLiveRef.current = true;
    window.history.pushState({ [HISTORY_MARKER]: true }, "");

    const onPopState = () => {
      // Still sitting on our own entry: something else was pushed on
      // top of us and popped off again, so this is not our cue.
      if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_MARKER]) {
        return;
      }
      historyEntryLiveRef.current = false;
      exit();
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!historyEntryLiveRef.current) return;
      // Unmounting means something else is already navigating; going
      // back here could cancel it. Leaving one stale entry behind is
      // the cheaper mistake.
      if (!mountedRef.current) return;
      unwindHistoryEntry();
    };
  }, [pseudoOpen, exit, unwindHistoryEntry]);

  return { isFullscreen, isPseudo: pseudoActive, toggle, exit };
}
