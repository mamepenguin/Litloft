"use client";

/**
 * Cross-component dirty-state ledger.
 *
 * Phase 2 of the right-pane equivalence spec
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md, plan
 * hako RGstVXy42Bfw-FlpP8hCx) adds inline editing of ``.md`` files
 * inside the 2-pane right pane. Once that lands, ``useFileNav``'s
 * arrow-key navigation, the folder tree's row clicks, and the
 * browser's back button all need to know whether *any* in-flight
 * change would be lost before they fire — without coupling the
 * editor's internals into the navigation hooks.
 *
 * The store is intentionally minimal:
 *   - Module-level singleton + ``useSyncExternalStore``-friendly
 *     subscribe API (same shape as ``treeEnabledStore``).
 *   - No persistence — dirty is always relative to *this* tab's
 *     in-memory edits. localStorage would resurface phantom dirty
 *     states after a page reload, which is the opposite of what we
 *     want (reload completes whatever autosave was pending).
 *   - Tracks ``(fileId, source)`` pairs so the same file can have
 *     multiple concurrent dirty contributors (Phase 2 ships only the
 *     ``"knowledge-editor"`` source; ``"comment"`` and ``"tag-chips"``
 *     are reserved for the obvious follow-ups in `HpJeMjaVLrheOUwPchh-P`).
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

function key(fileId: string, source: DirtySource): string {
  return `${fileId}::${source}`;
}

export const dirtyRegistry = {
  /**
   * Mark or clear a single ``(fileId, source)`` pair. No-op if the
   * recorded value already matches ``dirty`` so that publishing the
   * same value on every keystroke does not stampede subscribers.
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

  /**
   * Truthy if the given file has any dirty source. Pass no fileId to
   * ask "is anything dirty in this tab" — the form ``useFileNav`` and
   * the global ``beforeunload`` guard will reach for.
   */
  isDirty(fileId?: string): boolean {
    if (fileId === undefined) return state.size > 0;
    const set = state.get(fileId);
    return set !== undefined && set.size > 0;
  },

  /**
   * Snapshot of every currently-dirty pair, useful when a confirm
   * dialog wants to spell out what would be discarded.
   */
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
   * Test helper. Drops every recorded pair *and* every subscriber.
   * Intentionally silent (no notify) so suite teardown doesn't ripple
   * into the next test's spies.
   */
  reset(): void {
    state.clear();
    listeners.clear();
  },
};

export type { DirtyEntry };
