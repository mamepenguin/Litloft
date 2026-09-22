/**
 * The drive's folder tree implies "the file lives at this path in the
 * folder hierarchy". Virtual views and recovery views deliberately cut
 * across that hierarchy, so surfacing the tree would mislead the user.
 */

const CROSS_FOLDER_VIEWS = new Set([
  "all",
  "favorites",
  "recent",
  "recent-added",
  "liked",
]);

const STANDALONE_VIEWS = new Set(["trash", "missing"]);

export function isCrossFolderView(view: string | null): boolean {
  return view !== null && CROSS_FOLDER_VIEWS.has(view);
}

export function isStandaloneView(view: string | null): boolean {
  return view !== null && STANDALONE_VIEWS.has(view);
}

/**
 * `?view=library` is an alias for the bare drive URL, rewritten rather than
 * branched on: `view` is part of the list snapshot key, the listing reset key
 * and the counted subject, so leaving the alias spelled differently would file
 * one screen under two of each.
 *
 * Every reader of `?view=` goes through this, not only the route layer — the
 * sidebar reads the same query to decide which row is lit.
 */
export function normaliseDriveView(view: string | null): string | null {
  return view === "library" ? null : view;
}

/** The two addresses of a drive's root. */
export function driveHref(drive: string, kind: "home" | "library"): string {
  const base = `/drive/${encodeURIComponent(drive)}`;
  return kind === "home" ? `${base}?view=home` : base;
}

/**
 * Smart folders share this route — they are persisted searches resurfaced
 * via `?smart_folder_id=...` query, not a dedicated `/smart/` path.
 */
export function isDriveSearchPath(pathname: string): boolean {
  return /^\/drive\/[^/]+\/search(\/|$)/.test(pathname);
}

export function isDriveAddonPath(pathname: string): boolean {
  return /^\/drive\/[^/]+\/addons\//.test(pathname);
}

export function isDriveCollectionPath(pathname: string): boolean {
  return /^\/drive\/[^/]+\/collections\/[^/]+\/?$/.test(pathname);
}

/**
 * Recovery views (trash / missing) and addon routes also hide the
 * tree but are handled separately because they own their own page
 * layout.
 */
export function routeHidesTree({
  pathname,
  view,
  includeStandalone = false,
}: {
  pathname: string;
  view: string | null;
  includeStandalone?: boolean;
}): boolean {
  if (isCrossFolderView(view)) return true;
  if (isDriveSearchPath(pathname)) return true;
  if (includeStandalone) {
    if (isStandaloneView(view)) return true;
    if (isDriveAddonPath(pathname)) return true;
  }
  return false;
}
