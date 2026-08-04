"use client";

import { useTranslations } from "next-intl";

/** Diameter of the knob, in px. Needed as a number for its travel. */
const KNOB_PX = 12;

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

// A range input with a visible thumb, for controls that want the
// browser's own knob (volume). The seek bar draws its own — see below.
//
// `h-full` matters more than it looks: an appearance-none range input
// collapses to the height of its track, which is 4px here, leaving a
// target no finger can land on. The element is stretched to fill its
// row while the visible track stays thin. `touch-none` stops the drag
// being claimed as a pan gesture.
export const RANGE_CLASS =
  "h-full w-full cursor-pointer touch-none appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed " +
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent " +
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent " +
  "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white " +
  "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white " +
  "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-focus-ring";

/**
 * The same input with its thumb hidden. The seek bar paints its own
 * knob instead, because the native one is positioned against the
 * *track pseudo-element* while the painted layers are positioned
 * against the row — two coordinate systems that do not line up, which
 * shows as a knob floating above or below its own bar.
 *
 * The input stays for what it is genuinely good at: keyboard
 * operation, `role="slider"` and `aria-valuenow` for free, and a hit
 * area the full height of the row.
 */
const SEEK_INPUT_CLASS =
  "h-full w-full cursor-pointer touch-none appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed " +
  "[&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent " +
  "[&::-moz-range-track]:h-full [&::-moz-range-track]:bg-transparent " +
  "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:opacity-0 " +
  "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:opacity-0";

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
   * `edge` pins the bar to the bottom of its row so it can sit on the
   * very edge of the video frame, the way mobile players draw it, while
   * the row above it stays a finger-sized target.
   */
  variant?: "centered" | "edge";
}

/**
 * The scrub surface: three painted layers (empty / buffered / played)
 * plus a knob, with a transparent range input laid over them for
 * input and semantics.
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
    (0.5 - playedFraction) * KNOB_PX
  }px)`;

  return (
    <div
      className={[
        "relative flex w-full",
        variant === "edge"
          ? "h-10 items-end"
          : "h-6 items-center [@media(pointer:coarse)]:h-10",
      ].join(" ")}
    >
      <input
        type="range"
        className={`peer absolute inset-0 z-10 ${SEEK_INPUT_CLASS}`}
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
        className={[
          "pointer-events-none relative h-3 w-full rounded-full",
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
