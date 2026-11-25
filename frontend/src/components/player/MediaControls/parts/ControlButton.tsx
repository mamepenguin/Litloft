"use client";

import type { ReactNode } from "react";

/**
 * The backdrop is a black frame, so theme tokens would render pale
 * controls on it in light mode.
 */
const BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center text-white transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "disabled:opacity-40 motion-reduce:transition-none";

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
  className?: string;
  title?: string;
  children: ReactNode;
}

export function ControlButton({
  label,
  onClick,
  disabled = false,
  size = "bar",
  className = "",
  title,
  children,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      className={`${BASE_CLASS} ${SIZE_CLASS[size]} ${className}`}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        onClick();
        // A pointer press leaves focus here, and the first key press after
        // it turns that focus into :focus-visible, which holds the bar on
        // screen. A keyboard press (detail 0) keeps its focus.
        if (e.detail > 0 && document.activeElement === e.currentTarget) {
          e.currentTarget.blur();
        }
      }}
    >
      {children}
    </button>
  );
}
