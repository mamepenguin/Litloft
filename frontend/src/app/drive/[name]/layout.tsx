"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { DriveUnavailable } from "@/components/DriveUnavailable";
import { RightPaneFile } from "@/components/folder/RightPaneFile";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import { getAuthStatus, getDriveSummary } from "@/lib/api";
import { ApiStatusError } from "@/lib/apiError";
import {
  isCrossFolderView,
  isDriveAddonPath,
  isDriveAppPath,
  isDriveCollectionPath,
  isDriveSearchPath,
  isStandaloneView,
} from "@/lib/driveViews";

/** `unknown` is every failure that is not the 404 this page knows how to read. */
type SummaryState = "checking" | "available" | "unavailable" | "unknown";
type UnlockState = "pending" | "shown" | "hidden";

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

  const [summary, setSummary] = useState<SummaryState>("checking");
  const [unlock, setUnlock] = useState<UnlockState>("pending");

  // One request per mount and per drive name answers for every route under the
  // drive; the sidebar asks for the same summary on its own, and the repetition
  // is deliberate.
  useEffect(() => {
    let current = true;
    setSummary("checking");
    setUnlock("pending");

    const answer = (next: SummaryState) => {
      if (current) setSummary(next);
    };

    getDriveSummary(driveName).then(
      () => answer("available"),
      (error: unknown) => {
        if (!current) return;
        if (!(error instanceof ApiStatusError) || error.status !== 404) {
          answer("unknown");
          return;
        }
        answer("unavailable");
        getAuthStatus().then(
          (status) => {
            if (!current) return;
            setUnlock(
              status.has_protected_drives && !status.is_admin ? "shown" : "hidden",
            );
          },
          () => {
            if (current) setUnlock("hidden");
          },
        );
      },
    );

    return () => {
      current = false;
    };
  }, [driveName]);

  const drivePart = `/drive/${encodeURIComponent(driveName)}`;
  const view = searchParams.get("view");
  const isAddonRoute = isDriveAddonPath(pathname);
  const isCollectionRoute = isDriveCollectionPath(pathname);
  const isAppRoute = isDriveAppPath(pathname);
  const isStandalone = isStandaloneView(view);
  const isCrossFolderRoute = isCrossFolderView(view) || isDriveSearchPath(pathname);

  if (summary === "unavailable") {
    const query = searchParams.toString();
    const redirect = `${pathname}${query ? `?${query}` : ""}`;
    return (
      <DriveUnavailable
        drive={driveName}
        unlockHref={
          unlock === "shown"
            ? `/unlock?redirect=${encodeURIComponent(redirect)}`
            : undefined
        }
      />
    );
  }

  if (isAddonRoute || isStandalone || isCollectionRoute || isAppRoute) {
    return <>{children}</>;
  }

  // The wrapper div mirrors `TwoPaneLayout`'s outer `h-below-header`
  // box so PaneShell's `h-full` chain has a definite height to resolve against.
  if (isCrossFolderRoute) {
    const fileId = searchParams.get("file");
    if (fileId) {
      return (
        <div className="h-below-header w-full overflow-hidden">
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
