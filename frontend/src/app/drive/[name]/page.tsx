"use client";

import { useParams, useSearchParams } from "next/navigation";

import { FolderBrowser } from "@/components/FolderBrowser";
import { DriveHome } from "@/components/DriveHome";
import { TrashView } from "@/components/trash/TrashView";
import { MissingView } from "@/components/missing/MissingView";
import { normaliseDriveView } from "@/lib/driveViews";

export default function DrivePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const view = normaliseDriveView(searchParams.get("view"));
  const tagFilter = searchParams.get("tag");

  if (view === "trash") {
    return <TrashView driveName={driveName} />;
  }

  if (view === "missing") {
    return <MissingView driveName={driveName} />;
  }

  // Ahead of the tag and pass-through branches: reached after them, Home would
  // enter the browser with no folder to stand in and serve the whole drive.
  if (view === "home") {
    return <DriveHome driveName={driveName} />;
  }

  if (view || tagFilter) {
    return <FolderBrowser driveName={driveName} view={view} tagFilter={tagFilter} />;
  }

  // `""` is the root's own `folder_path`, not a missing one: the drive root is
  // a location, where a cross-folder view is not.
  return <FolderBrowser driveName={driveName} folderPath="" />;
}
