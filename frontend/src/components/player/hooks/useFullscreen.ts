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

/** Downward travel that counts as "put this away". */
const SWIPE_DISMISS_PX = 80;

/**
 * Marks the control bar so swipes that begin there are left alone.
 * Dragging the seek bar travels downward as often as not, and reading
 * that as a dismiss would make scrubbing impossible.
 */
const CONTROLS_SELECTOR = "[data-player-controls]";

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
}

export interface FullscreenState {
  /** True for either backing mechanism. */
  isFullscreen: boolean;
  /** True only for the CSS fallback; drives the frame's layout swap. */
  isPseudo: boolean;
  toggle: () => void;
  exit: () => void;
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
}: UseFullscreenOptions): FullscreenState {
  const [nativeActive, setNativeActive] = useState(false);
  const [pseudoActive, setPseudoActive] = useState(false);
  const entryReasonRef = useRef<EntryReason | null>(null);

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

  // --- swipe to dismiss ---

  useEffect(() => {
    if (!pseudoActive) return;
    const frame = frameRef.current;
    if (!frame) return;
    let start: { x: number; y: number } | null = null;

    const onTouchStart = (event: Event) => {
      const { touches } = event as TouchLikeEvent;
      // Pinch and other multi-finger gestures are not a dismiss.
      if (touches.length !== 1) {
        start = null;
        return;
      }
      const target = event.target as Element | null;
      if (target?.closest?.(CONTROLS_SELECTOR)) {
        start = null;
        return;
      }
      start = { x: touches[0].clientX, y: touches[0].clientY };
    };

    const onTouchEnd = (event: Event) => {
      if (!start) return;
      const point = (event as TouchLikeEvent).changedTouches[0];
      const from = start;
      start = null;
      if (!point) return;
      const dx = point.clientX - from.x;
      const dy = point.clientY - from.y;
      if (dy < SWIPE_DISMISS_PX) return;
      // A drag that travels further sideways is a scrub or a scroll
      // attempt, not a dismiss.
      if (Math.abs(dy) <= Math.abs(dx)) return;
      exit();
    };

    const onTouchCancel = () => {
      start = null;
    };

    frame.addEventListener("touchstart", onTouchStart, { passive: true });
    frame.addEventListener("touchend", onTouchEnd, { passive: true });
    frame.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      frame.removeEventListener("touchstart", onTouchStart);
      frame.removeEventListener("touchend", onTouchEnd);
      frame.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [pseudoActive, frameRef, exit]);

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
