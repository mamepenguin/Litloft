"use client";

/**
 * A boolean the user sets per drive, remembered in localStorage.
 *
 * Two of the tree pane's controls want exactly this and nothing more:
 * whether the tree is showing at all, and whether it lists files as well
 * as folders. Both are per-drive because a drive of notes and a drive of
 * video want different answers, and both have to survive the navigation
 * between `/drive/{name}/page.tsx` and `/drive/{name}/[...path]/page.tsx`
 * — separate Next.js page files, so component state does not carry over.
 *
 * The module-level cache and listener set are needed on top of
 * localStorage because the `storage` event does not fire in the tab that
 * wrote the value: components in one tab need a private bus to stay in
 * step with each other.
 */

type Listener = () => void;

export interface DriveScopedFlag {
  get(drive: string): boolean;
  set(drive: string, next: boolean): void;
  subscribe(fn: Listener): () => void;
  /** Test helper. Clears the in-memory cache and listeners. */
  reset(): void;
}

export function createDriveScopedFlag(storagePrefix: string): DriveScopedFlag {
  const listeners = new Set<Listener>();
  const cache = new Map<string, boolean>();

  const read = (drive: string): boolean => {
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem(`${storagePrefix}${drive}`) === "true";
    } catch {
      return false;
    }
  };

  return {
    get(drive) {
      if (!cache.has(drive)) cache.set(drive, read(drive));
      return cache.get(drive)!;
    },
    set(drive, next) {
      if (cache.get(drive) === next) return;
      cache.set(drive, next);
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(`${storagePrefix}${drive}`, String(next));
        } catch {
          // localStorage quota exceeded — silently drop
        }
      }
      for (const l of listeners) l();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    reset() {
      cache.clear();
      listeners.clear();
    },
  };
}
