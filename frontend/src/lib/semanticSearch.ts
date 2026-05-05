/**
 * Thin core-side wrapper around the intelligence addon's `/search`
 * HTTP endpoint, plus a per-drive availability probe driven by the
 * core addon registry.
 *
 * Availability is read from the core's ``/api/addons/status?drive=…``
 * (already filtered by ``drives.json`` per-drive policy) rather than
 * from the addon's own ``/status``. The addon's ``/status`` is
 * admin-gated because it surfaces process-global queue counters;
 * using it as an availability probe meant a viewer who had not
 * unlocked every protected drive saw semantic search disabled
 * everywhere, including drives they could fully access.
 */

import { getEnabledAddons } from "./addons";
import type { FileType } from "@/types";
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
    type?: FileType | null;
    /**
     * When `true`, the addon unions in scene-frame CLIP embeddings
     * (`embedding_type="clip"`) alongside the default representative-
     * frame route (`embedding_type="clip_thumbnail"`). The scene-search
     * toggle on the search page drives this flag. Spec
     * `2026-05-02-thumbnail-clip-default-shallow-search.md`.
     */
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
