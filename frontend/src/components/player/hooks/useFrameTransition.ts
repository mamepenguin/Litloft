"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import {
  ENTRY_TIMING,
  EXIT_TIMING,
  FULL_LOOK,
  inlineLook,
  type Box,
  type FrameLook,
  type Viewport,
} from "./fullscreenKeyframes";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MOVING_MARKER = "fullscreenMoving";

/**
 * How long to wait for the frame to be seen at its new size. The callers
 * switch their pin classes on different commits — one of them a commit
 * after an effect — so the change can land a frame or two late.
 */
const SIZE_WAIT_MS = 500;

interface Captured {
  rect: Box;
  radius: number;
  /** The pinned frame's own box, recorded when the entry is carried. */
  pinned: Viewport | null;
}

export interface FrameTransition {
  /** Record the inline box. Only a captured entry is ever carried, in or out. */
  capture: () => void;
  /** Drop the capture, so the next entry and exit are instant. */
  forget: () => void;
  /** Carry the frame from its inline box to the viewport, or turn a shrink around. */
  grow: () => void;
  /**
   * Carry the frame back to its inline box, then call `settle`. Calls it
   * straight away when the frame cannot be carried.
   */
  shrink: (settle: () => void) => void;
  isMoving: () => boolean;
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * On an iPhone, carrying the frame on a pinch-zoomed page sent it towards
 * the top-left corner before it landed; a zoomed page switches instantly.
 */
function zoomed(): boolean {
  return (window.visualViewport?.scale ?? 1) !== 1;
}

function supported(frame: HTMLElement): boolean {
  return typeof frame.animate === "function" && typeof ResizeObserver === "function";
}

/**
 * Read from the frame rather than compared with `innerWidth`: on iOS a
 * pinch-zoomed page reports the zoomed viewport there, while the pinned
 * frame keeps the layout viewport's size.
 */
function isPinned(frame: HTMLElement): boolean {
  return getComputedStyle(frame).position === "fixed";
}

/** The layout box, which the transform drawing it elsewhere does not change. */
function boxOf(frame: HTMLElement): Viewport {
  return { width: frame.offsetWidth, height: frame.offsetHeight };
}

function currentLook(frame: HTMLElement): FrameLook {
  const style = getComputedStyle(frame);
  return { transform: style.transform, clipPath: style.clipPath };
}

export function useFrameTransition(
  frameRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): FrameTransition {
  // Read through a ref so the returned functions keep one identity: the
  // fullscreen hook's history effect depends on them, and rebuilding it
  // pushes and pops a history entry.
  const argsRef = useRef({ frameRef, enabled });
  useLayoutEffect(() => {
    argsRef.current = { frameRef, enabled };
  });
  const frameOf = useCallback(() => argsRef.current.frameRef.current, []);
  const capturedRef = useRef<Captured | null>(null);
  const animationsRef = useRef<Animation[]>([]);
  const stopWatchingRef = useRef<(() => void) | null>(null);

  const stopWatching = useCallback(() => {
    stopWatchingRef.current?.();
    stopWatchingRef.current = null;
  }, []);

  /**
   * Run `onMatch` in the observer callback — after layout, before paint —
   * once the frame is or is no longer pinned; `onTimeout` if that never comes.
   */
  const watchPin = useCallback(
    (frame: HTMLElement, pinned: boolean, onMatch: () => void, onTimeout: () => void) => {
      stopWatching();
      const observer = new ResizeObserver(() => {
        if (isPinned(frame) !== pinned) return;
        stopWatching();
        onMatch();
      });
      const timeout = window.setTimeout(() => {
        stopWatching();
        onTimeout();
      }, SIZE_WAIT_MS);
      observer.observe(frame, { box: "border-box" });
      stopWatchingRef.current = () => {
        observer.disconnect();
        window.clearTimeout(timeout);
      };
    },
    [stopWatching],
  );

  const clear = useCallback((frame: HTMLElement | null) => {
    for (const animation of animationsRef.current) animation.cancel();
    animationsRef.current = [];
    if (frame) delete frame.dataset[MOVING_MARKER];
  }, []);

  const run = useCallback(
    (
      frame: HTMLElement,
      from: FrameLook,
      to: FrameLook,
      timing: { duration: number; easing: string },
      fill: FillMode,
    ): Animation[] => {
      clear(frame);
      frame.dataset[MOVING_MARKER] = "true";
      const options: KeyframeAnimationOptions = { ...timing, fill };
      const animations = [
        frame.animate(
          [
            { transform: from.transform, transformOrigin: "0 0" },
            { transform: to.transform, transformOrigin: "0 0" },
          ],
          options,
        ),
        frame.animate([{ clipPath: from.clipPath }, { clipPath: to.clipPath }], options),
      ];
      animationsRef.current = animations;
      return animations;
    },
    [clear],
  );

  const canCarry = useCallback((): boolean => {
    const frame = frameOf();
    return (
      argsRef.current.enabled &&
      frame != null &&
      capturedRef.current != null &&
      supported(frame) &&
      !reducedMotion() &&
      !zoomed()
    );
  }, [frameOf]);

  const capture = useCallback(() => {
    const frame = frameOf();
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    capturedRef.current = {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      radius: parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0,
      pinned: null,
    };
  }, [frameOf]);

  const forget = useCallback(() => {
    capturedRef.current = null;
  }, []);

  const grow = useCallback(() => {
    const frame = frameOf();
    const captured = capturedRef.current;
    if (!frame || !captured || !canCarry()) return;
    const start = (from: FrameLook) => {
      const [transform] = run(frame, from, FULL_LOOK, ENTRY_TIMING, "none");
      transform.onfinish = () => clear(frame);
    };
    if (animationsRef.current.length > 0) {
      // Turning a shrink around: the frame is still pinned, so start from
      // where it is drawn now rather than jumping to either end.
      stopWatching();
      start(currentLook(frame));
      return;
    }
    watchPin(
      frame,
      true,
      () => {
        captured.pinned = boxOf(frame);
        start(inlineLook(captured.rect, captured.radius, captured.pinned));
      },
      () => {},
    );
  }, [canCarry, clear, frameOf, run, stopWatching, watchPin]);

  const shrink = useCallback(
    (settle: () => void) => {
      const frame = frameOf();
      // `pinned` is recorded only once the entry has been carried, so an
      // entry still waiting for its pin, or never carried, leaves at once.
      const pinned = capturedRef.current?.pinned;
      const box = frame ? boxOf(frame) : null;
      const captured = capturedRef.current;
      if (
        !frame ||
        !captured ||
        !pinned ||
        !canCarry() ||
        pinned.width !== box?.width ||
        pinned.height !== box?.height
      ) {
        stopWatching();
        clear(frame);
        settle();
        return;
      }
      const from = animationsRef.current.length > 0 ? currentLook(frame) : FULL_LOOK;
      const [transform] = run(
        frame,
        from,
        inlineLook(captured.rect, captured.radius, pinned),
        EXIT_TIMING,
        "forwards",
      );
      transform.onfinish = () => {
        // The last keyframe is held so the frame keeps looking inline until
        // the caller has actually dropped its pin classes.
        watchPin(frame, false, () => clear(frame), () => clear(frame));
        settle();
      };
    },
    [canCarry, clear, frameOf, run, stopWatching, watchPin],
  );

  useEffect(() => {
    const onResize = () => {
      for (const animation of animationsRef.current) animation.finish();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(
    () => () => {
      stopWatching();
      clear(frameOf());
    },
    [clear, frameOf, stopWatching],
  );

  const isMoving = useCallback(() => animationsRef.current.length > 0, []);

  return useMemo(
    () => ({ capture, forget, grow, shrink, isMoving }),
    [capture, forget, grow, shrink, isMoving],
  );
}
