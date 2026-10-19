"use client";

import type { ReactNode } from "react";

/**
 * Drawn as a single icon: the sheet rises inside the player frame, and
 * labelled rows push the speed selector below the fold on a phone.
 */
export interface SettingToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
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
