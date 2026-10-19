/**
 * Tag rows do not go through here: their href is a toggle, so it drops
 * `?tag=` exactly when the row is selected.
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

  const atDriveRoot = samePath(pathname, base);

  // Matched by the href's own view value, not against a list of views, so
  // a new view cannot be forgotten.
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

/**
 * An addon owns every route under its own, so its row stays lit on a deep
 * page. Core rows do not get this: `/drive/{d}` is a prefix of every page
 * on the drive.
 */
export function isAddonNavRowActive(pathname: string, href: string): boolean {
  if (samePath(pathname, href)) return true;
  if (pathname.startsWith(`${href}/`)) return true;
  try {
    return pathname.startsWith(`${decodeURIComponent(href)}/`);
  } catch {
    return false;
  }
}
