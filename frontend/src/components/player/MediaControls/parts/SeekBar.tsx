"use client";

import { useCallback, useRef, type CSSProperties } from "react";
import { useTranslations } from "next-intl";

const ROW_PX = 40;
const LINE_PX = 12;

/** Rounding keeps float noise (0.42 * 100 === 42.00000000000001) out of
 *  the rendered style. */
export function toPercent(fraction: number): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return `${Math.round(clamped * 1000) / 10}%`;
}

/**
 * Treating *every* keydown as the start of a scrub means Tab-ing through
 * the bar commits a seek, and the YouTube player re-buffers on any seekTo.
 */
const SCRUB_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const SEEK_INPUT_CLASS =
  "h-full w-full cursor-pointer touch-none appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed " +
  "[&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:bg-transparent " +
  "[&::-webkit-slider-runnable-track]:[margin-top:var(--seek-track-offset)] " +
  "[&::-moz-range-track]:h-3 [&::-moz-range-track]:bg-transparent " +
  "[&::-moz-range-track]:[margin-top:var(--seek-track-offset)] " +
  // -6px re-centres a 24px thumb on a 12px track; WebKit otherwise
  // hangs it off the track's top edge.
  "[&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:opacity-0 [&::-webkit-slider-thumb]:[margin-top:-6px] " +
  "[&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:opacity-0";

export interface SeekBarProps {
  displayTime: number;
  duration: number;
  bufferedFraction: number;
  disabled: boolean;
  onScrubStart: (seconds: number) => void;
  onScrubChange: (seconds: number) => void;
  onScrubEnd: () => void;
  variant?: "centered" | "edge";
}

export function SeekBar({
  displayTime,
  duration,
  bufferedFraction,
  disabled,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
  variant = "centered",
}: SeekBarProps) {
  const t = useTranslations("player");
  const rowRef = useRef<HTMLDivElement>(null);
  const playedFraction =
    duration > 0 ? Math.min(Math.max(displayTime / duration, 0), 1) : 0;

  // The browser's own "click the track to jump" behaviour is a mouse-only
  // default action: WebKit and Blink under touch only move the value when
  // the drag starts on the native thumb itself.
  const secondsFromClientX = useCallback(
    (clientX: number) => {
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || duration <= 0) return displayTime;
      const fraction = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return fraction * duration;
    },
    [duration, displayTime],
  );

  // The knob's travel is the track minus its own width, which is what
  // keeps a native thumb from hanging off either end.
  const knobLeft = `calc(${playedFraction * 100}% + ${
    (0.5 - playedFraction) * LINE_PX
  }px)`;

  const trackOffsetPx = variant === "edge" ? ROW_PX - LINE_PX : (ROW_PX - LINE_PX) / 2;

  return (
    <div
      // Swipes that begin here are a scrub, not a request to change
      // the frame's size. Read by useFullscreen.
      data-player-scrub=""
      ref={rowRef}
      className="relative h-10 w-full touch-none"
    >
      <input
        type="range"
        className={`peer absolute inset-0 z-10 ${SEEK_INPUT_CLASS}`}
        style={{ "--seek-track-offset": `${trackOffsetPx}px` } as CSSProperties}
        aria-label={t("seek")}
        min={0}
        max={duration}
        step="any"
        value={displayTime}
        disabled={disabled}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          onScrubStart(secondsFromClientX(e.clientX));
        }}
        onPointerMove={(e) => {
          // Pointer capture keeps delivering move events even while
          // just hovering with a mouse; only an active press is a scrub.
          if (e.buttons === 0) return;
          onScrubChange(secondsFromClientX(e.clientX));
        }}
        onKeyDown={(e) => {
          if (SCRUB_KEYS.has(e.key)) onScrubStart(displayTime);
        }}
        onChange={(e) => onScrubChange(Number(e.target.value))}
        onPointerUp={onScrubEnd}
        onKeyUp={(e) => {
          if (SCRUB_KEYS.has(e.key)) onScrubEnd();
        }}
        // A pointer released outside the input, or focus lost mid-drag,
        // would otherwise leave the scrub uncommitted.
        onBlur={onScrubEnd}
      />

      <div
        data-testid="seek-line"
        style={{ top: `${trackOffsetPx}px` }}
        className={[
          "pointer-events-none absolute inset-x-0 h-3 rounded-full",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring",
        ].join(" ")}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
          <div
            data-testid="buffered-range"
            className="absolute inset-y-0 left-0 bg-white/40"
            style={{ width: toPercent(bufferedFraction) }}
          />
          <div
            data-testid="played-range"
            className="absolute inset-y-0 left-0 bg-accent"
            style={{ width: toPercent(playedFraction) }}
          />
        </div>

        {!disabled && (
          <div
            data-testid="seek-knob"
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
            style={{ left: knobLeft }}
          />
        )}
      </div>
    </div>
  );
}
