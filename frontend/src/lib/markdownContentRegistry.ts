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
 * between standalone tag saves and editor autosaves.
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
   * update on the editor side, which dispatches into the editor and
   * arms its autosave debounce — single writer, single etag.
   */
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
   * Fire a "save success" notification for `fileId`. Subscribers via
   * `subscribeSaved(fileId, fn)` get called so the file-detail host
   * can refetch `File.tags` (the editor's autosave wrote
   * frontmatter to disk; the projected `File.tags` resync follows
   * shortly via the addon's `resync-tags` endpoint or the scanner).
   *
   * Phase 3 review follow-up (hako 0RnZ1KdtomAfIJPLAGIHA): in
   * content-mode the inspector chip group does not own the save
   * path, so its `onSaveSuccess` was unwired. Editors should call
   * this after a successful PUT so the host UI doesn't sit on stale
   * `file.tags` until the next navigation.
   */
  notifySaved(fileId: string): void {
    const subs = saveListeners.get(fileId);
    if (!subs) return;
    for (const fn of subs) fn();
  },

  /**
   * Subscribe to save-success notifications for a single fileId. The
   * subscription is per-fileId (not global) so a host only re-renders
   * when its own file is saved. Returns a dispose function callers
   * MUST invoke on unmount / fileId change.
   */
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

  /**
   * Test helper. Drops every entry *and* every subscriber. Silent
   * (no notify) so suite teardown does not ripple into the next
   * test's spies.
   */
  reset(): void {
    entries.clear();
    listeners.clear();
    saveListeners.clear();
  },
};
