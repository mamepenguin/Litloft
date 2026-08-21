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

  if (href === `${base}?view=favorites`) {
    return pathname === base && activeView === "favorites";
  }
  if (href === `${base}?view=recent`) {
    return pathname === base && activeView === "recent";
  }
  if (href === `${base}?view=recent-added`) {
    return pathname === base && activeView === "recent-added";
  }
  if (href === `${base}?view=all`) {
    return pathname === base && activeView === "all";
  }
  if (href === base) {
    return pathname === base && !activeView && !activeTag;
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
