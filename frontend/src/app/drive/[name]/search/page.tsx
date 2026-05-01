"use client";

import { useParams, useSearchParams } from "next/navigation";

import { FolderBrowser } from "@/components/FolderBrowser";
import type { FileType } from "@/types";

const VALID_TYPES: ReadonlyArray<FileType> = [
  "video",
  "image",
  "audio",
  "document",
  "archive",
  "other",
];

function parseTypeFilter(raw: string | null): FileType | null {
  if (!raw) return null;
  return (VALID_TYPES as readonly string[]).includes(raw) ? (raw as FileType) : null;
}

export default function SearchPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const q = searchParams.get("q") ?? "";
  const typeFilter = parseTypeFilter(searchParams.get("type"));
  const smartFolderId = searchParams.get("smart_folder_id");

  return (
    <FolderBrowser
      driveName={driveName}
      searchQuery={q}
      typeFilter={typeFilter}
      smartFolderId={smartFolderId}
    />
  );
}
