"use client";

/**
 * Inspector pane open/closed store (drive-scoped).
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md` §D3.
 *
 * Persisted per-drive via `localStorage["inspector-open:{drive}"]` (mirrors
 * the `tree:enabled:{drive}` convention). When the persisted value is
 * missing or corrupt, the open state is derived from the viewport width:
 * `>= 1120px` → open, otherwise closed.
 *
 * Reads bypass any module cache so that test setup which calls
 * `localStorage.clear()` between cases is honored without an explicit
 * reset hook. Writes broadcast to all subscribers within the same tab
 * because `storage` events do not fire for the originating window.
 */

const STORAGE_PREFIX = "inspector-open:";

/**
 * Where a drive's choice is kept.
 *
 * Exported so a test can arrange the state this store reads without
 * writing the prefix out again — which is the same key in two places,
 * and the copy in the test is the one nothing would update.
 */
export function inspectorOpenStorageKey(drive: string): string {
  return `${STORAGE_PREFIX}${drive}`;
}
/**
 * Viewport width at which the inspector starts open.
 *
 * 1120px, and deliberately not the 960px (`60rem`) in `globals.css`.
 * Those measure different things and the band between them is a real
 * state: 960 asks whether a rail *can* sit beside the player, against
 * the host's measured width; this asks whether the inspector *should*
 * start open, against the viewport. Merging them would make "they fit,
 * but stay closed until asked for" unsayable. `DESIGN.md` §8.5 has the
 * table.
 *
 * Not a layout branch either, which is why it reads the viewport at all
 * while the other reads a container: it only derives an initial value
 * when the drive has no stored choice, and any choice the reader makes
 * outranks it.
 *
 * It was 1280 until 2026-09. That left a band where the redesign's
 * default — the transcript and chapters as inspector tabs — had nowhere
 * to be: a video opened between 1120 and 1279 had both panels mounted
 * behind an inspector that started closed, with nothing on screen and
 * nothing pressed.
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
   * Notify subscribers that the viewport has changed.
   *
   * The default open/closed state derives from `window.innerWidth >=
   * 1120px`. When the user resizes the window across that threshold
   * without ever interacting with the inspector (no localStorage entry),
   * subscribers using {@link useSyncExternalStore} need a chance to
   * re-read the snapshot. Call this from the layout's `resize` handler.
   */
  notifyViewportChange(): void {
    emit();
  },
};
