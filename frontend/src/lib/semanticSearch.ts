/**
 * Availability is read from the core's ``/api/addons/status?drive=…``
 * rather than from the addon's own ``/status``, which is admin-gated
 * because it surfaces process-global queue counters.
 */

import { getEnabledAddons } from "./addons";
import type { FileKind } from "@/types";
import type { SemanticHit } from "./searchMerge";
import type { SearchFilter } from "./searchQuery";
import {
  readSemanticHits,
  semanticHitsUrl,
  semanticImagesUrl,
  semanticPost,
  semanticSearchHeaders,
  type SemanticHitsOptions,
  type SemanticHitsResult,
} from "./semanticSearchRequest";

export type { SemanticHitsOptions, SemanticHitsResult };

export async function isSemanticSearchAvailable(drive: string): Promise<boolean> {
  if (!drive) return false;
  const addons = await getEnabledAddons(drive);
  return Boolean(addons["intelligence"]);
}

export async function fetchSemanticHits(
  query: string,
  drive: string,
  options?: SemanticHitsOptions,
): Promise<SemanticHitsResult> {
  if (!query.trim() || !drive) return { ok: false, results: [] };
  try {
    const post = options?.fileIds ? semanticPost(options.fileIds) : null;
    const res = await fetch(semanticHitsUrl(query, options), {
      credentials: "include",
      headers: {
        ...semanticSearchHeaders(drive),
        ...(post?.headers ?? {}),
      },
      signal: options?.signal,
      ...(post ? { method: post.method, body: post.body } : {}),
    });
    return await readSemanticHits(res);
  } catch {
    return { ok: false, results: [] };
  }
}

export interface SemanticImagesResult {
  ok: boolean;
  results: SemanticHit[];
}

export async function fetchSemanticImages(
  query: string,
  drive: string,
  options?: {
    type?: FileKind | null;
    filter?: SearchFilter | null;
    fileIds?: readonly string[];
    signal?: AbortSignal;
  },
): Promise<SemanticImagesResult> {
  if (!query.trim() || !drive) return { ok: false, results: [] };
  const post = options?.fileIds ? semanticPost(options.fileIds) : null;
  try {
    const res = await fetch(semanticImagesUrl(query, options), {
      credentials: "include",
      headers: {
        ...semanticSearchHeaders(drive),
        ...(post?.headers ?? {}),
      },
      signal: options?.signal,
      ...(post ? { method: post.method, body: post.body } : {}),
    });
    if (!res.ok) return { ok: false, results: [] };
    const data = (await res.json()) as {
      available?: boolean;
      results?: SemanticHit[];
    };
    if (!data?.available) return { ok: false, results: [] };
    return { ok: true, results: Array.isArray(data.results) ? data.results : [] };
  } catch {
    return { ok: false, results: [] };
  }
}
