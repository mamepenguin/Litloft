"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { readFolderPosition } from "./folderPosition";

/** The Library's folder position, held in the URL and never anywhere else. */
export function useFolderPositionUrl() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { value, invalid } = readFolderPosition(search.get("folder"));

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
    replaceQuery((next) => {
      next.delete("target");
      next.delete("folder");
    });
  }, [replaceQuery, search]);

  const dropFolder = useCallback(() => {
    if (!search.has("folder")) return;
    replaceQuery((next) => next.delete("folder"));
  }, [replaceQuery, search]);

  return { position: value, chooseFolder, dropTargetAndFolder, dropFolder };
}
