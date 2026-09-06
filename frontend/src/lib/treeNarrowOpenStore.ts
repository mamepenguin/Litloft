"use client";

/**
 * "Show me the tree here, now" — below the width where it fits beside the
 * content.
 *
 * Deliberately **not** persisted. `tree:enabled:{drive}` is the reader's
 * setting and survives everything; this is a request about the screen they
 * are looking at right now, and carrying it to the next visit would put
 * them back on a full-viewport tree with their folder behind it, which is
 * the state MB-5 exists to prevent.
 *
 * It lives in a module rather than in a component because two components
 * need it: the toolbar's toggle sets it, and the layout reads it.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
const open = new Map<string, boolean>();

export const treeNarrowOpenStore = {
  get(drive: string): boolean {
    return open.get(drive) ?? false;
  },
  set(drive: string, next: boolean): void {
    if ((open.get(drive) ?? false) === next) return;
    open.set(drive, next);
    for (const l of listeners) l();
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Test helper. */
  reset(): void {
    open.clear();
    listeners.clear();
  },
};
