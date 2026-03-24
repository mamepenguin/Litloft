"use client";

import { useParams, useSearchParams } from "next/navigation";

import { FolderBrowser } from "@/components/FolderBrowser";

export default function DrivePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const view = searchParams.get("view");
  const tagFilter = searchParams.get("tag");

  return (
    <FolderBrowser
      driveName={driveName}
      view={view}
      tagFilter={tagFilter}
    />
  );
}
