"use client";

import type { ReactNode } from "react";

/**
 * One line of the preferences card: what it is, and the control for it.
 *
 * Three of these replaced three cards, each with its own heading and its
 * own border, for a theme picker, a language picker and one button. A card
 * per control turns a short list of settings into a page you scroll.
 *
 * Below `sm` the label sits above the control rather than beside it.
 * `00-basis.md`'s "a row of controls does not wrap" is about a *group of
 * controls* — stacking a label over the thing it names is not that row
 * wrapping, it is the label finding the only place it fits at 375px.
 */
/**
 * `role="group"` and not a heading.
 *
 * Each of these was a `<section>` with its own `<h2>`, and folding them
 * into rows dropped the heading — which the spec asks for — but the
 * *association* went with it. A reader tabbing into the theme picker then
 * hears three `aria-pressed` buttons with nothing saying they are the
 * Appearance setting, and the reset row's button is announced with its
 * label out of reach. A group named by the row's own label restores that
 * without adding a heading level back.
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
