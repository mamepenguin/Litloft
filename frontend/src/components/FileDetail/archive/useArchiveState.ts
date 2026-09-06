"use client";

import { useSyncExternalStore } from "react";

import type { ArchiveController, ArchiveState } from "@/lib/archiveController";

/**
 * The store's state, or the state of an archive nobody has opened.
 *
 * The shell asks before it has a controller — most files never will —
 * so the empty answer is a value rather than a branch at every call
 * site. Held constant so `useSyncExternalStore`'s identity check does
 * not see a new object every render.
 */
const NO_ARCHIVE: ArchiveState = { entries: [], currentPath: "" };

export function useArchiveState(
  controller: ArchiveController | null,
): ArchiveState {
  return useSyncExternalStore(
    (listener) => controller?.subscribe(listener) ?? (() => {}),
    () => controller?.getState() ?? NO_ARCHIVE,
    () => controller?.getState() ?? NO_ARCHIVE,
  );
}
