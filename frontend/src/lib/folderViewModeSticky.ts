"use client";

import type { ViewMode } from "@/types";

/**
 * Module-level "session sticky" store for the folder view mode (B1).
 *
 * Folder navigation in this app crosses Next.js page boundaries
 * (`/drive/[name]/page.tsx` ↔ `/drive/[name]/[...path]/page.tsx`),
 * so a `useState` inside `useFolderViewMode` resets every time the
 * user clicks a folder. A module-level store survives those mounts
 * but still resets on a real reload (the JS module is re-evaluated)
 * — exactly the user's "session" semantics from the Phase 3 design.
 *
 * Hako: qj0MY0GVzQqXttIG54_9-
 */

type Listener = () => void;

interface StickyState {
  drive: string;
  mode: ViewMode;
}

let _state: StickyState | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const folderViewModeStickyStore = {
  get(): StickyState | null {
    return _state;
  },
  /**
   * Read the sticky mode for a specific drive. Returns null if no
   * sticky is set or it belongs to a different drive (drive change
   * is treated as a new session).
   */
  getModeForDrive(drive: string): ViewMode | null {
    if (_state == null || _state.drive !== drive) return null;
    return _state.mode;
  },
  set(next: StickyState | null): void {
    if (
      (_state == null && next == null) ||
      (_state != null &&
        next != null &&
        _state.drive === next.drive &&
        _state.mode === next.mode)
    ) {
      return;
    }
    _state = next;
    emit();
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Test helper — clears the store and listeners. */
  reset(): void {
    _state = null;
    listeners.clear();
  },
};
