"use client";

import { toPercent } from "./SeekBar";

export interface ProgressHairlineProps {
  playedFraction: number;
  bufferedFraction: number;
}

/**
 * Non-interactive by design: a tap here should surface the controls like a
 * tap anywhere else on the frame.
 */
export function ProgressHairline({
  playedFraction,
  bufferedFraction,
}: ProgressHairlineProps) {
  return (
    <div
      data-testid="progress-hairline"
      data-player-chrome=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 overflow-hidden bg-player-indicator-track"
    >
      <div
        className="absolute inset-y-0 left-0 bg-white/40"
        style={{ width: toPercent(bufferedFraction) }}
      />
      <div
        data-testid="hairline-played"
        className="absolute inset-y-0 left-0 bg-player-indicator"
        style={{ width: toPercent(playedFraction) }}
      />
    </div>
  );
}
