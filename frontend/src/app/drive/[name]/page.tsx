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
        // own `folder_path`. This looks at `view` alone, so
        // `?view=library&tag=x` is a location too — what a tag does there
        // is settled downstream, where `path=""` asked recursively covers
        // the whole drive and the write actions are withheld. A URL with
        // no `view` at all, `?tag=x` included, has no folder to stand in
        // and passes none.
        folderPath={isLibraryRootView(view) ? "" : undefined}
        view={view}
        tagFilter={tagFilter}
      />
    );
  }

  return <DriveHome driveName={driveName} />;
}
