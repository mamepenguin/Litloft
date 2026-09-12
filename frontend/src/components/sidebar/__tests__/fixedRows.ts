/**
 * The fixed rows a drive's sidebar renders, in render order, with the
 * `?view=` value each one carries.
 *
 * Shared by the two detectors that need the value, not just the label:
 * `components/__tests__/SidebarActiveRow.test.tsx` compares it against
 * the rendered DOM, and `sidebar/__tests__/isSidebarLinkActive.test.ts`
 * drives its per-value cases from it. A literal compared only against its
 * own length proves nothing (`.claude/rules/review-workflow.md`, detector
 * rule 5); the DOM comparison is what gives this set teeth.
 *
 * It is **not** the only declaration of these rows.
 * `SidebarDriveSwitcher.test.tsx` declares their *labels* inline and
 * checks the order the same way, without `Missing Files` — its fixture
 * reports no missing files, so that row does not render there. That row
 * is the reason this set exists: it is the one the label check cannot
 * see. A fixture asserting against this set has to supply a non-zero
 * missing count.
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
