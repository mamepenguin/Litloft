import type { FileItem, FileKind } from "@/types";
import type { SemanticHit } from "./searchMerge";

export interface SearchCacheKey {
  drive: string;
  query: string;
  type: FileKind | null;
  includeSceneClip: boolean;
}

export interface SearchCacheEntry {
  filenameMatches: FileItem[];
  filenameTotal: number;
  semanticHits: SemanticHit[];
  ts: number;
}

const TTL_MS = 60_000;

const cache = new Map<string, SearchCacheEntry>();

export function searchCacheKey(k: SearchCacheKey): string {
  return `${k.drive}::${k.query}::${k.type ?? "all"}::${k.includeSceneClip ? 1 : 0}`;
}

export function readSearchCache(k: SearchCacheKey): SearchCacheEntry | null {
  const entry = cache.get(searchCacheKey(k));
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(searchCacheKey(k));
    return null;
  }
  return entry;
}

export function writeSearchCache(
  k: SearchCacheKey,
  partial: Partial<Omit<SearchCacheEntry, "ts">>,
): void {
  const key = searchCacheKey(k);
  const prev = cache.get(key);
  const merged: SearchCacheEntry = {
    filenameMatches: partial.filenameMatches ?? prev?.filenameMatches ?? [],
    filenameTotal: partial.filenameTotal ?? prev?.filenameTotal ?? 0,
    semanticHits: partial.semanticHits ?? prev?.semanticHits ?? [],
    ts: Date.now(),
  };
  cache.set(key, merged);
}

export function clearSearchCache(): void {
  cache.clear();
}
