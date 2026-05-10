"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { RightPaneFile } from "@/components/folder/RightPaneFile";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import { useTreeEnabled } from "@/hooks/useTreeEnabled";

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
 * Addon routes (`/drive/{name}/addons/...`) own their own layout, so
 * we pass through unchanged there.
 */
export default function DriveLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const { enabled } = useTreeEnabled(driveName);

  const drivePart = `/drive/${encodeURIComponent(driveName)}`;
  const isAddonRoute = pathname.startsWith(`${drivePart}/addons/`);
  const isSearchRoute = pathname.startsWith(`${drivePart}/search`);
  // Trash and missing-files are recovery views — they list items
  // detached from any folder, so the folder tree adds no value and
  // could mislead the user. Opt out the same way addon routes do.
  const view = searchParams.get("view");
  const isRecoveryView = view === "trash" || view === "missing";

  const folderPath =
    !isSearchRoute && pathname.startsWith(`${drivePart}/`)
      ? decodeURIComponent(pathname.slice(drivePart.length + 1))
      : "";

  if (enabled && !isAddonRoute && !isRecoveryView) {
    return (
      <TwoPaneLayout drive={driveName} folderPath={folderPath}>
        {children}
      </TwoPaneLayout>
    );
  }

  // Tree disabled but a file is selected (typically via the
  // ``/files/{id}`` 307 redirect from Phase 1 PR-5, or any other
  // ``?file=`` link). Without this branch, ``RightPaneFile`` never
  // mounts and the user sees the folder grid behind the file URL,
  // which is jarring. Mount the right pane standalone so the file
  // detail actually shows up. The user can leave via the in-pane
  // chrome (``TreeToggle`` flips the tree on, mobile back button
  // calls ``clearFile`` to drop the ``?file=`` query) or browser
  // back. (Bug found during PR-7 manual QA, fixed alongside.)
  const fileId = searchParams.get("file");
  if (fileId && !isAddonRoute && !isRecoveryView) {
    return <RightPaneFile fileId={fileId} drive={driveName} />;
  }

  return <>{children}</>;
}
