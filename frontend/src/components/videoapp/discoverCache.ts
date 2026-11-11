import type { VideoTargetParams } from "@/lib/videoAppTarget";

export interface CachedItem {
  id: string;
  byline?: string;
}

const stored = new Map<string, readonly CachedItem[]>();

/** Sorted, so a target built in another key order reads as the same target. */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((name) => [name, ordered(record[name])]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(ordered(value));
}

export interface DiscoverCacheKey {
  drive: string;
  params: VideoTargetParams;
  slot: string;
  date: string;
  nickname?: string | null;
  entriesKey?: string;
  addonName?: string | null;
  entryId?: string;
  locale?: string;
}

export function discoverCacheKey(key: DiscoverCacheKey): string {
  return stableJson([
    key.drive,
    key.params,
    key.slot,
    key.date,
    key.nickname ?? null,
    key.entriesKey ?? null,
    key.addonName ?? null,
    key.entryId ?? null,
    key.locale ?? null,
  ]);
}

export function readCachedItems(key: string): readonly CachedItem[] | undefined {
  return stored.get(key);
}

export function writeCachedItems(key: string, items: readonly CachedItem[]): void {
  stored.set(key, items.map((item) => ({ ...item })));
}

export function resetDiscoverCache(): void {
  stored.clear();
}

export function localDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
