/**
 * Thin core-side wrapper around the intelligence addon's `/search` and
 * `/status` HTTP endpoints.
 *
 * Core needs to call these for the unified search results page (spec
 * `2026-05-02-search-results-unification-phase3.md`) without importing
 * the addon's TypeScript module — the HTTP routes are the public
 * contract the addon publishes. When the addon is uninstalled, both
 * helpers return "unavailable" / "no hits" so the search page falls
 * back to filename-only.
 */

import type { FileType } from "@/types";
import type { SemanticHit } from "./searchMerge";

const API_BASE = "/api";

function driveHeaders(drive: string): HeadersInit {
  return { "X-Lit-Drive": encodeURIComponent(drive) };
}

export async function isSemanticSearchAvailable(drive: string): Promise<boolean> {
  if (!drive) return false;
  try {
    const res = await fetch(`${API_BASE}/addons/intelligence/status`, {
      credentials: "include",
      headers: driveHeaders(drive),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { available?: boolean };
    return !!data?.available;
  } catch {
    return false;
  }
}

export async function fetchSemanticHits(
  query: string,
  drive: string,
  options?: { limit?: number; type?: FileType | null },
): Promise<SemanticHit[]> {
  if (!query.trim() || !drive) return [];
  const params = new URLSearchParams({ q: query.trim() });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.type) params.set("type", options.type);
  try {
    const res = await fetch(
      `${API_BASE}/addons/intelligence/search?${params.toString()}`,
      { credentials: "include", headers: driveHeaders(drive) },
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
