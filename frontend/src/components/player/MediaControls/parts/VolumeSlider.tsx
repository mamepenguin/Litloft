"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";

const TRACK_PX = 4;
const THUMB_PX = 12;

/**
 * WebKit hangs the knob off the *top* edge of the runnable track rather
 * than centring it, so a knob taller than the track sits low by half
 * the difference.
 */
const THUMB_OFFSET_PX = -(THUMB_PX - TRACK_PX) / 2;

/**
 * `h-full` matters more than it looks: an appearance-none range input
 * collapses to the height of its track, leaving a target no pointer can
 * land on.
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
  value: number;
  onChange: (volume: number) => void;
}

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
