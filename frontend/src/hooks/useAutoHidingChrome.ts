"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const CHROME_IDLE_MS = 2000;

export interface AutoHidingChrome {
  visible: boolean;
  show: () => void;
  toggle: () => void;
  /**
   * `inert` rather than `pointerEvents: none` alone — an `opacity: 0`
   * element keeps its place in the tab order.
   */
  chromeProps: {
    inert: boolean;
    "aria-hidden": boolean | undefined;
    style: { opacity: number; pointerEvents: "auto" | "none" };
    /**
     * On a coarse pointer the document listeners hear nothing a reader
     * does: `pointermove` is unbound there and iOS does not focus a
     * `<button>` on tap. Bound on the bar, where no toggle handler competes.
     */
    onPointerDown: () => void;
  };
}

export interface AutoHidingChromeOptions {
  enabled?: boolean;
  /**
   * For a panel the reader has opened over the frame: reading it is not
   * idleness, and withdrawing the bar out from under an open panel leaves
   * the panel floating with the control that opened it gone.
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
    // toggles there cancels itself.
    //
    // A moving mouse or pen counts on every device, a tablet's trackpad
    // included; a moving finger never does, because it is mid-swipe. Keys
    // and focus count everywhere: a tablet with a keyboard case has no
    // pointer to move but a reader all the same.
    const events = ["pointermove", "keydown", "focusin"];
    const onActivity = (e: Event) => {
      if (e.type === "pointermove" && (e as PointerEvent).pointerType === "touch") {
        return;
      }
      show();
    };
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
  }, [enabled, held, arm, show]);

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
