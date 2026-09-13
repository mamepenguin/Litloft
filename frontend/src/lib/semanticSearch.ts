/**
 * Availability is read from the core's ``/api/addons/status?drive=…``
 * rather than from the addon's own ``/status``, which is admin-gated
 * because it surfaces process-global queue counters.
 */

import { getEnabledAddons } from "./addons";
import type { FileKind } from "@/types";
import type { SemanticHit } from "./searchMerge";

const API_BASE = "/api";

function driveHeaders(drive: string): HeadersInit {
  return { "X-Lit-Drive": encodeURIComponent(drive) };
}

export async function isSemanticSearchAvailable(drive: string): Promise<boolean> {
  if (!drive) return false;
  const addons = await getEnabledAddons(drive);
  return Boolean(addons["intelligence"]);
}

export async function fetchSemanticHits(
  query: string,
  drive: string,
  options?: {
    limit?: number;
    type?: FileKind | null;
    includeSceneClip?: boolean;
    signal?: AbortSignal;
  },
): Promise<SemanticHit[]> {
  if (!query.trim() || !drive) return [];
  const params = new URLSearchParams({ q: query.trim() });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.type) params.set("type", options.type);
  if (options?.includeSceneClip) params.set("include_scene_clip", "true");
  try {
    const res = await fetch(
      `${API_BASE}/addons/intelligence/search?${params.toString()}`,
      {
        credentials: "include",
        headers: driveHeaders(drive),
        signal: options?.signal,
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      available?: boolean;
      results?: SemanticHit[];
    };
    if (!data?.available) return [];
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}
