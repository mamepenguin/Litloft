"use client";

/**
 * A left pane shown for the visit because a queue started, while
 * `tree:enabled:{drive}` is off. Nothing here is written to storage: the
 * visit ends with the page, and the button only hides or re-shows it.
 */

type Listener = () => void;

export interface TreeVisitState {
  active: boolean;
  hidden: boolean;
}

const EMPTY: TreeVisitState = { active: false, hidden: false };

const listeners = new Set<Listener>();
const states = new Map<string, TreeVisitState>();

function update(drive: string, next: TreeVisitState): void {
  const current = states.get(drive) ?? EMPTY;
  if (next.active === current.active && next.hidden === current.hidden) return;
  states.set(drive, next);
  for (const listener of listeners) listener();
}

export const treeVisitStore = {
  get(drive: string): TreeVisitState {
    return states.get(drive) ?? EMPTY;
  },
  show(drive: string): void {
    update(drive, { active: true, hidden: false });
  },
  toggle(drive: string): void {
    const current = states.get(drive) ?? EMPTY;
    if (!current.active) return;
    update(drive, { active: true, hidden: !current.hidden });
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
