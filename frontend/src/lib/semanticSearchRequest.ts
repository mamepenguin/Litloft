import type { FileKind } from "@/types";

import type { SemanticHit } from "./searchMerge";
import { filterQueryParam, type SearchFilter } from "./searchQuery";

const API_BASE = "/api";

export interface SemanticHitsOptions {
  limit?: number;
  type?: FileKind | null;
  includeSceneClip?: boolean;
  filter?: SearchFilter | null;
  passages?: boolean;
  signal?: AbortSignal;
}

export interface SemanticHitsResult {
  ok: boolean;
  results: SemanticHit[];
  /** The HTTP status when the server answered; absent when no request was sent. */
  status?: number;
}

export function semanticSearchHeaders(drive: string): Record<string, string> {
  return { "X-Lit-Drive": encodeURIComponent(drive) };
}

export function semanticHitsUrl(query: string, options?: SemanticHitsOptions): string {
  const params = new URLSearchParams({ q: query.trim() });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.passages) params.set("passages", "true");
  if (options?.filter) {
    params.set("filter", filterQueryParam(options.filter));
  } else {
    if (options?.type) params.set("type", options.type);
    if (options?.includeSceneClip) params.set("include_scene_clip", "true");
  }
  return `${API_BASE}/addons/intelligence/search?${params.toString()}`;
}

export async function readSemanticHits(res: Response): Promise<SemanticHitsResult> {
  if (!res.ok) return { ok: false, results: [], status: res.status };
  const data = (await res.json()) as {
    available?: boolean;
    results?: SemanticHit[];
  };
  if (!data?.available) return { ok: false, results: [], status: res.status };
  return {
    ok: true,
    results: Array.isArray(data.results) ? data.results : [],
    status: res.status,
  };
}
