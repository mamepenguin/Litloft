"use client";

/**
 * We never auto-expand ancestors of the URL location: auto-expanding on
 * first visit to a deep path "occupies" the tree with large sibling
 * folders the user did not ask to see.
 */
export function useInitialReveal(
  _currentFolderPath: string | undefined,
  _expand: (path: string) => void,
): void {
  // intentional no-op
}
