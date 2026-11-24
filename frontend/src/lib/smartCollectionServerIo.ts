import type { SmartFolder } from "@/types/smartFolder";

import { addonsStatusUrl, readAddonsStatus } from "./addonStatusRequest";
import { listingUrl, readListingPage } from "./listingRequest";
import { readSemanticHits, semanticHitsUrl, semanticSearchHeaders } from "./semanticSearchRequest";
import type { SmartCollectionEvalIo } from "./smartCollectionEval";

const DEFAULT_BACKEND_URL = "http://backend:8000";

const FORWARDED_HEADERS = ["cookie", "authorization"] as const;

/**
 * The endpoint calls the backend directly; the `/api/*` rewrite in
 * `next.config.ts` is hard-coded and does not follow `BACKEND_URL`.
 */
export function backendUrl(path: string): string {
  const base = (process.env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
  return `${base}${path}`;
}

export function forwardedHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = incoming.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

export type SmartFoldersAnswer =
  | { ok: true; folders: SmartFolder[] }
  | { ok: false; status: number; body: string; contentType: string | null };

export async function fetchSmartFolders(
  drive: string,
  headers: Headers,
  signal: AbortSignal,
): Promise<SmartFoldersAnswer> {
  const res = await fetch(backendUrl(`/api/drives/${encodeURIComponent(drive)}/smart-folders`), {
    headers,
    signal,
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: await res.text(),
      contentType: res.headers.get("content-type"),
    };
  }
  return { ok: true, folders: (await res.json()) as SmartFolder[] };
}

export function createSmartCollectionServerIo(
  headers: Headers,
  signal: AbortSignal,
): SmartCollectionEvalIo {
  return {
    getDriveFiles: async (drive, params) => {
      const res = await fetch(backendUrl(listingUrl(drive, params)), { headers, signal });
      return readListingPage(res);
    },
    getSemanticAvailability: async (drive) => {
      try {
        const answer = await readAddonsStatus(
          await fetch(backendUrl(addonsStatusUrl(drive)), { headers, signal }),
        );
        if (!answer.answered) return "unknown";
        return answer.status.addons["intelligence"] ? "available" : "off";
      } catch {
        return "unknown";
      }
    },
    fetchSemanticHits: async (query, drive, options) => {
      if (!query.trim() || !drive) return { ok: false, results: [] };
      try {
        const requestHeaders = new Headers(headers);
        for (const [name, value] of Object.entries(semanticSearchHeaders(drive))) {
          requestHeaders.set(name, value);
        }
        const res = await fetch(backendUrl(semanticHitsUrl(query, options)), {
          headers: requestHeaders,
          signal,
        });
        return await readSemanticHits(res);
      } catch {
        return { ok: false, results: [] };
      }
    },
  };
}
