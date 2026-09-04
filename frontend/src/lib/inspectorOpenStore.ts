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
 * **Do not raise it.** A media file's transcript and chapters are
 * inspector tabs by default, so every pixel this sits above 1120 is a
 * band where a video opens with both of them mounted behind a closed
 * pane — nothing on screen, and nothing pressed to put it there.
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
  /**
   * @param fitsBeside  Whether the row can hold the inspector beside the
   *   canvas, when that has been measured. **ANDed with the viewport
   *   default, never reconciled with it** — the same treatment
   *   `globals.css` gives the rail, and for the same reason recorded
   *   there: two conditions that must agree eventually disagree, while
   *   two that are ANDed cannot.
   *
   *   It only touches the *derived* default. A stored choice outranks
   *   both, so a reader who has opened the inspector still gets it,
   *   covering the canvas, which is what they asked for.
   *
   *   Without this the fix for a squeezed canvas is not a fix: at the
   *   widths where the inspector has to overlay, the viewport default
   *   is open, so the page arrives with the panel over the video
   *   instead of beside a narrowed one. Nothing was pressed either way.
   */
  get(drive: string, fitsBeside?: boolean | null): boolean {
    const persisted = readPersisted(drive);
    if (persisted !== null) return persisted;
    if (fitsBeside === false) return false;
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
