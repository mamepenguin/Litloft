"use client";

/**
 * The left pane's place on a file page. In memory and per drive: a yield
 * belongs to the file page the reader is on, and `tree:enabled:{drive}` keeps
 * the setting a yield is not allowed to touch.
 */

type Listener = () => void;

export interface TreeYieldState {
  /** Collapsed for this file's inspector. */
  yielded: boolean;
  /** Brought back by the tree button on this file page. */
  reopened: boolean;
  /** A file is open in this drive's right pane. */
  filePage: boolean;
}

const EMPTY: TreeYieldState = {
  yielded: false,
  reopened: false,
  filePage: false,
};

const listeners = new Set<Listener>();
const states = new Map<string, TreeYieldState>();

function update(drive: string, patch: Partial<TreeYieldState>): void {
  const current = states.get(drive) ?? EMPTY;
  const next = { ...current, ...patch };
  if (
    next.yielded === current.yielded &&
    next.reopened === current.reopened &&
    next.filePage === current.filePage
  ) {
    return;
  }
  states.set(drive, next);
  for (const listener of listeners) listener();
}

export const treeYieldStore = {
  get(drive: string): TreeYieldState {
    return states.get(drive) ?? EMPTY;
  },
  /** The pane steps aside for this file's inspector. */
  collapse(drive: string): void {
    update(drive, { yielded: true, reopened: false });
  },
  /** The reader asks for the pane on this file page; no setting is written. */
  reopen(drive: string): void {
    update(drive, { yielded: false, reopened: true });
  },
  /** The reader hid the pane with the tree button; there is nothing to undo. */
  settle(drive: string): void {
    update(drive, { yielded: false, reopened: false });
  },
  setFilePage(drive: string, active: boolean): void {
    update(drive, { filePage: active });
  },
  clear(drive: string): void {
    if (!states.has(drive)) return;
    states.delete(drive);
    for (const listener of listeners) listener();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Test helper. */
  reset(): void {
    states.clear();
    listeners.clear();
  },
};
