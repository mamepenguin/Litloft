import type { ArchiveEntry } from "@/types";

/**
 * A store rather than a plain object because the level changes while both
 * are mounted, and state read through a prop is one render behind the
 * panel that just moved it.
 */
export interface ArchiveState {
  /** Every entry in the archive, at every depth. */
  entries: ArchiveEntry[];
  /** The level the canvas is showing; "" is the archive root. */
  currentPath: string;
}

export interface ArchiveController {
  getState(): ArchiveState;
  /**
   * Go to an entry: descend into a directory, or open a leaf the viewer
   * can show. A leaf it cannot show moves to the level holding it, so
   * the press still lands somewhere.
   */
  open(entry: ArchiveEntry): void;
  subscribe(listener: () => void): () => void;
}

export class ArchiveContentsStore implements ArchiveController {
  private state: ArchiveState = { entries: [], currentPath: "" };
  private listeners = new Set<() => void>();
  private opener: (entry: ArchiveEntry) => void = () => {};

  getState(): ArchiveState {
    return this.state;
  }

  /** A new object every time, so `useSyncExternalStore`'s identity check
   *  is the whole comparison. */
  set(next: Partial<ArchiveState>) {
    const merged = { ...this.state, ...next };
    if (
      merged.entries === this.state.entries &&
      merged.currentPath === this.state.currentPath
    ) {
      return;
    }
    this.state = merged;
    this.listeners.forEach((l) => l());
  }

  /** The viewer's own press handler, so the index and a click on the
   *  canvas take the same path into the viewer's state machine. */
  setOpener(opener: (entry: ArchiveEntry) => void) {
    this.opener = opener;
  }

  open(entry: ArchiveEntry) {
    this.opener(entry);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
