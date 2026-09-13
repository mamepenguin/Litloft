import {
  isDriveAddonPath,
  isDriveCollectionPath,
  isDriveSearchPath,
  isLibraryRootView,
} from "@/lib/driveViews";
import { samePath } from "./isSidebarLinkActive";

/**
 * The Library row yields to a Pin by asking whether *this* pathname is
 * a pin's destination, and "the same folder" is a question about encoding
 * as much as about the path — two spellings of the rule would let the two
 * rows both light on a folder whose name is not its own encoding.
 */
export function pinHrefFor(driveBase: string, path: string): string {
  return `${driveBase}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Not part of `isSidebarLinkActive`, and deliberately: that function
 * answers from an href alone, and this row's answer cannot be. Library is
 * selected on URLs it does not link to (every folder path), and unselected
 * on one it does (a pinned folder).
 *
 * Collections and Smart Folders need no clause of
 * their own, and writing one would be worse than leaving it out: their
 * destinations are `/drive/{d}/collections/{id}` and `/drive/{d}/search`,
 * which the route tests below already exclude.
 */
export function isLibraryRowActive({
  pathname,
  driveBase,
  activeView,
  activeTag,
  pinnedHrefs,
}: {
  pathname: string;
  /** `/drive/{encoded drive}`, or `null` when off a drive. */
  driveBase: string | null;
  activeView: string | null;
  activeTag: string | null;
  pinnedHrefs: readonly string[];
}): boolean {
  if (!driveBase) return false;

  // Before the root branch, not after it. Below the early return this
  // clause governs folder paths only, and `?view=library&tag=x` is a URL
  // `app/drive/[name]/page.tsx` treats as a location on purpose.
  if (activeTag) return false;

  if (samePath(pathname, driveBase)) {
    // At the drive root only the Library view is Library. A bare
    // `/drive/{d}` is Home, and any other `?view=` names its own row.
    return isLibraryRootView(activeView);
  }

  if (!isUnderDriveBase(pathname, driveBase)) return false;
  if (isDriveSearchPath(pathname)) return false;
  if (isDriveAddonPath(pathname)) return false;
  if (isDriveCollectionPath(pathname)) return false;
  if (pinnedHrefs.some((href) => samePath(pathname, href))) return false;

  return true;
}

function isUnderDriveBase(pathname: string, driveBase: string): boolean {
  if (pathname.startsWith(`${driveBase}/`)) return true;
  try {
    return pathname.startsWith(`${decodeURIComponent(driveBase)}/`);
  } catch {
    return false;
  }
}
