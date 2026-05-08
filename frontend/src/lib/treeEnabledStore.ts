"use client";

/**
 * Tree (folder navigation pane) visibility store.
 *
 * Phase 3 redesign: tree visibility is orthogonal to grid/list view mode
 * (Topic 1 補正, hako w4zVT8-dyYwshLNiJ5REY). Persistence is per-drive via
 * localStorage so a tab can navigate across `/drive/{name}/page.tsx` ↔
 * `/drive/{name}/[...path]/page.tsx` (separate Next.js page files) without
 * losing the user's choice.
 *
 * Module-level cache + listener set is needed on top of localStorage
 * because the same-tab `storage` event does NOT fire — multiple components
 * within one tab need a private subscriber bus to stay in sync.
 */

const STORAGE_PREFIX = "tree:enabled:";

type Listener = () => void;

const listeners = new Set<Listener>();
const cache = new Map<string, boolean>();

function emit() {
  for (const l of listeners) l();
}

function read(drive: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${drive}`) === "true";
  } catch {
    return false;
  }
}

export const treeEnabledStore = {
  get(drive: string): boolean {
    if (!cache.has(drive)) cache.set(drive, read(drive));
    return cache.get(drive)!;
  },
  set(drive: string, next: boolean): void {
    if (cache.get(drive) === next) return;
    cache.set(drive, next);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${drive}`, String(next));
      } catch {
        // localStorage quota exceeded — silently drop
      }
    }
    emit();
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Test helper. Clears the in-memory cache and listeners. */
  reset(): void {
    cache.clear();
    listeners.clear();
  },
};
