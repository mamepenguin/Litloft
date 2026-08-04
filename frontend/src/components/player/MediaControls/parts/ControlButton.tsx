"use client";

import type { ReactNode } from "react";

/**
 * Shared surface for every button drawn over the video. Transparent at
 * rest with a white wash on hover, per DESIGN.md "Over-video chrome" —
 * the backdrop is a black frame, so theme tokens would render pale
 * controls on it in light mode.
 */
const BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center text-white transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "disabled:opacity-40 motion-reduce:transition-none";

/**
 * `bar` sits in a row of controls; `hero` and `heroPrimary` stand alone
 * over the video, which per DESIGN.md means they carry their own dark
 * disc rather than relying on the bar's scrim for legibility.
 */
export type ControlButtonSize = "bar" | "hero" | "heroPrimary";

const SIZE_CLASS: Record<ControlButtonSize, string> = {
  bar: "h-11 w-11 rounded-2xl hover:bg-white/15",
  hero: "h-14 w-14 rounded-full bg-black/70 hover:bg-black/90",
  heroPrimary: "h-16 w-16 rounded-full bg-black/70 hover:bg-black/90",
};

export interface ControlButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  size?: ControlButtonSize;
  /** For callers that position the button themselves. */
  className?: string;
  children: ReactNode;
}

export function ControlButton({
  label,
  onClick,
  disabled = false,
  size = "bar",
  className = "",
  children,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      // Marks the button for useFullscreen, which ignores swipes that
      // start on the controls. Without it, a finger sliding off a
      // button reads as swipe-to-dismiss and closes the frame.
      // Redundant inside a marked bar, harmless, and the only thing
      // that works for a button standing alone over the video.
      data-player-controls=""
      className={`${BASE_CLASS} ${SIZE_CLASS[size]} ${className}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
