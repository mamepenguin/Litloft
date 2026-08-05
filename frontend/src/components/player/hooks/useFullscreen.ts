"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Fullscreen for a player frame, with a fallback for platforms that
 * have no element fullscreen at all.
 *
 * No Apple mobile browser implements `Element.requestFullscreen` —
 * measured on iPadOS, the standard and prefixed entry points and
 * fullscreenEnabled are all undefined. The one thing they can put
 * fullscreen, a `<video>` via `webkitEnterFullscreen()`, is out of
 * reach inside a cross-origin iframe. With the provider's controls
 * turned off there is no route left, so we fake it: pin the existing
 * frame over the viewport with `position: fixed`.
 *
 * The frame is styled in place and never re-parented. Moving an iframe
 * to a new parent reloads it, losing playback position and the player
 * API binding entirely.
 */

const HISTORY_MARKER = "litloftFullscreen";
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const LANDSCAPE_QUERY = "(orientation: landscape)";

/**
 * Vertical travel that counts as a request to change size: down for
 * "put this away", up for "fill the screen".
 */
const SWIPE_DISMISS_PX = 80;

/**
 * How much two fingers have to spread or close before it reads as a
 * deliberate pinch. Generous margins on both sides so an imprecise
 * two-finger tap does nothing at all.
 */
const PINCH_ENTER_RATIO = 1.25;
const PINCH_EXIT_RATIO = 0.8;

/**
 * Marks the scrub bar so swipes that begin there are left alone.
 * Dragging it travels vertically as often as not, and reading that as
 * a request to change size would make scrubbing impossible.
 *
 * Deliberately just the scrub bar. Marking the whole control bar meant
 * a swipe starting on the play button — dead centre of the frame, the
 * obvious place to put a finger — did nothing at all. Buttons have no
 * drag of their own, so the distance threshold is enough to tell a
 * deliberate swipe from a slip.
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

/** How the current fullscreen session was started. */
type EntryReason = "manual" | "rotate";

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
}

export interface FullscreenState {
  /** True for either backing mechanism. */
  isFullscreen: boolean;
  /** True only for the CSS fallback; drives the frame's layout swap. */
  isPseudo: boolean;
  toggle: () => void;
  exit: () => void;
}

/** Distance between the first two touch points. */
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
}: UseFullscreenOptions): FullscreenState {
  const [nativeActive, setNativeActive] = useState(false);
  const [pseudoActive, setPseudoActive] = useState(false);
  const entryReasonRef = useRef<EntryReason | null>(null);

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
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    const sync = () =>
      setNativeActive(
        frameRef.current != null && document.fullscreenElement === frameRef.current,
      );
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [frameRef]);

  const exit = useCallback(() => {
    entryReasonRef.current = null;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setPseudoActive(false);
  }, []);

  const isFullscreen = nativeActive || pseudoActive;

  // Mirrored so `enter` can bail out without being rebuilt — and
  // resubscribing the rotation listener — every time it changes.
  const isFullscreenRef = useRef(false);
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  const enter = useCallback(
    (reason: EntryReason) => {
      const frame = frameRef.current;
      if (!frame) return;
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
          entryReasonRef.current = reason;
          setPseudoActive(true);
        });
    },
    [frameRef],
  );

  const toggle = useCallback(() => {
    if (isFullscreen) {
      exit();
      return;
    }
    enter("manual");
  }, [isFullscreen, enter, exit]);

  // --- rotation ---

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
      if (entryReasonRef.current === "rotate") exit();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [autoRotateEnabled, enter, exit]);

  // --- escape ---

  useEffect(() => {
    // Native fullscreen handles Escape on its own.
    if (!pseudoActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pseudoActive, exit]);

  // --- swipe and pinch ---

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
      if (suppressSwipeRef.current) {
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
  }, [frameRef, enter, exit]);

  // --- document side effects ---

  useEffect(() => {
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

    // Read by useMiniPlayer: with no Fullscreen API involved there is
    // no fullscreenchange event for it to observe.
    root.dataset.playerFullscreen = "true";
    // position:fixed as well as overflow:hidden — iOS Safari scrolls
    // the background regardless of overflow alone.
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      delete root.dataset.playerFullscreen;
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [pseudoActive]);

  // --- history ---

  useEffect(() => {
    if (!pseudoActive) return;
    let ourEntryLive = true;
    window.history.pushState({ [HISTORY_MARKER]: true }, "");

    const onPopState = () => {
      // Still sitting on our own entry: something else was pushed on
      // top of us and popped off again, so this is not our cue.
      if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_MARKER]) {
        return;
      }
      ourEntryLive = false;
      exit();
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!ourEntryLive) return;
      // Unmounting means something else is already navigating; going
      // back here could cancel it. Leaving one stale entry behind is
      // the cheaper mistake.
      if (!mountedRef.current) return;
      if ((window.history.state as Record<string, unknown> | null)?.[HISTORY_MARKER]) {
        window.history.back();
      }
    };
  }, [pseudoActive, exit]);

  return { isFullscreen, isPseudo: pseudoActive, toggle, exit };
}
