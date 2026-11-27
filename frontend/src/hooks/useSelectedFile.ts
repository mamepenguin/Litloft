"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { navigationGuard } from "@/lib/navigationGuard";
import { queueKeepsFile } from "@/components/queue/queueSelectionStore";

const FILE_PARAM = "file";

/** Places inside one file; they mean nothing in the next one. */
const FILE_LOCATION_PARAMS = ["section", "page", "t", "highlight", "find"] as const;

/** The folder queue's parameters; Play all added the sort and order. */
const QUEUE_PARAMS = ["queue", "sort", "order"] as const;

function dropQueue(params: URLSearchParams): void {
  for (const key of QUEUE_PARAMS) params.delete(key);
}

export interface SelectedFileApi {
  fileId: string | null;
  selectFile: (id: string) => void;
  clearFile: () => void;
}

/**
 * Tree browsing and reading-a-file are distinct user states, so the
 * first selection earns a history entry. Hopping between files is
 * the same "reading mode" so we coalesce.
 */
export function useSelectedFile(): SelectedFileApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileId = searchParams.get(FILE_PARAM);

  const buildHref = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const selectFile = useCallback(
    (id: string) => {
      navigationGuard.request(() => {
        const wasFileSelected = searchParams.has(FILE_PARAM);
        const params = new URLSearchParams(searchParams.toString());
        if (params.get(FILE_PARAM) !== id) {
          for (const key of FILE_LOCATION_PARAMS) params.delete(key);
        }
        if (params.has("queue") && !queueKeepsFile(id)) dropQueue(params);
        params.set(FILE_PARAM, id);
        const href = buildHref(params);
        if (wasFileSelected) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router, searchParams, buildHref],
  );

  const clearFile = useCallback(() => {
    if (!searchParams.has(FILE_PARAM)) return;
    navigationGuard.request(() => {
      if (searchParams.get("nav") === "inbox") {
        const driveBase = pathname.split("/").slice(0, 3).join("/");
        router.replace(`${driveBase}?view=inbox`, { scroll: false });
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.delete(FILE_PARAM);
      if (params.has("queue")) dropQueue(params);
      router.replace(buildHref(params), { scroll: false });
    });
  }, [router, searchParams, buildHref, pathname]);

  return { fileId, selectFile, clearFile };
}
