/**
 * The fixed rows a drive's sidebar renders, in render order.
 *
 * Declared once, in one place, because two detectors need the same set and
 * a second copy would let one of them drift:
 *
 * - `components/__tests__/SidebarActiveRow.test.tsx` compares this against
 *   the rendered DOM, which is what makes the set falsifiable. Shrink it,
 *   grow it, reorder it or typo a value and that comparison fails.
 * - `sidebar/__tests__/isSidebarLinkActive.test.ts` drives its per-value
 *   cases from it.
 *
 * A literal compared only against its own length proves nothing
 * (`.claude/rules/review-workflow.md`, detector rule 5) — the observation
 * is what gives this one teeth, so the set lives here and the assertion
 * lives against the DOM.
 *
 * `missing` renders only when the drive reports missing files, which is why
 * a fixture asserting against this set has to supply a non-zero count.
 */
export const FIXED_SIDEBAR_ROWS: readonly { label: string; view: string | null }[] = [
  { label: "Home", view: null },
  { label: "Favorites", view: "favorites" },
  { label: "Liked", view: "liked" },
  { label: "Recently Viewed", view: "recent" },
  { label: "Recently Added", view: "recent-added" },
  { label: "All Files", view: "all" },
  { label: "Trash", view: "trash" },
  { label: "Missing Files", view: "missing" },
];

/** The `?view=` value of every row that carries one, in render order. */
export const VIEW_ROWS: readonly string[] = FIXED_SIDEBAR_ROWS
  .map((r) => r.view)
  .filter((v): v is string => v !== null);
