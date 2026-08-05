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
 * `bar` sits in a row of controls; `hero` stands alone over the video,
 * which per DESIGN.md means it carries its own dark disc rather than
 * relying on the bar's scrim for legibility.
 */
export type ControlButtonSize = "bar" | "hero";

// The hero disc is deliberately lighter than the small standalone
// buttons: opacity that reads as a subtle backing at 32px reads as a
// heavy blob at 64px, covering the video rather than lifting the icon
// off it.
const SIZE_CLASS: Record<ControlButtonSize, string> = {
  bar: "h-11 w-11 rounded-2xl hover:bg-white/15",
  hero: "h-16 w-16 rounded-full bg-black/50 hover:bg-black/70",
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
      className={`${BASE_CLASS} ${SIZE_CLASS[size]} ${className}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
