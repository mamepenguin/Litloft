"use client";

import { useParams, useSearchParams } from "next/navigation";

import { FolderBrowser } from "@/components/FolderBrowser";

export default function FolderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const pathSegments = (params.path as string[]).map(decodeURIComponent);
  const folderPath = pathSegments.join("/");
  const tagFilter = searchParams.get("tag");

  return (
    <FolderBrowser
      driveName={driveName}
      folderPath={folderPath}
      tagFilter={tagFilter}
    />
  );
}
