"use client";

import type { ReactNode } from "react";

/**
 * An on/off setting in the settings sheet, drawn as a single icon.
 *
 * The sheet rises inside the player frame, which on a phone is a 16:9
 * box about 220px tall. A label-plus-labelled-button row costs ~60px,
 * so four of them pushed the speed selector — the thing most often
 * wanted — below the fold. As icons they fit on one line.
 *
 * The name is carried by `aria-label` rather than visible text, and
 * `title` repeats it for pointer users, so nothing is lost to a screen
 * reader or a hover. State is `aria-checked` plus the wash, matching
 * how the speed and track selectors already show their current value.
 */
export interface SettingToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The icon. Callers may swap it on `checked` where that reads better. */
  children: ReactNode;
}

export function SettingToggle({
  label,
  checked,
  onChange,
  children,
}: SettingToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={[
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
        "text-white transition-colors motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        checked ? "bg-white/20" : "hover:bg-white/10",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
