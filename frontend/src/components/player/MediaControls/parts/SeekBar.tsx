"use client";

import { useTranslations } from "next-intl";

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

// A transparent track: the visible bar is painted by the sibling divs,
// so the input only contributes the thumb and the interaction surface.
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

export interface SeekBarProps {
  displayTime: number;
  duration: number;
  bufferedFraction: number;
  /** Nothing to seek through: no duration, or an ad owns the clock. */
  disabled: boolean;
  onScrubStart: (seconds: number) => void;
  onScrubChange: (seconds: number) => void;
  onScrubEnd: () => void;
}

/**
 * The scrub surface: three painted layers (empty / buffered / played)
 * with a transparent range input laid over them.
 *
 * `<input type="range">` rather than a bespoke div because keyboard
 * operation, `role="slider"` and `aria-valuenow` then come for free —
 * the custom look costs nothing in accessibility.
 */
export function SeekBar({
  displayTime,
  duration,
  bufferedFraction,
  disabled,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
}: SeekBarProps) {
  const t = useTranslations("player");
  const playedFraction = duration > 0 ? displayTime / duration : 0;

  return (
    // Taller on touch: 24px is a comfortable mouse target and an
    // impossible finger one.
    <div className="relative flex h-6 items-center [@media(pointer:coarse)]:h-10">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
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
      <input
        type="range"
        className={`relative ${RANGE_CLASS}`}
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
    </div>
  );
}
