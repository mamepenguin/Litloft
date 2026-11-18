"use client";

/**
 * Set while a drive's `DriveUnavailable` page stands in place of its routes.
 * The URL can still name a file there, and no screen behind it will draw one.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let mounted = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

export const driveUnavailableStore = {
  get(): boolean {
    return mounted > 0;
  },
  enter(): void {
    mounted += 1;
    if (mounted === 1) notify();
  },
  leave(): void {
    if (mounted === 0) return;
    mounted -= 1;
    if (mounted === 0) notify();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Test helper. */
  reset(): void {
    mounted = 0;
    listeners.clear();
  },
};
