"use client";

export interface MarkdownContentEntry {
  getContent: () => string;
  /** Arms the editor's autosave debounce — single writer, single etag. */
  setContent: (next: string) => void;
}

type Listener = () => void;
type SaveListener = () => void;

const listeners = new Set<Listener>();
const entries = new Map<string, MarkdownContentEntry>();
const saveListeners = new Map<string, Set<SaveListener>>();

function emit(): void {
  for (const l of listeners) l();
}

export const markdownContentRegistry = {
  register(fileId: string, entry: MarkdownContentEntry): () => void {
    entries.set(fileId, entry);
    emit();
    return () => {
      // Only unregister if the slot still holds *this* entry.
      // Otherwise a delayed cleanup from a remounted Editor could
      // wipe out the registration its own mount just installed
      // (StrictMode double-effect / fileId change).
      if (entries.get(fileId) === entry) {
        entries.delete(fileId);
        emit();
      }
    };
  },

  lookup(fileId: string): MarkdownContentEntry | null {
    return entries.get(fileId) ?? null;
  },

  touchContent(fileId: string): void {
    if (!entries.has(fileId)) return;
    emit();
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  /**
   * In content-mode the inspector chip group does not own the save path, so
   * editors call this after a successful PUT or the host UI sits on stale
   * `file.tags` until the next navigation.
   */
  notifySaved(fileId: string): void {
    const subs = saveListeners.get(fileId);
    if (!subs) return;
    for (const fn of subs) fn();
  },

  subscribeSaved(fileId: string, fn: SaveListener): () => void {
    let set = saveListeners.get(fileId);
    if (!set) {
      set = new Set();
      saveListeners.set(fileId, set);
    }
    set.add(fn);
    return () => {
      const current = saveListeners.get(fileId);
      if (!current) return;
      current.delete(fn);
      if (current.size === 0) saveListeners.delete(fileId);
    };
  },

  /** Silent (no notify) so suite teardown does not ripple into the next test's spies. */
  reset(): void {
    entries.clear();
    listeners.clear();
    saveListeners.clear();
  },
};
