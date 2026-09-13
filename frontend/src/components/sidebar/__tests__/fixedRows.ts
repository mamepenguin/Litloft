/**
 * Render order across the whole sidebar column. A fixture asserting against
 * this set has to supply a non-zero missing count, or the Missing Files row
 * does not render.
 */
export const FIXED_SIDEBAR_ROWS: readonly { label: string; view: string | null }[] = [
  { label: "Home", view: null },
  { label: "Library", view: "library" },
  { label: "Favorites", view: "favorites" },
  { label: "Liked", view: "liked" },
  { label: "Recently Viewed", view: "recent" },
  { label: "Recently Added", view: "recent-added" },
  { label: "All Files", view: "all" },
  { label: "Trash", view: "trash" },
  { label: "Missing Files", view: "missing" },
];

export const VIEW_ROWS: readonly string[] = FIXED_SIDEBAR_ROWS
  .map((r) => r.view)
  .filter((v): v is string => v !== null);
