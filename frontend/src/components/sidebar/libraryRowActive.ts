import {
  isDriveAddonPath,
  isDriveCollectionPath,
  isDriveSearchPath,
} from "@/lib/driveViews";
import { samePath } from "./isSidebarLinkActive";

/** The one encoding of a pin's href, shared so Library and Pin agree. */
export function pinHrefFor(driveBase: string, path: string): string {
  return `${driveBase}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Not part of `isSidebarLinkActive`: Library is selected on URLs it does
 * not link to (every folder path), so its href alone cannot answer.
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

  if (activeTag) return false;

  if (samePath(pathname, driveBase)) {
    // At the drive root the bare URL is Library; every `?view=` names its own
    // row, Home included.
    return !activeView;
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
