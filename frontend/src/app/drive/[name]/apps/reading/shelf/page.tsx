"use client";

import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";

import { parseGrouping, ReadingShelfPage } from "@/components/readingapp/ReadingShelfPage";

export default function ReadingShelfRoute() {
  const params = useParams();
  const search = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const router = useRouter();
  const pathname = usePathname();
  const dropFilters = () => {
    if (!search.has("tag") && !search.has("watch") && !search.has("folder")) return;
    const next = new URLSearchParams(search);
    next.delete("tag");
    next.delete("watch");
    next.delete("folder");
    router.replace(`${pathname}?${next}`);
  };
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
      onTargetChosen={dropFilters}
      from={search.get("from")}
      homeEntry="reading"
    />
  );
}
