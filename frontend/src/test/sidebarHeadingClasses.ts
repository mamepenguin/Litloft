/** Matched as a set, not as a substring: Tailwind does not care about order. */
export const SIDEBAR_HEADING_CLASSES = [
  "text-[11px]",
  "font-semibold",
  "text-text-muted",
] as const;

export function wearsSidebarHeadingClasses(el: Element): boolean {
  return SIDEBAR_HEADING_CLASSES.every((c) => el.classList.contains(c));
}
