"use client";

import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";

import { parseGrouping, VideoShelfPage } from "@/components/videoapp/VideoShelfPage";

export default function VideoShelfRoute() {
  const params = useParams();
  const search = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const router = useRouter();
  const pathname = usePathname();
  const dropFilters = () => {
    if (!search.has("tag") && !search.has("watch")) return;
    const next = new URLSearchParams(search);
    next.delete("tag");
    next.delete("watch");
    router.replace(`${pathname}?${next}`);
  };
  return (
    <VideoShelfPage
      key={driveName}
      drive={driveName}
      by={parseGrouping(search.get("by"))}
      shelfKey={search.get("key") ?? ""}
      initialSort={search.get("sort")}
      tags={search.getAll("tag").filter(Boolean)}
      watch={search.get("watch")}
      onTargetChosen={dropFilters}
      from={search.get("from")}
      entry={search.get("entry")}
      slot={search.get("slot")}
      homeEntry="video"
    />
  );
}
