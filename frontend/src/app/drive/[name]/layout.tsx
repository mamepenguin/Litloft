"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";

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
 * Tree on/off is now handled inside `TwoPaneLayout` via CSS width
 * transitions instead of branching the layout tree here. Branching at
 * the layout level would unmount `children` (FolderBrowser / DriveHome /
 * search results) on every toggle, losing scroll position and any
 * in-flight UI state. Keeping the wrapper node stable lets React
 * preserve those subtrees through the toggle.
 *
 * Addon routes (`/drive/{name}/addons/...`) own their own layout, so
 * we pass through unchanged there.
 */
export default function DriveLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);

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

  if (isAddonRoute || isRecoveryView) {
    return <>{children}</>;
  }

  return (
    <TwoPaneLayout drive={driveName} folderPath={folderPath}>
      {children}
    </TwoPaneLayout>
  );
}
