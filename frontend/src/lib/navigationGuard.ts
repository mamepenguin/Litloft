"use client";

import { dirtyRegistry } from "./dirtyRegistry";

/**
 * Single-pending design: only one navigation can be queued at a
 * time. A second ``request(...)`` while a dialog is open replaces
 * the previous queued action.
 *
 * Whole-tab dirty test: ``dirtyRegistry.isDirty()`` is called with
 * no arguments so any dirty source anywhere in the tab triggers
 * the guard.
 */

type PendingFn = () => void;
type Listener = () => void;

interface PendingNavigation {
  fn: PendingFn;
}

let pending: PendingNavigation | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export const navigationGuard = {
  request(fn: PendingFn): void {
    if (!dirtyRegistry.isDirty()) {
      fn();
      return;
    }
    pending = { fn };
    emit();
  },

  confirm(): void {
    const current = pending;
    pending = null;
    if (current) {
      current.fn();
      emit();
    }
  },

  cancel(): void {
    if (!pending) return;
    pending = null;
    emit();
  },

  getPending(): PendingNavigation | null {
    return pending;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Test helper. */
  reset(): void {
    pending = null;
    listeners.clear();
  },
};

export type { PendingNavigation };
