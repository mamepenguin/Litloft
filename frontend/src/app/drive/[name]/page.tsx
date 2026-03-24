"use client";

import { useParams, useSearchParams } from "next/navigation";

import { FolderBrowser } from "@/components/FolderBrowser";
import { DriveHome } from "@/components/DriveHome";

export default function DrivePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const view = searchParams.get("view");
  const tagFilter = searchParams.get("tag");

  if (view || tagFilter) {
    return (
      <FolderBrowser
        driveName={driveName}
        view={view}
        tagFilter={tagFilter}
      />
    );
  }

  return <DriveHome driveName={driveName} />;
}
