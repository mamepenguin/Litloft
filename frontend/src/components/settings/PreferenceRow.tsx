"use client";

import type { ReactNode } from "react";

/**
 * `role="group"` and not a heading.
 *
 * A reader tabbing into the theme picker otherwise
 * hears three `aria-pressed` buttons with nothing saying they are the
 * Appearance setting.
 */
export function PreferenceRow({
  id,
  label,
  children,
}: {
  /** Base for the label's `id`; must be unique on the page. */
  id: string;
  label: string;
  children: ReactNode;
}) {
  const labelId = `${id}-label`;
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <span id={labelId} className="text-sm text-text-primary">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {children}
      </div>
    </div>
  );
}
