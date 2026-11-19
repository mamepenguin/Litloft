import type { VideoTargetParams } from "@/lib/videoAppTarget";

export interface CachedItem {
  id: string;
  byline?: string;
}

interface RemovedItem {
  item: CachedItem;
  index: number;
}

const stored = new Map<string, readonly CachedItem[]>();
/** Ids removed under each cache key, with the item and index they left at. */
const removed = new Map<string, Map<string, RemovedItem>>();

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
  /** The target's identity: `""` outside a member target, so it cannot share an entry with one. */
  requestKey: string;
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
    key.requestKey,
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

/** Drops ids removed under `key` from a list about to be stored or rebuilt. */
export function withoutRemovedItems(key: string, items: readonly CachedItem[]): CachedItem[] {
  const gone = removed.get(key);
  return items.filter((item) => !gone?.has(item.id)).map((item) => ({ ...item }));
}

/**
 * Removes an id from the stored ids under `key`, remembering the item and the
 * index it left at so an undo can put it back. Repeating the removal keeps the
 * first index.
 */
export function removeCachedItem(key: string, id: string): void {
  const items = stored.get(key) ?? [];
  const index = items.findIndex((item) => item.id === id);
  const gone = removed.get(key) ?? new Map<string, RemovedItem>();
  if (!gone.has(id)) {
    gone.set(id, {
      item: index >= 0 ? { ...items[index] } : { id },
      index: index >= 0 ? index : items.length,
    });
  }
  removed.set(key, gone);
  if (index >= 0) {
    stored.set(key, items.filter((item) => item.id !== id));
  }
}

/**
 * Puts an id removed under `key` back at the index it left, clamped to the
 * list's current length. An id that was never removed is left alone.
 */
export function restoreCachedItem(key: string, id: string): void {
  const gone = removed.get(key);
  const entry = gone?.get(id);
  if (!gone || !entry) return;
  gone.delete(id);
  if (gone.size === 0) removed.delete(key);

  const items = stored.get(key);
  if (items === undefined) return;
  const index = Math.min(entry.index, items.length);
  stored.set(key, [...items.slice(0, index), entry.item, ...items.slice(index)]);
}

export function resetDiscoverCache(): void {
  stored.clear();
  removed.clear();
}

export function localDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
