"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";

import { normaliseName } from "@/components/appshell/NameFilter";
import { writeLibraryFilters } from "@/components/appshell/libraryFilters";
import { parseGrouping, VideoShelfPage } from "@/components/videoapp/VideoShelfPage";

function replaceQuery(
  pathname: string,
  search: URLSearchParams,
  change: (next: URLSearchParams) => void,
): string {
  const next = new URLSearchParams(search);
  change(next);
  const query = next.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}

export default function VideoShelfRoute() {
  const params = useParams();
  const search = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const router = useRouter();
  const pathname = usePathname();
  const rawName = search.get("q");
  const name = normaliseName(rawName ?? "");
  const from = search.get("from");

  useEffect(() => {
    if (rawName === null) return;
    if (rawName === name && rawName !== "") return;
    router.replace(
      replaceQuery(pathname, search, (next) => {
        if (name === "") next.delete("q");
        else next.set("q", name);
      }),
    );
  }, [rawName, name, pathname, router, search]);

  const applyName = useCallback(
    (next: string) => {
      const applied = normaliseName(next);
      router.replace(
        replaceQuery(pathname, search, (params) => {
          if (applied === "") params.delete("q");
          else params.set("q", applied);
        }),
      );
      if (from === "library") writeLibraryFilters("video", driveName, { name: applied });
    },
    [driveName, from, pathname, router, search],
  );

  const leavePending = useCallback(
    (next: string) => {
      writeLibraryFilters("video", driveName, { name: normaliseName(next) });
    },
    [driveName],
  );

  const dropFilters = useCallback(() => {
    if (!search.has("tag") && !search.has("watch") && !search.has("q")) return;
    router.replace(
      replaceQuery(pathname, search, (next) => {
        next.delete("tag");
        next.delete("watch");
        next.delete("q");
      }),
    );
  }, [pathname, router, search]);

  return (
    <VideoShelfPage
      key={driveName}
      drive={driveName}
      by={parseGrouping(search.get("by"))}
      shelfKey={search.get("key") ?? ""}
      initialSort={search.get("sort")}
      tags={search.getAll("tag").filter(Boolean)}
      watch={search.get("watch")}
      name={name}
      onNameChange={applyName}
      onLeavePending={from === "library" ? leavePending : undefined}
      onTargetChosen={dropFilters}
      from={from}
      entry={search.get("entry")}
      slot={search.get("slot")}
      homeEntry="video"
    />
  );
}
