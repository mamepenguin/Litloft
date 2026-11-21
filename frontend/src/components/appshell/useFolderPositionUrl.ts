"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { readFolderPosition } from "./folderPosition";

/** The Library's folder position, held in the URL and never anywhere else. */
export function useFolderPositionUrl() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { value, invalid } = readFolderPosition(search.get("folder"));
  // router.replace lands in a later render; until it does, a dropped position
  // must not reach the requests made for the target chosen in the same step.
  const [droppedAt, setDroppedAt] = useState<string | null>(null);
  const current = search.toString();
  const position = droppedAt === current ? null : value;
  useEffect(() => {
    if (droppedAt !== null && droppedAt !== current) setDroppedAt(null);
  }, [current, droppedAt]);

  const replaceQuery = useCallback(
    (change: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(search);
      change(next);
      const query = next.toString();
      router.replace(query === "" ? pathname : `${pathname}?${query}`);
    },
    [pathname, router, search],
  );

  useEffect(() => {
    if (!invalid) return;
    replaceQuery((next) => next.delete("folder"));
  }, [invalid, replaceQuery]);

  const chooseFolder = useCallback(
    (folder: string | null) => {
      const next = new URLSearchParams(search);
      if (folder === null) next.delete("folder");
      else next.set("folder", folder);
      const query = next.toString();
      router.push(query === "" ? pathname : `${pathname}?${query}`);
      window.scrollTo(0, 0);
    },
    [pathname, router, search],
  );

  const dropTargetAndFolder = useCallback(() => {
    if (!search.has("target") && !search.has("folder")) return;
    setDroppedAt(current);
    replaceQuery((next) => {
      next.delete("target");
      next.delete("folder");
    });
  }, [current, replaceQuery, search]);

  const dropFolder = useCallback(() => {
    if (!search.has("folder")) return;
    setDroppedAt(current);
    replaceQuery((next) => next.delete("folder"));
  }, [current, replaceQuery, search]);

  return { position, chooseFolder, dropTargetAndFolder, dropFolder };
}
