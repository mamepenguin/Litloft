"use client";

import { useSyncExternalStore } from "react";

import { dirtyRegistry } from "@/lib/dirtyRegistry";

/**
 * Reactive read-side companion to {@link useDirty}.
 *
 * - ``useIsDirty()`` (no argument) is the global "anything dirty in
 *   this tab" gauge that the navigation guard / ``beforeunload``
 *   listener watches.
 * - ``useIsDirty(fileId)`` narrows to a single file — useful when a
 *   chip / status widget on the right pane wants to flip into a
 *   "saving…" affordance only for the currently shown file.
 *
 * Server snapshot returns ``false`` so SSR doesn't claim there is
 * unsaved work the user has yet to type.
 */
export function useIsDirty(fileId?: string): boolean {
  return useSyncExternalStore(
    dirtyRegistry.subscribe,
    () => dirtyRegistry.isDirty(fileId),
    () => false,
  );
}
