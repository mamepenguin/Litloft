"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePointerMode } from "@/components/player/hooks/usePointerMode";

/** How long the frame goes untouched before its chrome withdraws. */
export const CHROME_IDLE_MS = 2000;

export interface AutoHidingChrome {
  visible: boolean;
  /** Bring the chrome back and restart the clock. */
  show: () => void;
  /** The tap path: coarse pointers have no hover to withdraw from. */
  toggle: () => void;
  /**
   * Spread onto each chrome container. `inert` rather than
   * `pointerEvents: none` alone — `DESIGN.md` §Layering asks for chrome
   * that is out of reach, not merely out of sight, and an `opacity: 0`
   * element keeps its place in the tab order.
   */
  chromeProps: {
    inert: boolean;
    "aria-hidden": boolean | undefined;
    style: { opacity: number; pointerEvents: "auto" | "none" };
  };
}

/**
 * Chrome that withdraws when the frame is left alone.
 *
 * Withdrawing was tied to slideshow playback in both viewers, so a
 * reader looking at one image kept the bar over it forever; and it came
 * back only on a click on the image, so moving the mouse to see what was
 * underneath did nothing. Neither condition was about the chrome.
 *
 * Restored by any sign of a reader: pointer movement, a press, a key, or
 * focus arriving. On a coarse pointer there is no movement to read, so
 * the pointer events are not bound there and the viewer's own tap
 * handler calls `toggle` instead.
 */
export function useAutoHidingChrome(
  enabled = true,
  idleMs = CHROME_IDLE_MS,
): AutoHidingChrome {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<number | null>(null);
  const pointerMode = usePointerMode();

  const arm = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!enabled) return;
    timerRef.current = window.setTimeout(() => setVisible(false), idleMs);
  }, [enabled, idleMs]);

  const show = useCallback(() => {
    setVisible(true);
    arm();
  }, [arm]);

  const toggle = useCallback(() => {
    setVisible((v) => !v);
    arm();
  }, [arm]);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }
    arm();

    // Keys and focus count on every device: a tablet with a keyboard
    // case has no pointer to move but a reader all the same. Pointer
    // events are bound only where they mean something — on a touch
    // screen a tap would both restore here and toggle in the viewer's
    // own handler, and the two would cancel out.
    const events: string[] =
      pointerMode === "coarse"
        ? ["keydown", "focusin"]
        : ["pointermove", "pointerdown", "keydown", "focusin"];
    const onActivity = () => show();
    for (const type of events) {
      document.addEventListener(type, onActivity, true);
    }
    return () => {
      for (const type of events) {
        document.removeEventListener(type, onActivity, true);
      }
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, pointerMode, arm, show]);

  return {
    visible,
    show,
    toggle,
    chromeProps: {
      inert: !visible,
      "aria-hidden": visible ? undefined : true,
      style: {
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      },
    },
  };
}
