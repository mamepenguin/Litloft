"use client";

import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
  const driveName = decodeURIComponent(params.name as string);
  const { enabled } = useTreeEnabled(driveName);

  const drivePart = `/drive/${encodeURIComponent(driveName)}`;
  const isAddonRoute = pathname.startsWith(`${drivePart}/addons/`);
  const isSearchRoute = pathname.startsWith(`${drivePart}/search`);

  const folderPath =
    !isSearchRoute && pathname.startsWith(`${drivePart}/`)
      ? decodeURIComponent(pathname.slice(drivePart.length + 1))
      : "";

  if (enabled && !isAddonRoute) {
    return (
      <TwoPaneLayout drive={driveName} folderPath={folderPath}>
        {children}
      </TwoPaneLayout>
    );
  }
  return <>{children}</>;
}
