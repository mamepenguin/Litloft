"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";

/**
 * The line painted inside the row, and the knob the browser draws on
 * it. Both are needed as numbers: the knob has to be nudged onto the
 * line, and the fill has to stop where the knob's centre is.
 */
const TRACK_PX = 4;
const THUMB_PX = 12;

/**
 * WebKit hangs the knob off the *top* edge of the runnable track rather
 * than centring it, so a knob taller than the track sits low by half
 * the difference. This puts it back on the line. (The seek bar corrects
 * the same thing; Firefox centres it for us.)
 */
const THUMB_OFFSET_PX = -(THUMB_PX - TRACK_PX) / 2;

/**
 * The input itself paints nothing. Its track is transparent so the
 * painted line below shows through, and only the knob is left visible.
 *
 * `h-full` matters more than it looks: an appearance-none range input
 * collapses to the height of its track, which is 4px here, leaving a
 * target no pointer can land on. The element is stretched to fill its
 * row while the visible line stays thin. `touch-none` stops the drag
 * being claimed as a pan gesture.
 */
const INPUT_CLASS =
  "h-full w-full cursor-pointer touch-none appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed " +
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent " +
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent " +
  "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white " +
  "[&::-webkit-slider-thumb]:[margin-top:var(--volume-thumb-offset)] " +
  "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white " +
  "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-focus-ring";

export interface VolumeSliderProps {
  /** 0-1. A muted player reads as 0 without losing its stored level. */
  value: number;
  onChange: (volume: number) => void;
}

/**
 * The volume control's visible line.
 *
 * The range input paints no track of its own — the shared styling this
 * grew out of was written for the seek bar, which draws one. Left as
 * it was, the control rendered as a knob floating in empty space over
 * the video, so the line is painted behind the input here.
 *
 * White-on-scrim rather than theme tokens, per DESIGN.md "Over-video
 * chrome"; the fills are the documented `bg-white/25` / `bg-accent`
 * pair the seek bar uses.
 */
export function VolumeSlider({ value, onChange }: VolumeSliderProps) {
  const t = useTranslations("player");
  const fraction = Math.min(Math.max(value, 0), 1);

  // The browser keeps the knob inside the track, so its centre travels
  // `width - THUMB_PX` and not the full width. The fill follows the
  // same path, or it drifts away from the knob at both ends.
  const fillWidth = `calc(${fraction * 100}% + ${(0.5 - fraction) * THUMB_PX}px)`;

  return (
    <div className="relative h-11 w-20">
      <div
        data-testid="volume-track"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25"
      >
        <div
          data-testid="volume-fill"
          className="absolute inset-y-0 left-0 bg-accent"
          style={{ width: fillWidth }}
        />
      </div>

      <input
        type="range"
        // Positioned so it paints above the line it shares: a static
        // child would end up underneath the absolute one.
        className={`relative ${INPUT_CLASS}`}
        style={
          { "--volume-thumb-offset": `${THUMB_OFFSET_PX}px` } as CSSProperties
        }
        aria-label={t("volume")}
        min={0}
        max={1}
        step={0.05}
        value={fraction}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
