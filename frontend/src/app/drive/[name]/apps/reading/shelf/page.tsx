"use client";

import { useParams, useSearchParams } from "next/navigation";

import { parseGrouping, ReadingShelfPage } from "@/components/readingapp/ReadingShelfPage";

export default function ReadingShelfRoute() {
  const params = useParams();
  const search = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  return (
    <ReadingShelfPage
      key={driveName}
      drive={driveName}
      by={parseGrouping(search.get("by"))}
      shelfKey={search.get("key") ?? ""}
      initialSort={search.get("sort")}
      folders={search.getAll("folder").filter(Boolean)}
      tags={search.getAll("tag").filter(Boolean)}
      watch={search.get("watch")}
    />
  );
}
