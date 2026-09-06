/**
 * The classes that make a sidebar section heading look like one.
 *
 * One definition, read by two detectors that ask the same question from
 * different sides: `sidebar-headings.test.ts` scans the source for places
 * that write them, and `SidebarDriveSwitcher.test.tsx` checks that what it
 * renders does not wear them. Two copies would let the two drift, and a
 * stale copy makes a "nothing wears these" check quietly vacuous.
 *
 * Matched as a set, not as a substring: written in another order
 * (`font-semibold text-[11px] text-text-muted`) the same declaration would
 * slip past a substring test, and Tailwind does not care about the order.
 */
export const SIDEBAR_HEADING_CLASSES = [
  "text-[11px]",
  "font-semibold",
  "text-text-muted",
] as const;

/** Does this element wear all of them? */
export function wearsSidebarHeadingClasses(el: Element): boolean {
  return SIDEBAR_HEADING_CLASSES.every((c) => el.classList.contains(c));
}
