"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DOMAttributes,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { MediaController } from "@/lib/mediaController";
import type { PointerMode } from "@/components/player/hooks/usePointerMode";

/** How long a finger has to stay put before the speed boost engages. */
const LONG_PRESS_MS = 500;
/** Included in PLAYBACK_RATES; YouTube ignores rates outside that set. */
export const BOOST_RATE = 2;
/** Travel that hands the gesture over to a scroll or a swipe. */
const MOVE_CANCEL_PX = 10;
/** Gap within which a second tap counts as a double tap. */
const DOUBLE_TAP_MS = 300;
/** How long a skip stays open for further taps, and stays on screen. */
const SKIP_ACCUMULATE_MS = 800;
const SKIP_SECONDS = 10;
/**
 * How long a single click waits to see whether it is really the first
 * half of a double-click. Matches the delay mainstream players use.
 */
const CLICK_RESOLVE_MS = 220;

export type SkipSide = "back" | "forward";

export interface SkipFeedback {
  side: SkipSide;
  /** Running total for this burst of taps, not the size of one hop. */
  seconds: number;
}

export interface UsePlayerGesturesOptions {
  mc: MediaController | null;
  mode: PointerMode;
  /** False while an ad or the end screen owns the frame. */
  interactive: boolean;
  /** True while the player's clock belongs to an ad. */
  interrupted: boolean;
  duration: number;
  /** Rate to return to when a long press ends. */
  preferredRate: number;
  /** Single tap on touch. */
  onToggleControls: () => void;
  /** A skip took over; get the bar out of the way. */
  onHideControls: () => void;
  /** Single click with a mouse. */
  onTogglePlay: () => void;
  /** Double click with a mouse. */
  onToggleFullscreen: () => void;
}

export type GestureHandlers = Pick<
  DOMAttributes<HTMLElement>,
  "onClick" | "onDoubleClick" | "onPointerDown"
>;

export interface PlayerGestures {
  /** Spread onto the overlay element. */
  handlers: GestureHandlers;
  /** Non-null while the skip feedback should be on screen. */
  skip: SkipFeedback | null;
  /** True while the long-press speed boost is engaged. */
  boosting: boolean;
}

