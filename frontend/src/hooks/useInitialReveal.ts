"use client";

/**
 * Strict-separation (Craft-style) mode: the tree is the user's
 * hand-built map. We never auto-expand ancestors of the URL location,
 * not on first mount and not on navigation. The tree's expansion state
 * is whatever `useTreeExpansion` has persisted in localStorage from
 * the user's own clicks.
 *
 * Rationale (brainstorm 2026-05-12): auto-expanding on first visit
 * to a deep path "occupies" the tree with large sibling folders the
 * user did not ask to see. The breadcrumb above the right pane shows
 * the current location, and `useTreeAutoReveal` scrolls the matching
 * row into view *when its ancestors happen to be expanded* — so the
 * orientation signal is preserved without imposing a structural
 * change on the tree.
 *
 * The hook is kept (with this no-op body) so the call site in
 * `FolderTreePane` stays untouched: reverting to auto-expansion is a
 * one-file change here, not a structural edit. See
 * docs/superpowers/specs/2026-05-09-tree-pane-separated-interaction.md
 * and hako `1m4EhzyjWms6nUimi_0sO` for the longer history.
 */
export function useInitialReveal(
  _currentFolderPath: string | undefined,
  _expand: (path: string) => void,
): void {
  // intentional no-op
}
