"use client";

/**
 * Reads bypass any module cache so that test setup which calls
 * `localStorage.clear()` between cases is honored without an explicit
 * reset hook. Writes broadcast to all subscribers within the same tab
 * because `storage` events do not fire for the originating window.
 */

import { MOBILE_BREAKPOINT } from "@/hooks/useIsMobile";

const STORAGE_PREFIX = "inspector-open:";

export function inspectorOpenStorageKey(drive: string): string {
  return `${STORAGE_PREFIX}${drive}`;
}
/**
 * Not the 960px in `globals.css`, which is about the host's width, not the
 * viewport. Do not raise it: above it, transcript and chapters start hidden.
 */
const VIEWPORT_OPEN_THRESHOLD = 1120;

type Listener = () => void;

const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

function readPersisted(drive: string): boolean | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${drive}`);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

function viewportDefault(isPlayerFile: boolean): boolean {
  if (typeof window === "undefined") return false;
  // A player file off a phone never stacks over the player, and beside it
  // the row always had room, so its inspector is worth starting open. Any
  // other file in a narrow row would cover what the reader came to read.
  if (isPlayerFile && window.innerWidth >= MOBILE_BREAKPOINT) return true;
  return window.innerWidth >= VIEWPORT_OPEN_THRESHOLD;
}

export const inspectorOpenStore = {
  get(drive: string, isPlayerFile = false): boolean {
    const persisted = readPersisted(drive);
    if (persisted !== null) return persisted;
    return viewportDefault(isPlayerFile);
  },
  set(drive: string, next: boolean): void {
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
  /**
   * When the user resizes the window across the threshold without ever
   * interacting with the inspector (no localStorage entry), subscribers
   * need a chance to re-read the snapshot. Call this from the layout's
   * `resize` handler.
   */
  notifyViewportChange(): void {
    emit();
  },
};
