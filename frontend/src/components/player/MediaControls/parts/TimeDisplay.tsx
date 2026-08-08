"use client";

import { formatDuration } from "@/lib/format";

export interface TimeDisplayProps {
  displayTime: number;
  duration: number;
  /**
   * During an ad the player's clock belongs to the ad, not the file.
   * Both halves blank out rather than presenting the ad's position as
   * the viewer's place in the video.
   */
  interrupted: boolean;
}

export function TimeDisplay({ displayTime, duration, interrupted }: TimeDisplayProps) {
  return (
    <div className="flex items-center gap-1 text-xs tabular-nums text-white">
      <span>{formatDuration(interrupted ? null : displayTime)}</span>
      <span aria-hidden="true" className="text-white/50">
        /
      </span>
      <span className="text-white/70">
        {formatDuration(interrupted || duration <= 0 ? null : duration)}
      </span>
    </div>
  );
}
