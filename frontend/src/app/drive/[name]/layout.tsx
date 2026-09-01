"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { RightPaneFile } from "@/components/folder/RightPaneFile";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import {
  isCrossFolderView,
  isDriveAddonPath,
  isDriveCollectionPath,
  isDriveSearchPath,
  isStandaloneView,
} from "@/lib/driveViews";

/**
 * Persistent two-pane wrapper for everything under /drive/[name]/.
 *
 * Phase 3 redesign (Topic 1 補正, hako w4zVT8-dyYwshLNiJ5REY): putting
 * <TwoPaneLayout> here — instead of inside DriveHome / FolderBrowser —
 * is what lets the folder tree survive navigation between drive root,
 * sub folders, and search. The layout itself is the same React node
 * across those routes, so the tree's mounted instance, scroll
 * position, fetch cache and expansion state all carry over.
 *
 * Tree on/off is handled inside `TwoPaneLayout` via CSS width
 * transitions, so toggling the tree never unmounts `children`
 * (FolderBrowser / DriveHome / search results).
 *
 * The tree is intentionally suppressed on routes that cross the
 * folder hierarchy (see `lib/driveViews.ts`):
 *
 * - addon routes (`/drive/{name}/addons/...`) own their own layout.
 * - recovery views (`?view=trash | missing`) own their own layout.
 * - cross-folder virtual views (`?view=favorites | recent-added |
 *   liked | all | recent`) and the search / smart-folder route
 *   list files detached from the folder tree — showing the tree
 *   would mislead about where each file lives. The host page
 *   (FolderBrowser) renders directly; if a file is selected via
 *   `?file=`, a standalone RightPaneFile is mounted instead so the
 *   detail view still appears.
 */
export default function DriveLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);

  const drivePart = `/drive/${encodeURIComponent(driveName)}`;
  const view = searchParams.get("view");
  const isAddonRoute = isDriveAddonPath(pathname);
  const isCollectionRoute = isDriveCollectionPath(pathname);
  const isStandalone = isStandaloneView(view);
  const isCrossFolderRoute = isCrossFolderView(view) || isDriveSearchPath(pathname);

  // Addon, recovery, and collection detail routes own their own page
  // chrome (incl. their own ``<TwoPaneLayout>`` wrapper where they want
  // a left pane with non-folder-tree content).
  if (isAddonRoute || isStandalone || isCollectionRoute) {
    return <>{children}</>;
  }

  // Cross-folder / search / smart-folder routes: no tree, but still
  // honour ``?file=`` so file detail links keep working. The wrapper
  // div mirrors `TwoPaneLayout`'s outer `h-[calc(100dvh-3.5rem)]` box
  // so PaneShell's `h-full` chain and Markdown's inspector / canvas
  // split have a definite height to resolve against.
  if (isCrossFolderRoute) {
    const fileId = searchParams.get("file");
    if (fileId) {
      return (
        <div className="h-[calc(100dvh-3.5rem)] w-full overflow-hidden">
          <RightPaneFile fileId={fileId} drive={driveName} />
        </div>
      );
    }
    return <>{children}</>;
  }

  const folderPath = pathname.startsWith(`${drivePart}/`)
    ? decodeURIComponent(pathname.slice(drivePart.length + 1))
    : "";

  return (
    <TwoPaneLayout drive={driveName} folderPath={folderPath}>
      {children}
    </TwoPaneLayout>
  );
}
