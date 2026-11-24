"use client";

/**
 * The tab's focus state. In memory and per tab: a stored value would land the
 * reader on a header-less screen on the next visit with no memory of why.
 */

type Listener = () => void;

let focused = false;
const listeners = new Set<Listener>();

export const focusModeStore = {
  get(): boolean {
    return focused;
  },
  set(next: boolean): void {
    if (next === focused) return;
    focused = next;
    for (const listener of listeners) listener();
  },
  toggle(): void {
    focusModeStore.set(!focused);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Test helper. */
  reset(): void {
    focused = false;
    listeners.clear();
  },
};
