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
 * Putting <TwoPaneLayout> here — instead of inside DriveHome / FolderBrowser —
 * is what lets the folder tree survive navigation between drive root,
 * sub folders, and search.
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

  if (isAddonRoute || isStandalone || isCollectionRoute) {
    return <>{children}</>;
  }

  // The wrapper div mirrors `TwoPaneLayout`'s outer `h-[calc(100dvh-3.5rem)]`
  // box so PaneShell's `h-full` chain has a definite height to resolve against.
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
