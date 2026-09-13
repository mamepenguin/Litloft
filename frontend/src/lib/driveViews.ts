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
 * Library belongs in neither set above: Library *is* the hierarchy, seen
 * from its top, and keeps both the tree and its toggle.
 */
export const LIBRARY_VIEW = "library";

/**
 * Exact, not lenient. An unrecognised `?view=` value is passed through to
 * the drive-wide file list by design, so `?view=Library`,
 * `?view=my-library` and `?view=library ` are unknown values, not
 * spellings of this one.
 */
export function isLibraryRootView(view: string | null | undefined): boolean {
  return view === LIBRARY_VIEW;
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
