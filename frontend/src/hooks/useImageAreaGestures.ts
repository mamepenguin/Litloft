"use client";

import { useCallback, useRef } from "react";
import type React from "react";

const SWIPE_MIN_PX = 50;
const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 300;
const EDGE_RATIO = 0.25;

interface Options {
  readingDirection: "ltr" | "rtl";
  navigatePrev: () => void;
  navigateNext: () => void;
  toggleControls: () => void;
}

export function useImageAreaGestures({
  readingDirection,
  navigatePrev,
  navigateNext,
  toggleControls,
}: Options) {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    },
    []
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = startRef.current;
      startRef.current = null;
      if (!s) return;

      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      // Horizontal swipe: right=next, left=prev.
      if (adx > SWIPE_MIN_PX && adx > ady) {
        if (dx > 0) {
          navigateNext();
        } else {
          navigatePrev();
        }
        return;
      }

      // Tap: short duration, small movement.
      if (
        Date.now() - s.t < TAP_MAX_MS &&
        adx < TAP_MAX_MOVE_PX &&
        ady < TAP_MAX_MOVE_PX
      ) {
        const rect = e.currentTarget.getBoundingClientRect();
        const rx = e.clientX - rect.left;
        const w = rect.width;

        if (rx < w * EDGE_RATIO) {
          // Left edge tap: same direction logic as buttons.
          readingDirection === "ltr" ? navigatePrev() : navigateNext();
        } else if (rx > w * (1 - EDGE_RATIO)) {
          // Right edge tap.
          readingDirection === "ltr" ? navigateNext() : navigatePrev();
        } else {
          // Center tap: toggle controls.
          toggleControls();
        }
      }
    },
    [readingDirection, navigatePrev, navigateNext, toggleControls]
  );

  const onPointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
