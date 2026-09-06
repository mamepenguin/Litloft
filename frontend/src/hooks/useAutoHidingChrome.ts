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
    /**
     * Touching the chrome restarts its clock.
     *
     * On a coarse pointer the document listeners hear nothing a reader
     * does: `pointermove` is unbound there and a tap on a button is not
     * reliably a `focusin` — iOS does not focus a `<button>` on tap. So
     * a bar summoned by a centre tap had a flat two seconds to live, and
     * withdrew mid-reach while the reader was on their way to it. Bound
     * on the bar, where no toggle handler competes.
     */
    onPointerDown: () => void;
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
export interface AutoHidingChromeOptions {
  /** False while the frame is closed: nothing to withdraw from. */
  enabled?: boolean;
  /**
   * Hold the chrome open. For a panel the reader has opened over the
   * frame: reading it is not idleness, and withdrawing the bar out from
   * under an open panel leaves the panel floating with the control that
   * opened it gone. Measured: 2.6s after opening the interval panel, the
   * bar was `opacity: 0` and `inert` while the panel stayed at full
   * opacity.
   */
  held?: boolean;
  idleMs?: number;
}

export function useAutoHidingChrome({
  enabled = true,
  held = false,
  idleMs = CHROME_IDLE_MS,
}: AutoHidingChromeOptions = {}): AutoHidingChrome {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<number | null>(null);
  const pointerMode = usePointerMode();

  const arm = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!enabled || held) return;
    timerRef.current = window.setTimeout(() => setVisible(false), idleMs);
  }, [enabled, held, idleMs]);

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
    if (held) setVisible(true);
    arm();

    // `pointerdown` is not here, on any device. The viewer's own centre
    // tap toggles the chrome, and a press that both restores here and
    // toggles there cancels itself: the bar appears for the length of
    // the press and is gone again on release, however many times you
    // try. That was written as a touch-only hazard and scoped out of the
    // coarse set alone; it cancels wherever both are bound, and a mouse
    // has `pointermove` to restore with anyway.
    //
    // Keys and focus count on every device: a tablet with a keyboard
    // case has no pointer to move but a reader all the same.
    const events: string[] =
      pointerMode === "coarse"
        ? ["keydown", "focusin"]
        : ["pointermove", "keydown", "focusin"];
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
  }, [enabled, held, pointerMode, arm, show]);

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
      onPointerDown: show,
    },
  };
}
