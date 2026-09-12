"use client";

import { useParams, useSearchParams } from "next/navigation";

import { FolderBrowser } from "@/components/FolderBrowser";
import { DriveHome } from "@/components/DriveHome";
import { TrashView } from "@/components/trash/TrashView";
import { MissingView } from "@/components/missing/MissingView";
import { isLibraryRootView } from "@/lib/driveViews";

export default function DrivePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const view = searchParams.get("view");
  const tagFilter = searchParams.get("tag");

  if (view === "trash") {
    return <TrashView driveName={driveName} />;
  }

  if (view === "missing") {
    return <MissingView driveName={driveName} />;
  }

  if (view || tagFilter) {
    return (
      <FolderBrowser
        driveName={driveName}
        // The Library root is the drive's root folder, so it enters the
        // browser as a location rather than as a view: `""` is the root's
        // own `folder_path`. Every other `?view=` value, and a tag filter
        // applied here, has no folder to stand in and passes none.
        folderPath={isLibraryRootView(view) ? "" : undefined}
        view={view}
        tagFilter={tagFilter}
      />
    );
  }

  return <DriveHome driveName={driveName} />;
}
