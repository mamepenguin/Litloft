"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";

/**
 * The row is a finger-sized target; the visible line inside it is only
 * as tall as the knob. Both are needed as numbers, because the native
 * track has to be offset to land on the same line as the painted one.
 */
const ROW_PX = 40;
const LINE_PX = 12;

/** One decimal is plenty for a progress bar, and it keeps float noise
 *  (0.42 * 100 === 42.00000000000001) out of the rendered style. */
export function toPercent(fraction: number): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return `${Math.round(clamped * 1000) / 10}%`;
}

/**
 * Keys that actually move a range input. Treating *every* keydown as
 * the start of a scrub means Tab-ing through the bar commits a seek to
 * the position already playing — harmless in principle, but the
 * YouTube player re-buffers on any seekTo, so it shows up as a stutter.
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

/**
 * The seek bar's input: invisible, but doing three jobs.
 *
 * The knob is painted separately so it shares a coordinate system with
 * the track. That only works if the *native* thumb — still the thing a
 * finger actually grabs, since iOS scrubs by dragging the thumb rather
 * than by tapping the track — sits in the same place. So the native
 * track is pushed down by `--seek-track-offset` to land on the painted
 * line, and the thumb is centred on it.
 *
 * The thumb is also deliberately larger than the knob it stands in for:
 * 24px of grab area behind a 12px dot.
 */
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
  /** Nothing to seek through: no duration, or an ad owns the clock. */
  disabled: boolean;
  onScrubStart: (seconds: number) => void;
  onScrubChange: (seconds: number) => void;
  onScrubEnd: () => void;
  /**
   * `edge` pins the line to the bottom of the row so it can sit on the
   * very edge of the video frame, the way mobile players draw it, while
   * the row above it stays a finger-sized target.
   */
  variant?: "centered" | "edge";
}

/**
 * The scrub surface: three painted layers (empty / buffered / played)
 * plus a knob, with a transparent range input laid over them for input
 * and semantics.
 */
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
  const playedFraction =
    duration > 0 ? Math.min(Math.max(displayTime / duration, 0), 1) : 0;

  // The knob's travel is the track minus its own width, which is what
  // keeps a native thumb from hanging off either end. Reproduced here
  // because the knob is ours now.
  const knobLeft = `calc(${playedFraction * 100}% + ${
    (0.5 - playedFraction) * LINE_PX
  }px)`;

  // Where the line sits in the row, and therefore how far the native
  // track has to be pushed down to meet it.
  const trackOffsetPx = variant === "edge" ? ROW_PX - LINE_PX : (ROW_PX - LINE_PX) / 2;

  return (
    <div
      // Swipes that begin here are a scrub, not a request to change
      // the frame's size. Read by useFullscreen.
      data-player-scrub=""
      className="relative h-10 w-full"
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
        onPointerDown={() => onScrubStart(displayTime)}
        onKeyDown={(e) => {
          if (SCRUB_KEYS.has(e.key)) onScrubStart(displayTime);
        }}
        onChange={(e) => onScrubChange(Number(e.target.value))}
        onPointerUp={onScrubEnd}
        onKeyUp={(e) => {
          if (SCRUB_KEYS.has(e.key)) onScrubEnd();
        }}
        // Safety net: a pointer released outside the input, or focus
        // lost mid-drag, would otherwise leave the scrub uncommitted
        // and the bar frozen on the drag position.
        onBlur={onScrubEnd}
      />

      {/* Everything visible shares this one line, so the track and the
          knob cannot drift apart vertically. */}
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
