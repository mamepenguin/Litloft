import {
  isDriveAddonPath,
  isDriveCollectionPath,
  isDriveSearchPath,
  isLibraryRootView,
} from "@/lib/driveViews";
import { samePath } from "./isSidebarLinkActive";

/**
 * The link a pinned folder's row points at.
 *
 * Exported so the Pins section and the Library row cannot disagree about
 * it. The Library row yields to a Pin by asking whether *this* pathname is
 * a pin's destination, and "the same folder" is a question about encoding
 * as much as about the path — two spellings of the rule would let the two
 * rows both light on a folder whose name is not its own encoding.
 */
export function pinHrefFor(driveBase: string, path: string): string {
  return `${driveBase}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Whether the sidebar's **Library** row is the selected one.
 *
 * Not part of `isSidebarLinkActive`, and deliberately: that function
 * answers from an href alone, and this row's answer cannot be. Library is
 * selected on URLs it does not link to (every folder path), and unselected
 * on one it does (a pinned folder). `linkClass` already takes an override
 * for rows in exactly that position — the tag rows are the other one.
 *
 * Two rules meet here and the second wins:
 *
 * - §5.3's table gives Library every `/drive/{drive}/{path}`.
 * - §5.2 says a tag, Collection, Pin or Smart Folder "keeps its own
 *   existing selected-state rules and does not also select Home or
 *   Library".
 *
 * So a Pin or a tag takes the highlight and Library gives it up (stage 1
 * arbitrations 15 and 20). Collections and Smart Folders need no clause of
 * their own, and writing one would be worse than leaving it out: their
 * destinations are `/drive/{d}/collections/{id}` and `/drive/{d}/search`,
 * which the route tests below already exclude, and a condition whose state
 * is never reachable is satisfied by every test that never builds it.
 *
 * The route tests come from `lib/driveViews.ts` rather than from a list
 * written here, because that module is already the repository's classifier
 * for what a `/drive/…` URL is, and a second list drifts from it silently.
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
  // `app/drive/[name]/page.tsx` treats as a location on purpose — so
  // Library lit there under a tag.
  //
  // **The tag row does not take it either**: `SidebarTagsSection` gates
  // its own highlight on `!activeView`, which reads Library as a view
  // rather than as the location it is. So that URL leaves the column
  // dark, as every `?view=<something>&tag=x` already did. Letting the
  // tag row light there is a change to the rule for every tag row in the
  // app, and it has to decide where clearing the tag lands — the stage 4
  // browser pass owns it (arbitration 22).
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
