"use client";

import { useParams, useSearchParams } from "next/navigation";

import { parseGrouping, VideoShelfPage } from "@/components/videoapp/VideoShelfPage";

export default function VideoShelfRoute() {
  const params = useParams();
  const search = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  return (
    <VideoShelfPage
      key={driveName}
      drive={driveName}
      by={parseGrouping(search.get("by"))}
      shelfKey={search.get("key") ?? ""}
      initialSort={search.get("sort")}
      from={search.get("from")}
      entry={search.get("entry")}
    />
  );
}
