/**
 * Classification of `/drive/{name}` routes that intentionally hide the
 * folder tree.
 *
 * The drive's folder tree implies "the file lives at this path in the
 * folder hierarchy". Virtual views (`?view=favorites`, search, smart
 * folders, …) and recovery views (`?view=trash | missing`) deliberately
 * cut across that hierarchy, so surfacing the tree would mislead the
 * user. The TwoPaneLayout wrapper is skipped and the TreeToggle button
 * is hidden on these routes.
 *
 * Sources of truth for view names: `app/drive/[name]/page.tsx`
 * (routing) and `FolderBrowser.tsx` (rendering).
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
 * Matches `/drive/{name}/search` and any sub paths under it. Smart
 * folders share this route — they are persisted searches resurfaced via
 * `?smart_folder_id=...` query, not a dedicated `/smart/` path. If a
 * future redesign splits smart folders onto their own route, this
 * helper (and the layout / TreeToggle checks that consume it) must be
 * updated together.
 */
export function isDriveSearchPath(pathname: string): boolean {
  return /^\/drive\/[^/]+\/search(\/|$)/.test(pathname);
}

export function isDriveAddonPath(pathname: string): boolean {
  return /^\/drive\/[^/]+\/addons\//.test(pathname);
}

/**
 * Matches the collection detail route ``/drive/{name}/collections/{id}``.
 *
 * The detail page owns its own two-pane wrapper (so the left aside can
 * surface the collection's ordered item list instead of the folder
 * tree), so ``DriveLayout`` bypasses its default ``<TwoPaneLayout>`` for
 * this route — same pattern as addon routes. Spec
 * ``2026-05-12-playlist-to-collection.md`` PR-B redo.
 */
export function isDriveCollectionPath(pathname: string): boolean {
  return /^\/drive\/[^/]+\/collections\/[^/]+\/?$/.test(pathname);
}

/**
 * True when the current route is a cross-folder / search / smart-folder
 * view where the folder tree should not be available. Both the
 * TwoPaneLayout wrapper and the TreeToggle button consult this.
 *
 * Recovery views (trash / missing) and addon routes also hide the
 * tree but are handled separately because they own their own page
 * layout — pass `{ includeStandalone: true }` to fold them into a
 * single check.
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
