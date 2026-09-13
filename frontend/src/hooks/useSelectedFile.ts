"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { navigationGuard } from "@/lib/navigationGuard";

const FILE_PARAM = "file";

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
      const params = new URLSearchParams(searchParams.toString());
      params.delete(FILE_PARAM);
      router.replace(buildHref(params), { scroll: false });
    });
  }, [router, searchParams, buildHref]);

  return { fileId, selectFile, clearFile };
}
