"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { navigationGuard } from "@/lib/navigationGuard";

const FILE_PARAM = "file";

export interface SelectedFileApi {
  /** Currently selected file id from `?file=`, or null. */
  fileId: string | null;
  /** Replace the URL with `?file={id}` (history not pushed). */
  selectFile: (id: string) => void;
  /** Remove `?file` from the URL via replace. */
  clearFile: () => void;
}

/**
 * URL-state for the right-pane file selection in 2ペイン mode.
 *
 * History-control rule (B6, hako l3PpLicBu_d9s7zzYIla-):
 *   - first selection (no ?file → file)        → router.push
 *   - switching files (file → other file)      → router.replace
 *   - clearing the selection (file → no ?file) → router.replace
 *
 * Tree browsing and reading-a-file are distinct user states, so the
 * first selection earns a history entry. Hopping between files is
 * the same "reading mode" so we coalesce. Mobile swipe-back from a
 * file lands on the tree once (B6), not two folders up.
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
      // The tree pane stays put across this navigation — keep the
      // window scroll where the user was reading from. The whole
      // ?file swap is wrapped in ``navigationGuard.request`` so a
      // dirty editor on the previous file gets a chance to ask
      // "discard?" via ``<DirtyBlocker />`` (PR-5).
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
