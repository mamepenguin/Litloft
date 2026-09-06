import type { ArchiveEntry } from "@/types";

/**
 * What the archive's canvas viewer publishes upward, and what the
 * inspector's page list presses back.
 *
 * Same shape and same reason as `PdfController`: the two live in
 * different subtrees — the viewer is the canvas, the index is a tab in
 * the inspector — and only the viewer has read the zip's directory. A
 * store rather than a plain object because the level changes while both
 * are mounted, and state read through a prop is one render behind the
 * panel that just moved it.
 *
 * The index is deliberately the whole archive, not the level. The
 * canvas answers "what is in here"; a 2439-file source zip needs
 * something that answers "where is `main.dart`", and walking down to it
 * one directory at a time is not that.
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
