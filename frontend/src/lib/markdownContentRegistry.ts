"use client";

/**
 * Cross-component Markdown editor content ledger.
 *
 * Phase 3.5 of the Markdown Document Layout spec
 * (docs/superpowers/specs/2026-05-10-markdown-document-layout.md §D2,
 * hako ZWLqXgdTwt9le4dAI3U8C). The Knowledge Editor (in the
 * `addons/knowledge` submodule) registers its `(getContent, setContent)`
 * pair so the inspector's `EditableTagChips` (in core) can edit the
 * same `.md` source through content-mode — eliminating the etag race
 * between standalone tag saves and editor textarea autosaves.
 *
 * Same shape as `dirtyRegistry`:
 *   - Module-level singleton + listener Set for `useSyncExternalStore`
 *   - No persistence (in-memory only — content is page-local)
 *   - Re-registering the same fileId replaces the prior entry, so the
 *     editor's remount-on-fileId-change effect doesn't leak stale
 *     closures.
 *
 * Boundary contract:
 *   - The addon (Editor.tsx) only registers itself; it does NOT
 *     import any inspector-side code.
 *   - Core (FileDetailContent / EditableTagChips wiring) only reads
 *     the registry; it does NOT import any addon code.
 *   - When `lookup(fileId)` returns `null`, callers fall back to
 *     the previous standalone behaviour. This keeps the system
 *     graceful when the addon is disabled or unmounted.
 */

export interface MarkdownContentEntry {
  /** Read the editor's current in-memory `content`. */
  getContent: () => string;
  /**
   * Mutate the editor's in-memory `content`. Triggers React state
   * update on the editor side, which re-renders the textarea and
   * arms the editor's autosave debounce — single writer, single etag.
   */
  setContent: (next: string) => void;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const entries = new Map<string, MarkdownContentEntry>();

function emit(): void {
  for (const l of listeners) l();
}

export const markdownContentRegistry = {
  /**
   * Register a `(getContent, setContent)` pair for a fileId. Returns
   * a dispose function the caller MUST invoke on unmount (and on
   * fileId change before re-registering, so a stale closure never
   * outlives its component).
   *
   * If the same fileId is registered twice without disposing first,
   * the new entry replaces the old. Mirrors the editor's actual
   * lifecycle: the Editor's content-fetching effect is keyed on
   * fileId, so a navigation fires the new effect before the cleanup
   * of the previous one runs in StrictMode.
   */
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

  /** Look up an entry by fileId, or null if none registered. */
  lookup(fileId: string): MarkdownContentEntry | null {
    return entries.get(fileId) ?? null;
  },

  /**
   * Emit a content-change pulse to subscribers without touching the
   * entry map. Editors call this whenever their underlying `content`
   * state changes (typing, programmatic setContent, etc.) so
   * subscribers like FileDetailContent re-read `getContent()` and
   * pass the fresh string down to the inspector's content-mode tag
   * chips.
   *
   * No-op when no entry is registered for `fileId` — saves a wasted
   * notification when an unrelated tab calls touch.
   */
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
   * Test helper. Drops every entry *and* every subscriber. Silent
   * (no notify) so suite teardown does not ripple into the next
   * test's spies.
   */
  reset(): void {
    entries.clear();
    listeners.clear();
  },
};
