/**
 * Decides whether a sidebar link renders as the active row.
 *
 * Extracted from Sidebar's render body because it fails cosmetically and
 * silently when wrong — nothing errors; the sidebar just stops showing a
 * selection.
 *
 * Tag rows deliberately do **not** go through here. Their href is a
 * toggle (apply the tag, or clear it), so it stops carrying `?tag=` at
 * exactly the moment the row is selected — deriving the highlight from
 * the href would drop it. SidebarTagsSection computes both from the tag
 * name instead and passes the answer to `linkClass`. `activeTag` is
 * still read below, so a bare drive link is not marked active while a
 * tag filter is applied.
 */
export function isSidebarLinkActive({
  href,
  pathname,
  currentDrive,
  activeView,
  activeTag,
}: {
  href: string;
  pathname: string;
  currentDrive: string | null;
  activeView: string | null;
  activeTag: string | null;
}): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  if (!currentDrive) return false;

  const base = `/drive/${encodeURIComponent(currentDrive)}`;

  // `samePath`, not `===`: `base` is always the encoded spelling and
  // `usePathname()` may report either, so a raw comparison answers no for
  // every row on a drive whose name is not its own encoding.
  const atDriveRoot = samePath(pathname, base);

  // Matched by the view value the href carries, not against a list of
  // the views that exist. A list is the wrong shape for this question:
  // a row whose value is absent from it renders unselected, and nothing
  // errors or warns, so the omission is only visible to someone looking
  // at the sidebar for that one view.
  //
  // The trade runs the other way instead, and it is the sharper edge: a
  // row carrying a value no route consumes renders *selected*, over a
  // listing that is not what the row names, because an unrecognised
  // `view` falls through to the drive-wide file list rather than
  // erroring. A confident wrong answer is harder to notice than a
  // missing highlight, and nothing here can catch it: what keeps it out
  // is that every row's `?view=` value is pinned against a declared set
  // where the rows are rendered, not this comparison.
  const viewPrefix = `${base}?view=`;
  if (href.startsWith(viewPrefix)) {
    return atDriveRoot && activeView === href.slice(viewPrefix.length);
  }
  if (href === base) {
    return atDriveRoot && !activeView && !activeTag;
  }
  if (href.startsWith("/drive/")) {
    return samePath(pathname, href);
  }
  return false;
}

/**
 * Compare a live `usePathname()` value against a built href path.
 * `usePathname()` may report either the encoded or the decoded form
 * depending on how the navigation happened, so try both.
 */
export function samePath(pathname: string, hrefPath: string): boolean {
  if (pathname === hrefPath) return true;
  try {
    return pathname === decodeURIComponent(hrefPath);
  } catch {
    // Malformed percent-encoding: the raw comparison above already failed.
    return false;
  }
}
