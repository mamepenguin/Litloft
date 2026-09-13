"use client";

/**
 * No persistence: localStorage would resurface phantom dirty states after
 * a page reload (reload completes whatever autosave was pending).
 */

export type DirtySource = "knowledge-editor" | "comment" | "tag-chips";

interface DirtyEntry {
  fileId: string;
  source: DirtySource;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const state = new Map<string, Set<DirtySource>>();

function emit(): void {
  for (const l of listeners) l();
}

export const dirtyRegistry = {
  /**
   * No-op if the recorded value already matches ``dirty`` so that publishing
   * the same value on every keystroke does not stampede subscribers.
   */
  set(fileId: string, source: DirtySource, dirty: boolean): void {
    const existing = state.get(fileId);
    const had = existing?.has(source) ?? false;
    if (had === dirty) return;

    if (dirty) {
      const set = existing ?? new Set<DirtySource>();
      set.add(source);
      state.set(fileId, set);
    } else if (existing) {
      existing.delete(source);
      if (existing.size === 0) state.delete(fileId);
    }
    emit();
  },

  isDirty(fileId?: string): boolean {
    if (fileId === undefined) return state.size > 0;
    const set = state.get(fileId);
    return set !== undefined && set.size > 0;
  },

  list(): DirtyEntry[] {
    const out: DirtyEntry[] = [];
    for (const [fileId, sources] of state) {
      for (const source of sources) out.push({ fileId, source });
    }
    return out;
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  /**
   * Intentionally silent (no notify) so suite teardown doesn't ripple
   * into the next test's spies.
   */
  reset(): void {
    state.clear();
    listeners.clear();
  },
};

export type { DirtyEntry };
