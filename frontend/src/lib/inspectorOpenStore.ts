"use client";

/**
 * Reads bypass any module cache so that test setup which calls
 * `localStorage.clear()` between cases is honored without an explicit
 * reset hook. Writes broadcast to all subscribers within the same tab
 * because `storage` events do not fire for the originating window.
 */

const STORAGE_PREFIX = "inspector-open:";

export function inspectorOpenStorageKey(drive: string): string {
  return `${STORAGE_PREFIX}${drive}`;
}
/**
 * Deliberately not the 960px (`60rem`) in `globals.css`: 960 asks whether
 * a rail *can* sit beside the player, against the host's measured width;
 * this asks whether the inspector *should* start open, against the
 * viewport.
 *
 * **Do not raise it.** A media file's transcript and chapters are
 * inspector tabs by default, so every pixel this sits above 1120 is a
 * band where a video opens with both of them mounted behind a closed
 * pane.
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

function viewportDefault(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= VIEWPORT_OPEN_THRESHOLD;
}

export const inspectorOpenStore = {
  get(drive: string): boolean {
    const persisted = readPersisted(drive);
    if (persisted !== null) return persisted;
    return viewportDefault();
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