interface ActivePress {
  x: number;
  y: number;
  side: SkipSide;
  /** Travelled too far, or otherwise no longer a candidate for a tap. */
  cancelled: boolean;
  /** The long press completed and the rate is currently overridden. */
  boosted: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface SkipBurst extends SkipFeedback {
  /** Timestamp of the most recent tap in this burst. */
  at: number;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Touch gestures over a player frame: long press to boost the speed,
 * double tap either side to skip, single tap to surface the controls.
 * Mouse input keeps the click / double-click behaviour it always had.
 *
 * Everything the handlers read lives in refs. The overlay attaches
 * window listeners for the duration of a press — a finger that leaves
 * the frame mid-gesture must still deliver its pointerup, or the boost
 * would stick at 2x with nothing left to release it.
 */
export function usePlayerGestures({
  mc,
  mode,
  interactive,
  interrupted,
  duration,
  preferredRate,
  onToggleControls,
  onHideControls,
  onTogglePlay,
  onToggleFullscreen,
}: UsePlayerGesturesOptions): PlayerGestures {
  const [skip, setSkip] = useState<SkipFeedback | null>(null);
  const [boosting, setBoosting] = useState(false);

  // Mirrored so the window listeners and timers always read current
  // values without being torn down and rebuilt on every render.
  const mcRef = useRef(mc);
  const modeRef = useRef(mode);
  const interactiveRef = useRef(interactive);
  const interruptedRef = useRef(interrupted);
  const durationRef = useRef(duration);
  const preferredRateRef = useRef(preferredRate);
  const callbacksRef = useRef({
    onToggleControls,
    onHideControls,
    onTogglePlay,
    onToggleFullscreen,
  });

  useEffect(() => {
    mcRef.current = mc;
    modeRef.current = mode;
    interactiveRef.current = interactive;
    interruptedRef.current = interrupted;
    durationRef.current = duration;
    preferredRateRef.current = preferredRate;
    callbacksRef.current = {
      onToggleControls,
      onHideControls,
      onTogglePlay,
      onToggleFullscreen,
    };
  });

  const pressRef = useRef<ActivePress | null>(null);
  const lastTapRef = useRef<{ at: number; side: SkipSide } | null>(null);
  const burstRef = useRef<SkipBurst | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held so pointerdown can hand the same references to removeEventListener.
  const detachRef = useRef<(() => void) | null>(null);

  const restoreRate = useCallback(() => {
    setBoosting(false);
    try {
      mcRef.current?.setPlaybackRate(preferredRateRef.current);
    } catch {
      // Player may be mid-teardown; nothing useful to do here.
    }
  }, []);

  const applySkip = useCallback((side: SkipSide, seconds: number, at: number) => {
    const controller = mcRef.current;
    if (!controller) return;
    // Each tap is a single ten second hop from wherever the playhead
    // now is; `seconds` is only the running total shown on screen.
    const delta = side === "forward" ? SKIP_SECONDS : -SKIP_SECONDS;
    let target: number;
    try {
      target = controller.getCurrentTime() + delta;
    } catch {
      return;
    }
    if (!Number.isFinite(target)) return;
    const total = durationRef.current;
    if (target < 0) target = 0;
    if (total > 0 && target > total) target = total;
    try {
      controller.seek(target);
    } catch {
      return;
    }

    burstRef.current = { side, seconds, at };
    setSkip({ side, seconds });
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => {
      burstTimerRef.current = null;
      burstRef.current = null;
      setSkip(null);
    }, SKIP_ACCUMULATE_MS);
  }, []);

  const handleTap = useCallback(
    (side: SkipSide) => {
      const now = Date.now();
      const controller = mcRef.current;

      // An ad's clock is not the file's, so a skip would land somewhere
      // meaningless. Surfacing the controls is still fair game.
      if (controller && !interruptedRef.current) {
        const burst = burstRef.current;
        if (burst && now - burst.at < SKIP_ACCUMULATE_MS) {
          const seconds = side === burst.side ? burst.seconds + SKIP_SECONDS : SKIP_SECONDS;
          applySkip(side, seconds, now);
          return;
        }
        const last = lastTapRef.current;
        if (last && last.side === side && now - last.at <= DOUBLE_TAP_MS) {
          lastTapRef.current = null;
          applySkip(side, SKIP_SECONDS, now);
          callbacksRef.current.onHideControls();
          return;
        }
      }

      lastTapRef.current = { at: now, side };
      callbacksRef.current.onToggleControls();
    },
    [applySkip],
  );

  const endPress = useCallback(
    (cancelled: boolean) => {
      const press = pressRef.current;
      pressRef.current = null;
      detachRef.current?.();
      detachRef.current = null;
      if (!press) return;
      if (press.timer) clearTimeout(press.timer);

      if (press.boosted) {
        // The release that ends a boost is not also a tap: toggling the
        // controls every time someone lets go would be maddening.
        restoreRate();
        return;
      }
      if (press.cancelled || cancelled) return;
      handleTap(press.side);
    },
    [handleTap, restoreRate],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (modeRef.current !== "coarse" || !interactiveRef.current) return;
      // A second finger mid-gesture: let the first one finish rather
      // than tracking two presses at once.
      if (pressRef.current) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const side: SkipSide =
        rect.width > 0 && event.clientX - rect.left < rect.width / 2 ? "back" : "forward";

      const press: ActivePress = {
        x: event.clientX,
        y: event.clientY,
        side,
        cancelled: false,
        boosted: false,
        timer: null,
      };
      pressRef.current = press;

      press.timer = setTimeout(() => {
        press.timer = null;
        if (press.cancelled || pressRef.current !== press) return;
        const controller = mcRef.current;
        if (!controller || interruptedRef.current) return;
        try {
          // A boost on a still player is nothing but a surprise when it
          // starts moving again.
          if (controller.isPaused()) return;
          controller.setPlaybackRate(BOOST_RATE);
        } catch {
          return;
        }
        press.boosted = true;
        setBoosting(true);
      }, LONG_PRESS_MS);

      const onMove = (moveEvent: Event) => {
        const active = pressRef.current;
        // Once engaged the boost holds while the finger wanders, the
        // way it does in the YouTube app.
        if (!active || active.boosted) return;
        const { clientX, clientY } = moveEvent as unknown as {
          clientX: number;
          clientY: number;
        };
        if (distance(clientX, clientY, active.x, active.y) > MOVE_CANCEL_PX) {
          active.cancelled = true;
          if (active.timer) clearTimeout(active.timer);
          active.timer = null;
        }
      };
      const onUp = () => endPress(false);
      const onCancel = () => endPress(true);

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      detachRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };
    },
    [endPress],
  );

  const handleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (modeRef.current !== "fine" || !interactiveRef.current) return;
    // detail 0 means a programmatic click; only a real one should drive
    // playback.
    if (!event.detail) return;
    if (clickTimerRef.current) return;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      callbacksRef.current.onTogglePlay();
    }, CLICK_RESOLVE_MS);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (modeRef.current !== "fine" || !interactiveRef.current) return;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    callbacksRef.current.onToggleFullscreen();
  }, []);

  // An ad can start under a planted finger. The rate applies to
  // whatever the player is showing, so a mid-roll would otherwise run
  // at 2x until the viewer let go.
  useEffect(() => {
    if (!boosting) return;
    if (interactive && !interrupted) return;
    restoreRate();
    const press = pressRef.current;
    if (press) {
      press.boosted = false;
      // Not a tap either: the finger is still down from a gesture that
      // was taken away, and toggling the controls on release would be
      // an event the viewer never asked for.
      press.cancelled = true;
    }
  }, [boosting, interactive, interrupted, restoreRate]);

  useEffect(
    () => () => {
      detachRef.current?.();
      if (pressRef.current?.timer) clearTimeout(pressRef.current.timer);
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    },
    [],
  );

  return {
    handlers: {
      onClick: handleClick,
      onDoubleClick: handleDoubleClick,
      onPointerDown: handlePointerDown,
    },
    skip,
    boosting,
  };
}
