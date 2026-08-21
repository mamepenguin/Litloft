/**
 * Decides whether a sidebar link renders as the active row.
 *
 * Extracted from Sidebar's render body so the tag branch — the one that
 * had to learn about folder paths in spec
 * 2026-08-21-folder-scoped-tag-filter §5.2 — is directly testable. It
 * fails cosmetically and silently when wrong (nothing errors; the sidebar
 * just stops showing a selection), which is exactly the kind of thing a
 * unit test earns its keep on.
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
  if (href.includes("?tag=")) {
    const url = new URL(href, "http://x");
    // A tag href now carries the folder it is scoped to, so the question
    // is "does the current pathname match this href's path", not "are we
    // at the drive root". Compare both encodings for the same reason the
    // plain folder branch below does.
    return (
      samePath(pathname, url.pathname) &&
      activeTag === url.searchParams.get("tag") &&
      !activeView
    );
  }
  if (href === base) {
    return pathname === base && !activeView && !activeTag;
  }
  if (href.startsWith("/drive/")) {
    return samePath(pathname, href);
  }
  return false;
}

function samePath(pathname: string, hrefPath: string): boolean {
  if (pathname === hrefPath) return true;
  try {
    return pathname === decodeURIComponent(hrefPath);
  } catch {
    // Malformed percent-encoding: the raw comparison above already failed.
    return false;
  }
}
