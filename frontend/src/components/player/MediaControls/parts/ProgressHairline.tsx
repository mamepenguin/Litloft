"use client";

import { toPercent } from "./SeekBar";

export interface ProgressHairlineProps {
  playedFraction: number;
  bufferedFraction: number;
}

/**
 * The sliver of progress that stays visible once the controls fade
 * out, matching how mobile players keep a sense of position without
 * keeping a whole bar on screen.
 *
 * Non-interactive by design: the scrub target is the real SeekBar, and
 * a tap here should surface the controls like a tap anywhere else on
 * the frame. It is `aria-hidden` because the SeekBar carries the
 * position for assistive tech whenever it can be acted on.
 */
export function ProgressHairline({
  playedFraction,
  bufferedFraction,
}: ProgressHairlineProps) {
  return (
    <div
      data-testid="progress-hairline"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 overflow-hidden bg-white/25"
    >
      <div
        className="absolute inset-y-0 left-0 bg-white/40"
        style={{ width: toPercent(bufferedFraction) }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-accent"
        style={{ width: toPercent(playedFraction) }}
      />
    </div>
  );
}
