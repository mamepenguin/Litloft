"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

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
 * Topic 3 (vault-core merger 2026-05-08, hako tP8wYvAB9qEDQmrjsdtGQ):
 *   フォルダ移動 = push、ファイル選択 = replace。
 *
 * This hook owns only the `?file` parameter; folder navigation lives
 * elsewhere because path changes go through `router.push`.
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
      const params = new URLSearchParams(searchParams.toString());
      params.set(FILE_PARAM, id);
      router.replace(buildHref(params));
    },
    [router, searchParams, buildHref],
  );

  const clearFile = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has(FILE_PARAM)) return;
    params.delete(FILE_PARAM);
    router.replace(buildHref(params));
  }, [router, searchParams, buildHref]);

  return { fileId, selectFile, clearFile };
}
